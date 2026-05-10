const axios = require('axios');
const cheerio = require('cheerio');
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

const BASE_URL = 'https://cs.rin.ru/forum';

// Common headers
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive'
};

// Create a persistant cookie enabled axios client
const jar = new tough.CookieJar();
const client = wrapper(axios.create({
  jar,
  withCredentials: true,
  headers: HEADERS,
  timeout: 20000,
  validateStatus: () => true // Never throw on non-200 so we can inspect body
}));

let securityPromise = null;

/**
 * Solution for CS.RIN's custom javascript bot challenge
 */
function ensureSession() {
  if (securityPromise) return securityPromise;

  securityPromise = (async () => {
    try {
      console.log('Initializing CSRIN session with security token...');
      
      // Step 1: Try to visit main index, which gives 401 and a challenge script
      let response = await client.get(`${BASE_URL}/index.php`);
      
      if (response.status === 200 && response.data.includes('Board index')) {
        console.log('CSRIN Session was already valid.');
        return true;
      }

    // Step 2: Extract security tokens from JS inline text
    const tokenMatch = response.data.match(/securitytoken=(.*?);/);
    const expirationMatch = response.data.match(/securitytoken_expiration=(.*?);/);
    
    if (tokenMatch && expirationMatch) {
      const token = tokenMatch[1];
      const exp = expirationMatch[1];
      
      // Manually place inside the CookieJar
      await jar.setCookie(`securitytoken=${token}; Path=/; Secure`, 'https://cs.rin.ru');
      await jar.setCookie(`securitytoken_expiration=${exp}; Path=/; Secure`, 'https://cs.rin.ru');
      
      // Step 3: Request the validation URI
      console.log('Attempting security check authorization...');
      await client.get('https://cs.rin.ru/securitycheck/forum/index.php');
      
      // Step 4: Verify access
      const checkFinal = await client.get(`${BASE_URL}/index.php`);
      if (checkFinal.status === 200) {
        console.log('Successfully passed CSRIN security challenge.');
        return true;
      }
    }
      return false;
    } catch (err) {
      console.warn('CS.RIN session setup failed:', err.message);
      securityPromise = null; // Allow retry on failure
      return false;
    }
  })();
  
  return securityPromise;
}

/**
 * Sanitize HTML
 */
function sanitizeHtml($) {
  $('script, iframe, ins, noscript').remove();
  $('.adsbygoogle, [class*="banner"], [class*="advert"]').remove();
  return $;
}

/**
 * Search cs.rin.ru
 */
