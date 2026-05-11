const express = require('express');
// Bypass system enterprise SSL interception gateway blocks 
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const cors = require('cors');
const path = require('path');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const { scrapeOnlineFix, scrapeOnlineFixDetail, scrapeOnlineFixCategories } = require('./scrapers/onlinefix');
const { scrapeCsRin, scrapeCsRinThread, scrapeCsRinFeed } = require('./scrapers/csrin');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 3001;

// Cache: 15 min TTL for listings, 30 min for details
const listCache = new NodeCache({ stdTTL: 900 });
const detailCache = new NodeCache({ stdTTL: 1800 });

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60,
  message: { error: 'Too many requests, slow down.' }
});
app.use('/api', limiter);

// Serve static client files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client')));
}

// ============================================
// API Routes
// ============================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Image proxy — serves images from source sites to avoid CORS/hotlinking issues
app.get('/api/image-proxy', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send('Missing url parameter');

    // Only allow proxying from known sources
    const allowed = ['online-fix.me', 'cs.rin.ru'];
    const isAllowed = allowed.some(d => imageUrl.includes(d));
    if (!isAllowed) return res.status(403).send('Domain not allowed');

    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://online-fix.me/',
        'Accept': 'image/*'
      }
    });

    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24h
    res.send(Buffer.from(response.data));
  } catch (err) {
    res.status(404).send('Image not found');
  }
});

// --- Online-Fix.me Routes ---

// Get games listing from online-fix.me
app.get('/api/onlinefix/games', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const category = req.query.category || '';
    const cacheKey = `onlinefix_games_${category}_${page}`;

    let data = listCache.get(cacheKey);
    if (!data) {
      data = await scrapeOnlineFix(page, category);
      listCache.set(cacheKey, data);
    }

    res.json(data);
  } catch (err) {
    console.error('OnlineFix scrape error:', err.message);
    res.status(500).json({ error: 'Failed to fetch games from online-fix.me', details: err.message });
  }
});

// Get game detail from online-fix.me
app.get('/api/onlinefix/game/:id', async (req, res) => {
  try {
    const gameId = req.params.id;
    const cacheKey = `onlinefix_detail_${gameId}`;

    let data = detailCache.get(cacheKey);
    if (!data) {
      data = await scrapeOnlineFixDetail(gameId);
      detailCache.set(cacheKey, data);
    }

    res.json(data);
  } catch (err) {
    console.error('OnlineFix detail error:', err.message);
    res.status(500).json({ error: 'Failed to fetch game details', details: err.message });
  }
});

// Get categories from online-fix.me
app.get('/api/onlinefix/categories', async (req, res) => {
  try {
    const cacheKey = 'onlinefix_categories';
    let data = listCache.get(cacheKey);
    if (!data) {
      data = await scrapeOnlineFixCategories();
      listCache.set(cacheKey, data);
    }
    res.json(data);
  } catch (err) {
    console.error('OnlineFix categories error:', err.message);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// --- CS.RIN.RU Routes ---

// Get cs.rin.ru default generic feed
app.get('/api/csrin/games', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const cacheKey = `csrin_feed_${page}`;
    let data = listCache.get(cacheKey);
    if (!data) {
      data = await scrapeCsRinFeed(page);
      listCache.set(cacheKey, data);
    }
    res.json(data);
  } catch (err) {
    console.error('CS.RIN feed error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve feed', details: err.message });
  }
});

// Search cs.rin.ru forum
app.get('/api/csrin/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    const page = parseInt(req.query.page) || 1;
    if (!query) return res.status(400).json({ error: 'Search query required' });

    const cacheKey = `csrin_search_${query}_${page}`;
    let data = listCache.get(cacheKey);
    if (!data) {
      data = await scrapeCsRin(query, page);
      listCache.set(cacheKey, data);
    }

    res.json(data);
  } catch (err) {
    console.error('CS.RIN scrape error:', err.message);
    res.status(500).json({ error: 'Failed to search cs.rin.ru', details: err.message });
  }
});

// Get cs.rin.ru thread detail
app.get('/api/csrin/thread/:id', async (req, res) => {
  try {
    const threadId = req.params.id;
    const cacheKey = `csrin_thread_${threadId}`;

    let data = detailCache.get(cacheKey);
    if (!data) {
      data = await scrapeCsRinThread(threadId);
      detailCache.set(cacheKey, data);
    }

    res.json(data);
  } catch (err) {
    console.error('CS.RIN thread error:', err.message);
    res.status(500).json({ error: 'Failed to fetch thread details', details: err.message });
  }
});

// --- Unified Search ---
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    if (!query) return res.status(400).json({ error: 'Search query required' });

    const cacheKey = `unified_search_${query}`;
    let data = listCache.get(cacheKey);

    if (!data) {
      // Search both sources in parallel
      const [onlineFixResults, csRinResults] = await Promise.allSettled([
        scrapeOnlineFix(1, '', query),
        scrapeCsRin(query, 1)
      ]);

      data = {
        onlinefix: onlineFixResults.status === 'fulfilled' ? onlineFixResults.value : { games: [], error: onlineFixResults.reason?.message },
        csrin: csRinResults.status === 'fulfilled' ? csRinResults.value : { threads: [], error: csRinResults.reason?.message }
      };

      listCache.set(cacheKey, data);
    }

    res.json(data);
  } catch (err) {
    console.error('Unified search error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Clear cache (admin endpoint)
app.post('/api/cache/clear', (req, res) => {
  listCache.flushAll();
  detailCache.flushAll();
  res.json({ message: 'Cache cleared' });
});

// Catch-all for SPA in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`\n  ⚡ 314rate server running on http://localhost:${PORT}`);
  console.log(`  📡 API available at http://localhost:${PORT}/api\n`);
});
