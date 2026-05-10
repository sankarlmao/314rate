const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

const BASE_URL = 'https://online-fix.me';

// Common headers to avoid bot detection
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://online-fix.me/',
  'Connection': 'keep-alive'
};

// Category mapping
const CATEGORIES = {
  'all': '',
  'action': 'action',
  'adventures': 'adventures',
  'horror': 'horror',
  'indie': 'indie',
  'multiplayer': 'multiplayer',
  'officialservers': 'officialservers',
  'puzzles': 'puzzles',
  'racing': 'racing',
  'rpg': 'rpg',
  'sandbox': 'sandbox',
  'shooter': 'shooter',
  'simulator': 'simulator',
  'sport': 'sport',
  'strategy': 'strategy',
  'survival': 'survival',
  'vr': 'vr-igry'
};

/**
 * Strip ads and tracking elements from HTML
 */
function sanitizeHtml($) {
  // Remove ad containers, scripts, iframes, tracking pixels
  $('script').remove();
  $('iframe').remove();
  $('ins').remove(); // Google ads
  $('.adsbygoogle').remove();
  $('[class*="banner"]').remove();
  $('[class*="advert"]').remove();
  $('[class*="popup"]').remove();
  $('[id*="banner"]').remove();
  $('[id*="advert"]').remove();
  $('[class*="clickunder"]').remove();
  $('noscript').remove();
  $('[onclick]').removeAttr('onclick');
  $('a[target="_blank"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    // Remove external ad links but keep legitimate links
    if (!href.includes('online-fix.me') && !href.includes('mega.') && !href.includes('1fichier') && 
        !href.includes('torrent') && !href.includes('magnet') && !href.includes('drive.google') &&
        !href.includes('mediafire') && !href.includes('pixeldrain') && !href.includes('gofile') &&
        !href.includes('buzzheavier')) {
      $(el).remove();
    }
  });
  return $;
}

/**
 * Extract clean game title (remove Russian text markers)
 */
function cleanTitle(title) {
  if (!title) return '';
  // Remove common Russian suffixes
  return title
    .replace(/\s*по сети\s*/gi, '')
    .replace(/\s*онлайн\s*/gi, '')
    .replace(/\s*Online\s*$/gi, ' Online')
    .replace(/\s*[а-яА-ЯёЁ]+\s*$/g, '')
    .trim();
}

/**
 * Scrape game listings from online-fix.me
 */