async function scrapeCsRin(query, page = 1) {
  await ensureSession();
  
  // Locate a Session ID from current cookie jar or main page to pass directly
  // (Search usually likes explicit sid in query param if possible)
  const mainPage = await client.get(`${BASE_URL}/index.php`);
  const sidMatch = mainPage.data.match(/sid=([a-f0-9]{32})/);
  const sid = sidMatch ? sidMatch[1] : '';
  
  try {
    const response = await client.get(`${BASE_URL}/search.php`, {
      params: {
        keywords: query,
        terms: 'all',
        fid: [10],
        sc: 1,
        sf: 'titleonly',
        sr: 'topics',
        sk: 't',
        sd: 'd',
        st: 0,
        ch: 300,
        t: 0,
        submit: 'Search',
        start: (page - 1) * 25,
        sid: sid
      }
    });

    if (response.status !== 200) {
       console.log(`CSRIN search gave non-200: ${response.status}`);
    }

    const $ = cheerio.load(response.data);
    sanitizeHtml($);

    const threads = [];

    // Generic PHPBB search rows
    $('li.row, tr.row1, tr.row2, .search.post').each((_, element) => {
      const el = $(element);
      const titleEl = el.find('a.topictitle, .topictitle a, a[href*="viewtopic"]').first();
      const title = titleEl.text().trim();
      const link = titleEl.attr('href') || '';
      
      if (!title || !link) return;

      const tidMatch = link.match(/[?&]t=(\d+)/);
      const threadId = tidMatch ? tidMatch[1] : '';
      if (!threadId) return;

      const author = el.find('.author a, .username').first().text().trim();
      const replies = el.find('.posts, dd.posts').first().text().replace(/[^0-9]/g, '') || '0';
      const views = el.find('.views, dd.views').first().text().replace(/[^0-9]/g, '') || '0';
      
      // Try standard clean link builders
      let cleanUrl = link.startsWith('http') ? link : `${BASE_URL}/${link.replace('./', '')}`;
      // Strip SID from output links to keep it user-agnostic
      cleanUrl = cleanUrl.replace(/[?&]sid=[a-f0-9]{32}/, '');

      threads.push({
        id: threadId,
        title,
        link: cleanUrl,
        author,
        replies: parseInt(replies) || 0,
        views: parseInt(views) || 0,
        lastPost: '',
        source: 'cs.rin.ru'
      });
    });

    // Fallback parse
    if (threads.length === 0) {
      $('a[href*="viewtopic"]').each((_, element) => {
         const el = $(element);
         const title = el.text().trim();
         const link = el.attr('href') || '';
         if (title.length < 4 || title.toLowerCase().startsWith('re:')) return;
         
         const tidMatch = link.match(/[?&]t=(\d+)/);
         const threadId = tidMatch ? tidMatch[1] : '';
         if (!threadId || threads.find(t => t.id === threadId)) return;
         
         let cleanUrl = link.startsWith('http') ? link : `${BASE_URL}/${link.replace('./', '')}`;
         cleanUrl = cleanUrl.replace(/[?&]sid=[a-f0-9]{32}/, '');

         threads.push({
           id: threadId, title, link: cleanUrl, source: 'cs.rin.ru', replies: 0, views: 0
         });
      });
    }

    return {
      threads: threads.slice(0, 40),
      query,
      pagination: {
        currentPage: page,
        hasNext: threads.length >= 20,
        hasPrev: page > 1
      },
      source: 'cs.rin.ru'
    };
  } catch (err) {
    console.error('CS.RIN Error:', err.message);
    return { threads: [], pagination: { currentPage: page }, source: 'cs.rin.ru', error: err.message };
  }
}

/**
 * Detail view
 */
async function scrapeCsRinThread(threadId) {
  await ensureSession();

  try {
    const url = `${BASE_URL}/viewtopic.php?t=${threadId}`;
    const resp = await client.get(url);
    
    const $ = cheerio.load(resp.data);
    sanitizeHtml($);

    const title = $('h2 a, h2.topic-title').first().text().trim() || $('title').text().split('•')[0].trim();
    const firstPost = $('.postbody .content, .post .content').first();
    const content = firstPost.text().trim().substring(0, 3000);

    const downloadLinks = [];
    const seen = new Set();
    
    // Grab every URL potentially housing magnet/torrents
    firstPost.find('a[href]').each((_, el) => {
       const href = $(el).attr('href') || '';
       const txt = $(el).text().trim().toLowerCase();
       
       if (!href || seen.has(href)) return;
       
       const isDl = href.includes('mega.') || href.includes('drive.google') || href.includes('mediafire') || 
                    href.includes('pixeldrain') || href.includes('1fichier') || href.includes('gofile') ||
                    href.includes('magnet:') || href.includes('.torrent') || href.includes('crack');
                    
       if (isDl || txt.includes('download') || txt.includes('скачать')) {
          seen.add(href);
          let type = 'direct';
          if (href.includes('magnet:')) type = 'magnet';
          else if (href.includes('.torrent')) type = 'torrent';
          
          downloadLinks.push({
             url: href,
             text: $(el).text().trim() || 'Download',
             type
          });
       }
    });

    return {
      id: threadId,
      title,
      link: url,
      content,
      downloadLinks,
      source: 'cs.rin.ru'
    };
  } catch (err) {
    return { id: threadId, error: err.message, source: 'cs.rin.ru' };
  }
}

module.exports = {
  scrapeCsRin,
  scrapeCsRinThread
};
