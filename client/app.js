// === Config ===
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3001/api'
  : '/api';

// === State ===
const state = {
  source: 'all',
  category: 'all',
  page: 1,
  searchQuery: '',
  loading: false,
  games: [],
  debounceTimer: null
};

// === DOM Refs ===
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  searchInput: $('#search-input'),
  searchClear: $('#search-clear'),
  searchShortcut: $('#search-shortcut'),
  gamesGrid: $('#games-grid'),
  loading: $('#loading'),
  errorState: $('#error-state'),
  errorMessage: $('#error-message'),
  emptyState: $('#empty-state'),
  pagination: $('#pagination'),
  prevPage: $('#prev-page'),
  nextPage: $('#next-page'),
  pageInfo: $('#page-info'),
  categoryBar: $('#category-bar'),
  categoryScroll: $('#category-scroll'),
  modal: $('#game-modal'),
  modalBody: $('#modal-body'),
  modalClose: $('#modal-close'),
  modalBackdrop: $('#modal-backdrop'),
  btnRefresh: $('#btn-refresh')
};

// === Categories ===
const categories = [
  { id: 'all', name: 'All Games' },
  { id: 'action', name: 'Action' },
  { id: 'adventures', name: 'Adventure' },
  { id: 'horror', name: 'Horror' },
  { id: 'indie', name: 'Indie' },
  { id: 'officialservers', name: 'Online/MP' },
  { id: 'puzzles', name: 'Puzzle' },
  { id: 'racing', name: 'Racing' },
  { id: 'rpg', name: 'RPG' },
  { id: 'sandbox', name: 'Sandbox' },
  { id: 'shooter', name: 'Shooter' },
  { id: 'simulator', name: 'Simulator' },
  { id: 'sport', name: 'Sports' },
  { id: 'strategy', name: 'Strategy' },
  { id: 'survival', name: 'Survival' },
  { id: 'vr', name: 'VR' }
];

// === Init ===
document.addEventListener('DOMContentLoaded', () => {
  renderCategories();
  bindEvents();
  fetchGames();
});

// === Event Binding ===
function bindEvents() {
  // Search
  els.searchInput.addEventListener('input', (e) => {
    const q = e.target.value.trim();
    els.searchClear.classList.toggle('hidden', !q);
    els.searchShortcut.classList.toggle('hidden', !!q);
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(() => {
      state.searchQuery = q;
      state.page = 1;
      fetchGames();
    }, 500);
  });

  els.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(state.debounceTimer);
      state.searchQuery = els.searchInput.value.trim();
      state.page = 1;
      fetchGames();
    }
  });

  els.searchClear.addEventListener('click', () => {
    els.searchInput.value = '';
    els.searchClear.classList.add('hidden');
    els.searchShortcut.classList.remove('hidden');
    state.searchQuery = '';
    state.page = 1;
    fetchGames();
  });

  // Keyboard shortcut
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== els.searchInput) {
      e.preventDefault();
      els.searchInput.focus();
    }
    if (e.key === 'Escape') {
      if (!els.modal.classList.contains('hidden')) closeModal();
      else if (document.activeElement === els.searchInput) els.searchInput.blur();
    }
  });

  // Source nav
  $$('.nav-btn[data-source]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.nav-btn[data-source]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.source = btn.dataset.source;
      state.page = 1;
      els.categoryBar.style.display = (state.source === 'csrin') ? 'none' : '';
      fetchGames();
    });
  });

  // Pagination
  els.prevPage.addEventListener('click', () => { if (state.page > 1) { state.page--; fetchGames(); } });
  els.nextPage.addEventListener('click', () => { state.page++; fetchGames(); });

  // Modal
  els.modalClose.addEventListener('click', closeModal);
  els.modalBackdrop.addEventListener('click', closeModal);

  // Logo home
  $('#logo-home').addEventListener('click', () => {
    state.source = 'all';
    state.category = 'all';
    state.page = 1;
    state.searchQuery = '';
    els.searchInput.value = '';
    els.searchClear.classList.add('hidden');
    els.searchShortcut.classList.remove('hidden');
    $$('.nav-btn[data-source]').forEach(b => b.classList.remove('active'));
    $('#nav-all').classList.add('active');
    $$('.cat-chip').forEach(c => c.classList.remove('active'));
    $$('.cat-chip[data-cat="all"]').forEach(c => c.classList.add('active'));
    els.categoryBar.style.display = '';
    fetchGames();
  });

  // Refresh
  els.btnRefresh.addEventListener('click', async () => {
    els.btnRefresh.classList.add('spinning');
    try {
      await fetch(`${API_BASE}/cache/clear`, { method: 'POST' });
    } catch (e) { /* ignore */ }
    await fetchGames();
    setTimeout(() => els.btnRefresh.classList.remove('spinning'), 500);
  });

  // Retry
  $('#retry-btn').addEventListener('click', fetchGames);
}