async function scrapeOnlineFix(page = 1, category = '', searchQuery = '') {
  let url;
  
  if (searchQuery) {
    // Use the site's search functionality
    url = `${BASE_URL}/?do=search&subaction=search&search_start=${page}&full_search=0&result_from=${(page - 1) * 20 + 1}&story=${encodeURIComponent(searchQuery)}`;
  } else if (category && CATEGORIES[category]) {
    url = page > 1 
      ? `${BASE_URL}/games/${CATEGORIES[category]}/page/${page}/`
      : `${BASE_URL}/games/${CATEGORIES[category]}/`;
  } else {
    url = page > 1 
      ? `${BASE_URL}/games/page/${page}/`
      : `${BASE_URL}/games/`;
  }

  const response = await axios.get(url, { 
    headers: HEADERS, 
    timeout: 15000,
    maxRedirects: 3,
    responseType: 'arraybuffer'
  });

  // Decode windows-1251 to utf-8
  const html = iconv.decode(Buffer.from(response.data), 'win1251');
  const $ = cheerio.load(html);
  sanitizeHtml($);

  const games = [];

  // Parse game entries — actual structure: <article class="news"><div class="article clr">
  $('article.news').each((_, element) => {
    const el = $(element);
    
    // Title is in h2.title inside an <a>
    const titleLink = el.find('a[href*="/games/"]').first();
    const titleEl = el.find('h2.title').first();
    const title = titleEl.text().trim();
    const link = titleLink.attr('href') || el.find('.big-link').attr('href') || '';
    
    if (!title || !link) return;

    // Images use data-src (lazyload)
    const imgEl = el.find('img.lazyload, img[data-src]').first();
    let image = imgEl.attr('data-src') || imgEl.attr('src') || '';
    if (image && !image.startsWith('http')) {
      image = `${BASE_URL}${image}`;
    }

    // Extract category from URL
    const urlMatch = link.match(/\/games\/([^/]+)\//);
    const gameCategory = urlMatch ? urlMatch[1] : 'unknown';

    // Extract date from <time> element
    const timeEl = el.find('time').first();
    const dateText = timeEl.attr('datetime') || timeEl.text().trim();

    // Extract ID from URL
    const idMatch = link.match(/\/(\d+)-/);
    const id = idMatch ? idMatch[1] : link.replace(/[^a-z0-9]/gi, '_');

    // Preview text contains modes, store info
    const previewText = el.find('.preview-text').text() || '';
    
    // Check if it's an "online" game
    const isOnline = /online|по сети|мультиплеер|multiplayer|co-op|coop/i.test(title + ' ' + previewText);

    // Extract platform/store info
    const storeText = el.find('.preview-text a[href*="progs"], .preview-text a[href*="programs"]').text().trim();

    // Extract modes
    const modes = previewText.match(/Modes?:\s*([^\n]+)/i);
    const modesText = modes ? modes[1].replace(/\s*✓\s*/g, '').trim() : '';

    games.push({
      id,
      title: cleanTitle(title) || title,
      originalTitle: title,
      link,
      image,
      category: gameCategory,
      date: dateText,
      isOnline,
      store: storeText || 'Unknown',
      modes: modesText,
      source: 'online-fix.me'
    });
  });

  // Fallback: parse from links if article-based parsing failed
  if (games.length === 0) {
    $('a[href*="/games/"]').each((_, element) => {
      const el = $(element);
      const link = el.attr('href') || '';
      const title = el.text().trim();
      
      if (!title || !link || link === `${BASE_URL}/games/` || title.length < 3) return;
      if (/page\/\d+/.test(link)) return;
      if (/#comment/.test(link)) return;

      const idMatch = link.match(/\/(\d+)-/);
      const id = idMatch ? idMatch[1] : '';
      if (!id) return;
      if (games.find(g => g.id === id)) return;

      const urlMatch = link.match(/\/games\/([^/]+)\//);
      const gameCategory = urlMatch ? urlMatch[1] : 'unknown';
      const isOnline = /online|по сети/i.test(title);

      games.push({
        id,
        title: cleanTitle(title) || title,
        originalTitle: title,
        link,
        image: '',
        category: gameCategory,
        date: '',
        isOnline,
        store: 'Unknown',
        source: 'online-fix.me'
      });
    });
  }

  // Determine pagination
  const lastPageLink = $('a[href*="/page/"]').last().attr('href') || '';
  const lastPageMatch = lastPageLink.match(/\/page\/(\d+)/);
  const totalPages = lastPageMatch ? parseInt(lastPageMatch[1]) : page;

  return {
    games,
    pagination: {
      currentPage: page,
      totalPages: Math.max(totalPages, page),
      hasNext: page < totalPages,
      hasPrev: page > 1
    },
    source: 'online-fix.me',
    category: category || 'all'
  };
}

/**
 * Scrape game detail page from online-fix.me
 * gameId can be a numeric ID or a full URL
 */
async function scrapeOnlineFixDetail(gameId) {
  let detailUrl;
  
  // If gameId looks like a URL, use it directly
  if (gameId.startsWith('http')) {
    detailUrl = gameId;
  } else {
    // Search for the game by ID on the games listing
    try {
      const gamesResp = await axios.get(`${BASE_URL}/games/`, { headers: HEADERS, timeout: 15000, responseType: 'arraybuffer' });
      const $g = cheerio.load(iconv.decode(Buffer.from(gamesResp.data), 'win1251'));
      $g(`a[href*="/${gameId}-"]`).each((_, el) => {
        const href = $g(el).attr('href');
        if (href && href.includes('/games/') && href.includes('.html')) {
          detailUrl = href;
          return false;
        }
      });
    } catch (e) { /* continue */ }

    // Fallback: search endpoint
    if (!detailUrl) {
      try {
        const searchResp = await axios.get(`${BASE_URL}/?do=search&subaction=search&story=${gameId}`, { headers: HEADERS, timeout: 15000, responseType: 'arraybuffer' });
        const $s = cheerio.load(iconv.decode(Buffer.from(searchResp.data), 'win1251'));
        $s(`a[href*="/${gameId}-"]`).each((_, el) => {
          const href = $s(el).attr('href');
          if (href && href.includes('.html')) {
            detailUrl = href;
            return false;
          }
        });
      } catch (e) { /* continue */ }
    }
  }

  if (!detailUrl) {
    throw new Error(`Could not find game with ID: ${gameId}`);
  }

  const response = await axios.get(detailUrl, { headers: HEADERS, timeout: 15000, responseType: 'arraybuffer' });
  const html = iconv.decode(Buffer.from(response.data), 'win1251');
  const $ = cheerio.load(html);
  sanitizeHtml($);

  // Extract game details
  const title = $('h1').first().text().trim() || $('h2.title').first().text().trim();
  
  // Get the main image (lazy-loaded)
  let image = $('article img.lazyload, article img[data-src], .article img.lazyload').first().attr('data-src') || 
              $('article img, .article img').first().attr('src') || '';
  if (image && !image.startsWith('http')) {
    image = `${BASE_URL}${image}`;
  }

  // Extract download links (filter out ad links)
  const downloadLinks = [];
  const seenUrls = new Set();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    
    if (seenUrls.has(href)) return;
    
    if (href.includes('magnet:') || href.includes('.torrent') ||
        href.includes('mega.') || href.includes('1fichier') ||
        href.includes('drive.google') || href.includes('mediafire') ||
        href.includes('pixeldrain') || href.includes('gofile') ||
        href.includes('buzzheavier') || href.includes('filecrypt') ||
        href.includes('disk.yandex') || href.includes('uploadhaven') ||
        href.includes('datanodes')) {
      seenUrls.add(href);
      downloadLinks.push({
        url: href,
        text: text || 'Download',
        type: href.includes('magnet:') ? 'magnet' : href.includes('.torrent') ? 'torrent' : 'direct'
      });
    }
  });

  // Extract description from preview-text or full content
  const contentEl = $('article .preview-text, .article-content .preview-text, .full-text').first();
  const description = contentEl.length ? contentEl.text().trim().substring(0, 2000) : '';

  // Extract screenshots
  const screenshots = [];
  $('article img[data-src], article img[src], .article img[data-src]').each((_, el) => {
    let src = $(el).attr('data-src') || $(el).attr('src') || '';
    if (src && !src.includes('banner') && !src.includes('advert') && !src.includes('icon') && !src.includes('logo')) {
      if (!src.startsWith('http')) src = `${BASE_URL}${src}`;
      if (!screenshots.includes(src)) screenshots.push(src);
    }
  });

  // Extract system requirements if present
  const bodyText = $('body').text();
  const sysReqMatch = bodyText.match(/(Минимальные|Minimum|System Requirements)[\s\S]{0,1000}/i);
  const systemRequirements = sysReqMatch ? sysReqMatch[0].substring(0, 500) : '';

  return {
    id: gameId,
    title: cleanTitle(title) || title,
    originalTitle: title,
    link: detailUrl,
    image,
    description,
    downloadLinks,
    screenshots: screenshots.slice(0, 10),
    systemRequirements,
    source: 'online-fix.me'
  };
}

/**
 * Get available categories from online-fix.me
 */
async function scrapeOnlineFixCategories() {
  return Object.entries(CATEGORIES).map(([key, value]) => ({
    id: key,
    name: key.charAt(0).toUpperCase() + key.slice(1),
    slug: value || key,
    url: value ? `${BASE_URL}/games/${value}/` : `${BASE_URL}/games/`
  }));
}

module.exports = {
  scrapeOnlineFix,
  scrapeOnlineFixDetail,
  scrapeOnlineFixCategories
};
