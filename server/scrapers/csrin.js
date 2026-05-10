const cheerio = require('cheerio');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://cs.rin.ru/forum';
// Hardcoded path for stable temporary cookie jar persistence across API lifetimes
const cookieJarPath = path.join('/tmp', 'csrin_cookies.txt');

/**
 * Core Curl Wrapper acting as native system agent
 */
function nativeFetch(url) {
  // Standardize parameters known to survive edge verification
  const agent = 'Mozilla/5.0';
  const cmd = `curl -s -L -H "User-Agent: ${agent}" -H "Accept-Language: en-US,en;q=0.9" -b "${cookieJarPath}" -c "${cookieJarPath}" --max-time 15 "${url}"`;
  try {
    return execSync(cmd).toString('utf8');
  } catch (err) {
    console.error(`[CURL ERROR] Failed fetching ${url}:`, err.message);
    return "";
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let securityPromise = null;

/**
 * Perform state-aware initialization and solve Javascript firewall challenge natively
 */
function ensureSession() {
  if (securityPromise) return securityPromise;

  securityPromise = (async () => {
    try {
      console.log('Performing bulletproof native validation sweep for CSRIN...');
      
      // Wipe existing jar to force fresh fresh handshake for safety
      if (fs.existsSync(cookieJarPath)) {
         try { fs.unlinkSync(cookieJarPath); } catch(e) {}
      }
      
      // Create initial blank jar so the tool doesn't error
      fs.writeFileSync(cookieJarPath, '');

      // Phase 1: Collect anti-bot challenge
      const rawBody = nativeFetch(`${BASE_URL}/index.php`);
      
      if (rawBody.includes('Board index')) {
        console.log('Session immediately valid.');
        return true;
      }
      
      const tokenMatch = rawBody.match(/securitytoken=([^;"]+)/);
      const expMatch = rawBody.match(/securitytoken_expiration=([^;"]+)/);
      
      if (!tokenMatch || !expMatch) {
         console.warn('CSRIN critical failure: Anti-bot script not found or format changed.');
         return false;
      }
      
      const t = tokenMatch[1];
      const e = expMatch[1];
      
      // Inject tokens directly into Netscape cookie structure required by cURL engine
      const netscapeRow1 = `cs.rin.ru\tTRUE\t/\tTRUE\t${e}\tsecuritytoken\t${t}\n`;
      const netscapeRow2 = `cs.rin.ru\tTRUE\t/\tTRUE\t${e}\tsecuritytoken_expiration\t${e}\n`;
      
      fs.appendFileSync(cookieJarPath, netscapeRow1);
      fs.appendFileSync(cookieJarPath, netscapeRow2);
      
      // Phase 2: Trigger edge authorization ping
      console.log('Activating security boundary gateway step...');
      nativeFetch('https://cs.rin.ru/securitycheck/forum/index.php');
      
      // Phase 3: MANDATORY propagate sync period for Nginx cache commits
      console.log('Holding thread for propagation commit (2.5s)...');
      await sleep(2500);
      
      // Phase 4: Verify final admission
      const verifiedBody = nativeFetch(`${BASE_URL}/index.php`);
      
      if (verifiedBody.includes('Board index')) {
        console.log('BULLETPROOF AUTHENTICATION SUCCESSFUL: CS.RIN Session fully persistent.');
        return true;
      }
      
      console.warn('Authorization finalized without valid session bit.');
      return false;
    } catch (err) {
      console.error('Authentication runtime exception:', err.message);
      securityPromise = null; // allow reset/retry logic
      return false;
    }
  })();
  
  return securityPromise;
}

/**
 * Standard clean pass on html elements
 */
function sanitizeHtml($) {
  $('script, iframe, ins, noscript').remove();
  $('.adsbygoogle, [class*="banner"], [class*="advert"]').remove();
  return $;
}

/**
 * Core generic list mapping from HTML row block elements to standardized objects
 */
function parseThreadRows($) {
  const threads = [];
  $('li.row, tr.row1, tr.row2, .search.post, dl.icon').each((_, element) => {
    const el = $(element);
    const titleEl = el.find('a.topictitle, .topictitle a, a[href*="viewtopic"]').first();
    const title = titleEl.text().trim();
    const link = titleEl.attr('href') || '';
    
    if (!title || !link || title.length < 3) return;
    if (title.toLowerCase().includes('privacy policy') || title.toLowerCase().includes('recommended download')) return; // filter stickies

    const tidMatch = link.match(/[?&]t=(\d+)/);
    const threadId = tidMatch ? tidMatch[1] : '';
    if (!threadId) return;

    const author = el.find('.author a, .username').first().text().trim() || 'User';
    const replies = el.find('.posts, dd.posts, .topic-posts').first().text().replace(/[^0-9]/g, '') || '0';
    const views = el.find('.views, dd.views').first().text().replace(/[^0-9]/g, '') || '0';
    
    let cleanUrl = link.startsWith('http') ? link : `${BASE_URL}/${link.replace('./', '')}`;
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
  return threads;
}

/**
 * Public routine to fetch active feed when not searching
 */
async function scrapeCsRinFeed(page = 1) {
  await ensureSession();
  try {
    const startIdx = (page - 1) * 25;
    // Steam Underground main forum ID=10
    const feedUrl = `${BASE_URL}/viewforum.php?f=10&start=${startIdx}`;
    const body = nativeFetch(feedUrl);
    
    const $ = cheerio.load(body);
    sanitizeHtml($);
    
    let threads = parseThreadRows($);
    
    // Fallback parse just in case
    if (threads.length === 0) {
      $('a[href*="viewtopic"]').each((_, element) => {
         const title = $(element).text().trim();
         const link = $(element).attr('href') || '';
         const tidMatch = link.match(/[?&]t=(\d+)/);
         if (tidMatch && title.length > 3) {
           threads.push({ id: tidMatch[1], title, link: `${BASE_URL}/${link}`, source: 'cs.rin.ru' });
         }
      });
    }

    return {
      threads: threads.slice(0, 40),
      pagination: { currentPage: page, hasNext: true, hasPrev: page > 1 },
      source: 'cs.rin.ru'
    };
  } catch(err) {
    console.error('[CSRIN Feed Error]:', err.message);
    return { threads: [], source: 'cs.rin.ru' };
  }
}

/**
 * Logic for list aggregation and processing via raw search execution
 */
async function scrapeCsRin(query, page = 1) {
  await ensureSession();
  
  // Ensure full synchronization logic has established static state
  const mainPage = nativeFetch(`${BASE_URL}/index.php`);
  const sidMatch = mainPage.match(/sid=([a-f0-9]{32})/);
  const sid = sidMatch ? sidMatch[1] : '';
  
  try {
    // Construct total search param buffer exactly replicating original schema
    const startIdx = (page - 1) * 25;
    const escapedQ = encodeURIComponent(query);
    const searchUrl = `${BASE_URL}/search.php?keywords=${escapedQ}&terms=all&fid[]=10&sc=1&sf=titleonly&sr=topics&sk=t&sd=d&st=0&ch=300&t=0&submit=Search&start=${startIdx}&sid=${sid}`;
    
    const responseBody = nativeFetch(searchUrl);

    if (!responseBody) {
       throw new Error("Null buffer response detected during target fetch.");
    }

    const $ = cheerio.load(responseBody);
    sanitizeHtml($);

    let threads = parseThreadRows($);

    // Fallback parse logic
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
    console.error('[CSRIN Scrape Error]:', err.message);
    return { threads: [], pagination: { currentPage: page }, source: 'cs.rin.ru', error: err.message };
  }
}

/**
 * Retrieves the payload details natively fetched from post identifier
 */
async function scrapeCsRinThread(threadId) {
  await ensureSession();

  try {
    const url = `${BASE_URL}/viewtopic.php?t=${threadId}`;
    const html = nativeFetch(url);
    
    if (!html) throw new Error("Failed to pull individual thread body response.");

    const $ = cheerio.load(html);
    sanitizeHtml($);

    const title = $('h2 a, h2.topic-title').first().text().trim() || $('title').text().split('•')[0].trim();
    const firstPost = $('.postbody .content, .post .content').first();
    const content = firstPost.text().trim().substring(0, 3000);

    const downloadLinks = [];
    const seen = new Set();
    
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
    console.error('[CSRIN Thread View Error]:', err.message);
    return { id: threadId, error: err.message, source: 'cs.rin.ru' };
  }
}

module.exports = {
  scrapeCsRin,
  scrapeCsRinThread,
  scrapeCsRinFeed
};
