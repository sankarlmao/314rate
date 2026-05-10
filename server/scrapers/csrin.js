const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://cs.rin.ru/forum';

// Common headers
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive'
};

// Cookie jar for session management
let sessionCookie = '';

/**
 * Login to cs.rin.ru (guest access or with credentials)
 */
async function ensureSession() {
  if (sessionCookie) return;

  try {
    // Try to get a session by visiting the forum
    const response = await axios.get(`${BASE_URL}/viewforum.php?f=10`, {
      headers: HEADERS,
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: (status) => status < 500
    });

    // Extract session cookie
    const cookies = response.headers['set-cookie'];
    if (cookies) {
      sessionCookie = cookies.map(c => c.split(';')[0]).join('; ');
    }
  } catch (err) {
    console.warn('CS.RIN session init failed:', err.message);
  }
}

/**
 * Sanitize HTML from cs.rin.ru
 */
function sanitizeHtml($) {
  $('script').remove();
  $('iframe').remove();
  $('ins').remove();
  $('.adsbygoogle').remove();
  $('[class*="banner"]').remove();
  $('[class*="advert"]').remove();
  $('noscript').remove();
  return $;
}

/**
 * Search cs.rin.ru forum for game threads
 * Main game section is forum ID 10 (Main Forum for game releases)
 */
async function scrapeCsRin(query, page = 1) {
  await ensureSession();

  // cs.rin.ru uses phpBB search
  // Forum 10 = "Main Forum" where game threads are posted
  const searchUrl = `${BASE_URL}/search.php`;
  
  try {
    const response = await axios.get(searchUrl, {
      params: {
        keywords: query,
        terms: 'all',
        author: '',
        fid: [10], // Main Forum
        sc: 1,
        sf: 'titleonly',
        sr: 'topics',
        sk: 't',
        sd: 'd',
        st: 0,
        ch: 300,
        t: 0,
        submit: 'Search',
        start: (page - 1) * 25
      },
      headers: {
        ...HEADERS,
        Cookie: sessionCookie
      },
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: (status) => status < 500
    });

    const $ = cheerio.load(response.data);
    sanitizeHtml($);

    const threads = [];

    // Parse search results - phpBB format
    $('li.row, .topiclist .row, tr.row1, tr.row2, .search-results .row').each((_, element) => {
      const el = $(element);
      
      const titleEl = el.find('a.topictitle, .topictitle a, a[href*="viewtopic"]').first();
      const title = titleEl.text().trim();
      const link = titleEl.attr('href') || '';
      
      if (!title || !link) return;

      // Extract thread ID
      const tidMatch = link.match(/[?&]t=(\d+)/);
      const threadId = tidMatch ? tidMatch[1] : '';

      // Extract author
      const author = el.find('.author a, .username, .responsive-show a').first().text().trim();

      // Extract reply count
      const replies = el.find('.posts, dd.posts').text().trim();

      // Extract views
      const views = el.find('.views, dd.views').text().trim();

      // Extract last post date
      const lastPost = el.find('.lastpost time, .lastpost .responsive-show').first().text().trim();

      const fullLink = link.startsWith('http') ? link : `${BASE_URL}/${link.replace('./', '')}`;

      threads.push({
        id: threadId,
        title,
        link: fullLink,
        author,
        replies: parseInt(replies) || 0,
        views: parseInt(views.replace(/,/g, '')) || 0,
        lastPost,
        source: 'cs.rin.ru'
      });
    });

    // Alternative parsing for different phpBB layouts
    if (threads.length === 0) {
      $('a[href*="viewtopic"]').each((_, element) => {
        const el = $(element);
        const title = el.text().trim();
        const link = el.attr('href') || '';
        
        if (!title || title.length < 3) return;
        if (title.toLowerCase().includes('re:')) return; // Skip reply links

        const tidMatch = link.match(/[?&]t=(\d+)/);
        const threadId = tidMatch ? tidMatch[1] : '';
        if (!threadId) return;

        // Avoid duplicates
        if (threads.find(t => t.id === threadId)) return;

        const fullLink = link.startsWith('http') ? link : `${BASE_URL}/${link.replace('./', '')}`;

        threads.push({
          id: threadId,
          title,
          link: fullLink,
          author: '',
          replies: 0,
          views: 0,
          lastPost: '',
          source: 'cs.rin.ru'
        });
      });
    }

    return {
      threads,
      query,
      pagination: {
        currentPage: page,
        hasNext: threads.length >= 25,
        hasPrev: page > 1
      },
      source: 'cs.rin.ru'
    };
  } catch (err) {
    console.error('CS.RIN search failed:', err.message);
    // Return empty results instead of throwing
    return {
      threads: [],
      query,
      pagination: { currentPage: page, hasNext: false, hasPrev: false },
      source: 'cs.rin.ru',
      error: 'Forum may require authentication or is temporarily unavailable'
    };
  }
}

/**
 * Scrape a specific thread from cs.rin.ru
 */
async function scrapeCsRinThread(threadId) {
  await ensureSession();

  try {
    const url = `${BASE_URL}/viewtopic.php?t=${threadId}`;
    
    const response = await axios.get(url, {
      headers: {
        ...HEADERS,
        Cookie: sessionCookie
      },
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: (status) => status < 500
    });

    const $ = cheerio.load(response.data);
    sanitizeHtml($);

    const title = $('h2 a, h2, .topic-title').first().text().trim();

    // Extract first post content (usually has download links)
    const firstPost = $('.post .content, .postbody .content, .post_text').first();
    const content = firstPost.text().trim().substring(0, 3000);

    // Extract all download links from the thread
    const downloadLinks = [];
    firstPost.find('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();

      if (href.includes('mega.') || href.includes('1fichier') ||
          href.includes('zippyshare') || href.includes('drive.google') ||
          href.includes('mediafire') || href.includes('pixeldrain') ||
          href.includes('gofile') || href.includes('buzzheavier') ||
          href.includes('filecrypt') || href.includes('.torrent') ||
          href.includes('magnet:') || href.includes('disk.yandex') ||
          href.includes('uploadhaven') || href.includes('datanodes')) {
        downloadLinks.push({
          url: href,
          text: text || 'Download',
          type: href.includes('magnet:') ? 'magnet' : href.includes('.torrent') ? 'torrent' : 'direct'
        });
      }
    });

    // Extract images
    const images = [];
    firstPost.find('img[src]').each((_, el) => {
      const src = $(el).attr('src') || '';
      if (src && !src.includes('smilies') && !src.includes('avatar') && !src.includes('icon')) {
        images.push(src.startsWith('http') ? src : `${BASE_URL}/${src}`);
      }
    });

    return {
      id: threadId,
      title,
      link: url,
      content,
      downloadLinks,
      images: images.slice(0, 10),
      source: 'cs.rin.ru'
    };
  } catch (err) {
    console.error('CS.RIN thread fetch failed:', err.message);
    return {
      id: threadId,
      title: 'Thread unavailable',
      link: `${BASE_URL}/viewtopic.php?t=${threadId}`,
      content: '',
      downloadLinks: [],
      images: [],
      source: 'cs.rin.ru',
      error: 'Thread may require authentication or is temporarily unavailable'
    };
  }
}

module.exports = {
  scrapeCsRin,
  scrapeCsRinThread
};