// === Render Categories ===
function renderCategories() {
  els.categoryScroll.innerHTML = categories.map(c =>
    `<button class="cat-chip${c.id === 'all' ? ' active' : ''}" data-cat="${c.id}">${c.name}</button>`
  ).join('');

  els.categoryScroll.addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
    $$('.cat-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.category = chip.dataset.cat;
    state.page = 1;
    fetchGames();
  });
}

// === Fetch Games ===
async function fetchGames() {
  if (state.loading) return;
  state.loading = true;
  showLoading();

  try {
    let data;

    if (state.searchQuery) {
      // Unified search
      if (state.source === 'onlinefix') {
        const res = await fetch(`${API_BASE}/onlinefix/games?page=${state.page}&category=${state.category === 'all' ? '' : state.category}&q=${encodeURIComponent(state.searchQuery)}`);
        data = await res.json();
        state.games = data.games || [];
        renderGames(state.games, data.pagination);
      } else if (state.source === 'csrin') {
        const res = await fetch(`${API_BASE}/csrin/search?q=${encodeURIComponent(state.searchQuery)}&page=${state.page}`);
        data = await res.json();
        state.games = (data.threads || []).map(threadToGame);
        renderGames(state.games, data.pagination);
      } else {
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(state.searchQuery)}`);
        data = await res.json();
        const ofGames = data.onlinefix?.games || [];
        const csGames = (data.csrin?.threads || []).map(threadToGame);
        state.games = [...ofGames, ...csGames];
        renderGames(state.games, null);
      }
    } else {
      // Listing mode (Home feeds)
      if (state.source === 'onlinefix') {
        const res = await fetch(`${API_BASE}/onlinefix/games?page=${state.page}`);
        data = await res.json();
        let games = data.games || [];
        if (state.category && state.category !== 'all') games = games.filter(g => g.category === state.category);
        state.games = games;
        renderGames(state.games, data.pagination);
      } else if (state.source === 'csrin') {
        const res = await fetch(`${API_BASE}/csrin/games?page=${state.page}`);
        data = await res.json();
        state.games = (data.threads || []).map(threadToGame);
        renderGames(state.games, data.pagination);
      } else {
        // Combined source logic: Fetch front pages of both
        const [ofRes, csRes] = await Promise.all([
          fetch(`${API_BASE}/onlinefix/games?page=${state.page}`).then(r => r.json()).catch(() => ({ games: [] })),
          fetch(`${API_BASE}/csrin/games?page=${state.page}`).then(r => r.json()).catch(() => ({ threads: [] }))
        ]);
        
        const ofGames = ofRes.games || [];
        const csGames = (csRes.threads || []).map(threadToGame);
        // Interleave them or join them
        state.games = [...ofGames, ...csGames].sort((a,b) => 0.5 - Math.random()); // Shuffle combined view slightly to mix sources
        renderGames(state.games, null);
      }
    }
  } catch (err) {
    showError(err.message);
  } finally {
    state.loading = false;
  }
}

// === Convert cs.rin thread to game-like object ===
function threadToGame(thread) {
  return {
    id: thread.id,
    title: thread.title,
    link: thread.link,
    image: '',
    category: 'forum',
    date: thread.lastPost,
    isOnline: false,
    store: '',
    source: 'cs.rin.ru',
    replies: thread.replies,
    views: thread.views,
    author: thread.author
  };
}

// === Render Games Grid ===
function renderGames(games, pagination) {
  if (!games || games.length === 0) {
    showEmpty();
    return;
  }

  els.loading.classList.add('hidden');
  els.errorState.classList.add('hidden');
  els.emptyState.classList.add('hidden');
  els.gamesGrid.classList.remove('hidden');

  els.gamesGrid.innerHTML = games.map((game, i) => {
    const title = cleanDisplayTitle(game.title);
    const imgSrc = game.image ? proxyImg(game.image) : '';
    const date = formatDate(game.date);
    return `
    <div class="game-card" data-id="${game.id}" data-source="${game.source}" style="animation-delay:${i * 0.04}s">
      <div class="card-image">
        ${imgSrc
          ? `<img src="${imgSrc}" alt="${escHtml(title)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=placeholder-img>[IMAGE]</div>'">`
          : '<div class="placeholder-img">[IMAGE]</div>'
        }
        <div class="card-badges">
          ${game.isOnline ? '<span class="badge badge-online">Online</span>' : ''}
          <span class="badge badge-source">${game.source === 'cs.rin.ru' ? 'CS.RIN' : 'OF'}</span>
        </div>
      </div>
      <div class="card-body">
        <div class="card-title">${escHtml(title)}</div>
        <div class="card-meta">
          ${game.category && game.category !== 'unknown' ? `<span>${game.category}</span>` : ''}
          ${date ? `<span class="dot"></span><span>${date}</span>` : ''}
          ${game.store && game.store !== 'Unknown' ? `<span class="dot"></span><span>${game.store}</span>` : ''}
          ${game.replies !== undefined ? `<span class="dot"></span><span>${game.replies} replies</span>` : ''}
        </div>
      </div>
    </div>
  `;
  }).join('');

  // Card click
  $$('.game-card').forEach(card => {
    card.addEventListener('click', () => openGameDetail(card.dataset.id, card.dataset.source));
  });

  // Pagination
  if (pagination) {
    els.pagination.classList.remove('hidden');
    els.prevPage.disabled = !pagination.hasPrev;
    els.nextPage.disabled = !pagination.hasNext;
    els.pageInfo.textContent = `Page ${pagination.currentPage}${pagination.totalPages ? ' / ' + pagination.totalPages : ''}`;
  } else {
    els.pagination.classList.add('hidden');
  }
}

// === Game Detail Modal & Auto Download ===
async function openGameDetail(id, source) {
  els.modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  els.modalBody.innerHTML = `
    <div class="modal-loading">
      <div class="loader" style="width:32px;height:32px"><div class="loader-ring"></div></div>
      <div style="margin-top:16px; letter-spacing:1px; text-transform:uppercase; font-weight:700;">
        INITIATING DOWNLOAD SEQUENCE...
      </div>
    </div>`;

  try {
    let data;
    if (source === 'cs.rin.ru') {
      const res = await fetch(`${API_BASE}/csrin/thread/${id}`);
      data = await res.json();
    } else {
      const res = await fetch(`${API_BASE}/onlinefix/game/${id}`);
      data = await res.json();
    }
    
    const bestDl = getBestDownload(data.downloadLinks);
    
    if (bestDl && bestDl.url) {
      // Display transferring notice
      els.modalBody.innerHTML = `
        <div class="modal-loading">
          <div style="color:var(--accent); font-weight:800; letter-spacing:1px; margin-bottom: 10px;">SUCCESS</div>
          <div style="text-transform:uppercase; font-size:13px;">TRANSFERRING COMMAND TO SYSTEM...</div>
        </div>`;
        
      // Dispatch logical navigation protocol
      setTimeout(() => {
         // Magnet schemas are fired via direct assign to prevent empty blip tabs.
         // HTTP directs are fired in blank tabs to maintain application state context.
         if (bestDl.url.startsWith('magnet:')) {
           window.location.assign(bestDl.url);
         } else {
           window.open(bestDl.url, '_blank');
         }
      }, 200);
      
      setTimeout(() => {
         if (source === 'cs.rin.ru') renderCsRinDetail(data);
         else renderOnlineFixDetail(data);
      }, 1500);
    } else {
      // No download found instantly? Fallback directly to detail render!
      if (source === 'cs.rin.ru') renderCsRinDetail(data);
      else renderOnlineFixDetail(data);
    }

  } catch (err) {
    els.modalBody.innerHTML = `<div class="error-state"><div class="error-icon">![ERR]</div><h3>Failed to load</h3><p>${escHtml(err.message)}</p></div>`;
  }
}

function getBestDownload(links) {
  if (!links || !links.length) return null;
  return links.find(l => l.type === 'magnet') || links.find(l => l.type === 'torrent') || links[0];
}

function renderOnlineFixDetail(game) {
  const bestDl = getBestDownload(game.downloadLinks);
  
  const dlHtml = game.downloadLinks?.length
    ? game.downloadLinks.map(dl => `
      <a href="${escHtml(dl.url)}" target="_blank" rel="noopener" class="download-link" onclick="event.stopPropagation()">
        <div class="dl-icon ${dl.type}">[${dl.type === 'magnet' ? 'MAG' : dl.type === 'torrent' ? 'TOR' : 'DL'}]</div>
        <div class="dl-info">
          <div class="dl-name">${escHtml(dl.text)}</div>
          <div class="dl-type">${dl.type.toUpperCase()}</div>
        </div>
        <div class="dl-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M17 7H7M17 7v10"/></svg></div>
      </a>
    `).join('')
    : '<p class="no-downloads">No download links found. Visit the source page directly.</p>';

  els.modalBody.innerHTML = `
    <div class="detail-header">
      <div class="detail-title">${escHtml(game.title || game.originalTitle)}</div>
      <div class="detail-source">
        <span class="badge badge-source">Online-Fix</span>
        <a href="${escHtml(game.link)}" target="_blank" rel="noopener">View on source ↗</a>
      </div>
    </div>
    ${game.image ? `<div class="detail-image"><img src="${proxyImg(game.image)}" alt="${escHtml(game.title)}" onerror="this.parentElement.remove()"></div>` : ''}
    
    ${bestDl ? `
      <div class="primary-action">
         <a href="${escHtml(bestDl.url)}" target="_blank" rel="noopener" class="btn-mega-download">
             <span class="mega-icon">[LINK]</span>
             <span class="mega-text">INSTANT DOWNLOAD</span>
         </a>
      </div>
    ` : ''}

    ${game.description ? `<div class="detail-section"><h4>Description</h4><div class="detail-description">${escHtml(game.description)}</div></div>` : ''}
    <div class="detail-section">
      <h4>All Links (${game.downloadLinks?.length || 0})</h4>
      <div class="download-list">${dlHtml}</div>
    </div>
    ${game.systemRequirements ? `<div class="detail-section"><h4>Requirements</h4><div class="detail-description">${escHtml(game.systemRequirements)}</div></div>` : ''}
  `;
}

function renderCsRinDetail(thread) {
  const bestDl = getBestDownload(thread.downloadLinks);

  const dlHtml = thread.downloadLinks?.length
    ? thread.downloadLinks.map(dl => `
      <a href="${escHtml(dl.url)}" target="_blank" rel="noopener" class="download-link" onclick="event.stopPropagation()">
        <div class="dl-icon ${dl.type}">[${dl.type === 'magnet' ? 'MAG' : dl.type === 'torrent' ? 'TOR' : 'DL'}]</div>
        <div class="dl-info">
          <div class="dl-name">${escHtml(dl.text)}</div>
          <div class="dl-type">${dl.type.toUpperCase()}</div>
        </div>
        <div class="dl-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M17 7H7M17 7v10"/></svg></div>
      </a>
    `).join('')
    : '<p class="no-downloads">No download links extracted. Visit the forum thread directly.</p>';

  els.modalBody.innerHTML = `
    <div class="detail-header">
      <div class="detail-title">${escHtml(thread.title)}</div>
      <div class="detail-source">
        <span class="badge badge-source">CS.RIN.RU</span>
        <a href="${escHtml(thread.link)}" target="_blank" rel="noopener">View thread ↗</a>
      </div>
    </div>

    ${bestDl ? `
      <div class="primary-action">
         <a href="${escHtml(bestDl.url)}" target="_blank" rel="noopener" class="btn-mega-download">
             <span class="mega-icon">[LINK]</span>
             <span class="mega-text">INSTANT DOWNLOAD</span>
         </a>
      </div>
    ` : ''}

    ${thread.content ? `<div class="detail-section"><h4>Thread Preview</h4><div class="detail-description">${escHtml(thread.content)}</div></div>` : ''}
    <div class="detail-section">
      <h4>Extracted Links (${thread.downloadLinks?.length || 0})</h4>
      <div class="download-list">${dlHtml}</div>
    </div>
    ${thread.error ? `<div class="detail-section"><p class="no-downloads">[ERR] ${escHtml(thread.error)}</p></div>` : ''}
  `;
}

function closeModal() {
  els.modal.classList.add('hidden');
  document.body.style.overflow = '';
}

// === UI State Helpers ===
function showLoading() {
  els.loading.classList.remove('hidden');
  els.gamesGrid.classList.add('hidden');
  els.errorState.classList.add('hidden');
  els.emptyState.classList.add('hidden');
  els.pagination.classList.add('hidden');
}

function showError(msg) {
  els.loading.classList.add('hidden');
  els.gamesGrid.classList.add('hidden');
  els.emptyState.classList.add('hidden');
  els.errorState.classList.remove('hidden');
  els.pagination.classList.add('hidden');
  els.errorMessage.textContent = msg || 'Something went wrong.';
}

function showEmpty(msg) {
  els.loading.classList.add('hidden');
  els.gamesGrid.classList.add('hidden');
  els.errorState.classList.add('hidden');
  els.emptyState.classList.remove('hidden');
  els.pagination.classList.add('hidden');
  if (msg) els.emptyState.querySelector('p').textContent = msg;
}

// === Util ===
function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Proxy images through our server to avoid hotlink blocking
function proxyImg(url) {
  if (!url) return '';
  return `${API_BASE}/image-proxy?url=${encodeURIComponent(url)}`;
}

// Format ISO date or Russian date to readable format
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  } catch (e) {}
  // Return cleaned original if not parseable
  return dateStr.replace(/T.*$/, '');
}

// Clean game title — remove garbled encoding artifacts
function cleanDisplayTitle(title) {
  if (!title) return '';
  // Remove replacement characters and garbled sequences
  return title
    .replace(/[\ufffd\u0000-\u001f]/g, '')
    .replace(/\s*[�]+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
