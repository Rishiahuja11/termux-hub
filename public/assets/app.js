'use strict';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let TOKEN = localStorage.getItem('adm_token') || '';
let CURRENT_USER = '';

const ICONS = {
  dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
  terminal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`,
  files: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  apps: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="2" width="8" height="8" rx="2"/><rect x="14" y="2" width="8" height="8" rx="2"/><rect x="2" y="14" width="8" height="8" rx="2"/><rect x="14" y="14" width="8" height="8" rx="2"/></svg>`,
  store: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  android: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`,
  docs: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  logs: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
};

const VIEWS = [
  { id: 'dashboard', icon: 'dashboard', name: 'Dashboard' },
  { id: 'terminal', icon: 'terminal', name: 'Terminal' },
  { id: 'files', icon: 'files', name: 'Files' },
  { id: 'apps', icon: 'apps', name: 'Apps' },
  { id: 'store', icon: 'store', name: 'Store' },
  { id: 'android', icon: 'android', name: 'Android' },
  { id: 'docs', icon: 'docs', name: 'Docs' },
  { id: 'logs', icon: 'logs', name: 'Logs' },
  { id: 'settings', icon: 'settings', name: 'Settings' },
];

let state = { view: 'dashboard', fmPath: null, fmSelected: [], termHistory: [], termHistIdx: -1 };
let dashboardRefreshTimer = null;

// ── Particles ──
function initParticles() {
  const container = document.createElement('div');
  container.id = 'particles';
  document.body.appendChild(container);
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `left:${Math.random()*100}%;top:${Math.random()*100}%;animation-delay:${Math.random()*4}s;animation-duration:${3+Math.random()*3}s;width:${1+Math.random()*2}px;height:${1+Math.random()*2}px`;
    container.appendChild(p);
  }
}

function toast(msg, type) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast ' + (type || 'info') + ' show';
  clearTimeout(t._t);
  t._t = setTimeout(() => t.className = 'toast hidden', 3500);
}

function headers() { return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN }; }

async function api(path, opts) {
  try {
    const r = await fetch(path, { headers: headers(), ...opts });
    if (r.status === 401) { TOKEN = ''; localStorage.removeItem('adm_token'); location.reload(); throw new Error('unauthorized'); }
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) return await r.json();
    return await r.text();
  } catch (e) { if (e.message !== 'unauthorized') toast('Network error: ' + e.message, 'error'); throw e; }
}

// ── Auth ──
function showGate() {
  $('#gate').classList.remove('hidden');
  const form = $('#gate-form');
  const userRow = $('#gate-user-row');
  const label = $('#gate-subtitle');
  const pw = $('#gate-password');
  const btn = $('#gate-btn');
  const toggle = $('#gate-toggle');

  userRow.style.display = 'none';
  btn.textContent = 'Sign In';
  label.textContent = 'Sign in to your device';
  toggle.innerHTML = 'Create account';
  toggle.onclick = () => {
    if (btn.textContent === 'Create Account') {
      btn.textContent = 'Sign In'; label.textContent = 'Sign in to your device'; toggle.innerHTML = 'Create account';
    } else {
      btn.textContent = 'Create Account'; label.textContent = 'Set up your account'; toggle.innerHTML = 'Sign in instead';
    }
  };
  form.onsubmit = async e => {
    e.preventDefault();
    const u = $('#gate-username').value.trim();
    const p = pw.value;
    if (!u || !p) return;
    try {
      const endpoint = btn.textContent === 'Create Account' ? '/api/auth/create' : '/api/auth/login';
      const r = await api(endpoint, { method: 'POST', body: JSON.stringify({ username: u, password: p }) });
      if (r.ok) { TOKEN = r.token; CURRENT_USER = r.username; localStorage.setItem('adm_token', TOKEN); showDash(); }
      else { $('#gate-err').textContent = r.error || 'Failed'; }
    } catch (_) { $('#gate-err').textContent = 'Connection failed'; }
  };
}

async function showDash() {
  $('#gate').classList.add('hidden');
  $('#dash').classList.remove('hidden');
  $('#user-badge').textContent = CURRENT_USER;
  buildNav();
  const v = location.hash.replace('#', '') || 'dashboard';
  const valid = VIEWS.find(x => x.id === v) ? v : 'dashboard';
  navigateTo(valid);
}

function buildNav() {
  const nav = $('#nav');
  nav.innerHTML = '';
  VIEWS.forEach(v => {
    const d = document.createElement('div');
    d.className = 'nav-item' + (state.view === v.id ? ' active' : '');
    d.innerHTML = `<span class="nav-icon">${ICONS[v.icon] || ''}</span><span>${v.name}</span>`;
    d.onclick = () => { navigateTo(v.id); closeSidebar(); };
    nav.appendChild(d);
  });
}

function navigateTo(viewId) {
  state.view = viewId;
  location.hash = viewId;
  $$('.nav-item').forEach((el, i) => el.classList.toggle('active', VIEWS[i].id === viewId));
  $('#view-title').textContent = VIEWS.find(v => v.id === viewId)?.name || '';
  renderView(viewId);
}

function renderView(id) {
  if (id !== 'android') {
    if (androidPollTimer) { clearInterval(androidPollTimer); androidPollTimer = null; }
    if (androidStreamImg) { androidStreamImg.src = ''; androidStreamImg = null; }
    if (androidFullscreen) { androidFullscreen = false; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  }
  if (id !== 'terminal') {
    if (termSocket) { try { termSocket.close(); } catch (_) {} termSocket = null; }
    if (termInstance) { if (termInstance._resizeObserver) termInstance._resizeObserver.disconnect(); termInstance.dispose(); termInstance = null; }
    if (termReconnectTimer) { clearTimeout(termReconnectTimer); termReconnectTimer = null; }
  }
  if (id !== 'dashboard' && dashboardRefreshTimer) { clearInterval(dashboardRefreshTimer); dashboardRefreshTimer = null; }
  const views = $('#views');
  views.scrollTop = 0;
  if (id === 'dashboard') renderDashboard(views);
  else if (id === 'terminal') renderTerminal(views);
  else if (id === 'files') renderFiles(views);
  else if (id === 'apps') renderApps(views);
  else if (id === 'store') renderStore(views);
  else if (id === 'android') renderAndroid(views);
  else if (id === 'docs') renderDocs(views);
  else if (id === 'logs') renderLogs(views);
  else if (id === 'settings') renderSettings(views);
}

// ── Animated Counter ──
function animateValue(el, start, end, duration, suffix) {
  suffix = suffix || '';
  const range = end - start;
  const startTime = performance.now();
  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = start + range * ease;
    el.textContent = (Number.isInteger(end) ? Math.round(current) : current.toFixed(1)) + suffix;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ── Dashboard ──
function skeletonCard(label) {
  return `<div class="skeleton-card"><div class="stat-header"><span class="stat-label">${label}</span></div><div class="skeleton skeleton-line h24 w40"></div><div class="progress-bar"><div class="skeleton skeleton-line" style="width:100%;height:4px"></div></div></div>`;
}
function skeletonQuickGrid() {
  let h = '';
  for (let i = 0; i < 7; i++) h += `<div class="skeleton-card" style="padding:20px;display:flex;flex-direction:column;align-items:center;gap:10px"><div class="skeleton" style="width:48px;height:48px;border-radius:14px"></div><div class="skeleton skeleton-line w60" style="height:10px"></div><div class="skeleton skeleton-line w40" style="height:8px"></div></div>`;
  return h;
}
async function renderDashboard(el) {
  el.innerHTML = `
    <div class="stats-grid" id="stats-grid">
      ${skeletonCard('Uptime')}${skeletonCard('CPU Load')}${skeletonCard('Memory')}${skeletonCard('Disk')}
    </div>
    <div class="section-title">Quick Actions</div>
    <div class="quick-grid" id="quick-grid">${skeletonQuickGrid()}</div>`;

  const grid = $('#quick-grid');
  const items = [
    { ico: 'terminal', name: 'Terminal', desc: 'Shell access', cls: 'blue', view: 'terminal' },
    { ico: 'files', name: 'Files', desc: 'Browse & manage', cls: 'green', view: 'files' },
    { ico: 'apps', name: 'Apps', desc: 'Manage apps', cls: 'purple', view: 'apps' },
    { ico: 'store', name: 'Store', desc: 'Install apps', cls: 'orange', view: 'store' },
    { ico: 'android', name: 'Android', desc: 'Remote control', cls: 'red', view: 'android' },
    { ico: 'docs', name: 'Docs', desc: 'CLI reference', cls: 'teal', view: 'docs' },
    { ico: 'settings', name: 'Settings', desc: 'Configuration', cls: 'pink', view: 'settings' },
  ];
  grid.innerHTML = '';
  items.forEach((it, i) => {
    const d = document.createElement('div');
    d.className = 'quick-card';
    d.style.animation = `cardIn .5s ${i * 0.08}s both`;
    d.onclick = () => navigateTo(it.view);
    d.innerHTML = `<div class="quick-icon ${it.cls}">${ICONS[it.ico] || ''}</div><div class="quick-name">${it.name}</div><div class="quick-desc">${it.desc}</div>`;
    grid.appendChild(d);
  });

  function updateStats() {
    api('/api/system').then(s => {
      const grid = $('#stats-grid');
      if (!grid) return;
      const fmtUptime = sec => { if (!sec && sec !== 0) return '?'; const d = Math.floor(sec/86400), h = Math.floor(sec%86400/3600), m = Math.floor(sec%3600/60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };
      const memPct = s.mem_total ? ((s.mem_used / s.mem_total) * 100) : 0;
      const diskPct = s.storage ? ((s.storage.used / s.storage.total) * 100) : 0;
      const cpuPct = s.cpu_load != null ? Math.min(parseFloat(s.cpu_load) * 10, 100) : 0;

      if (!$('#stat-uptime')) {
        grid.innerHTML = `
          <div class="stat-card"><div class="stat-header"><span class="stat-label">Uptime</span><div class="stat-icon blue"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div></div><div class="stat-value blue" id="stat-uptime"></div><div class="progress-bar"><div class="progress-fill blue" style="width:0%"></div></div></div>
          <div class="stat-card"><div class="stat-header"><span class="stat-label">CPU Load</span><div class="stat-icon green"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/></svg></div></div><div class="stat-value green" id="stat-cpu"></div><div class="progress-bar"><div class="progress-fill green" id="stat-cpu-bar" style="width:0%"></div></div></div>
          <div class="stat-card"><div class="stat-header"><span class="stat-label">Memory</span><div class="stat-icon orange"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/></svg></div></div><div class="stat-value orange" id="stat-mem"></div><div class="progress-bar"><div class="progress-fill orange" id="stat-mem-bar" style="width:0%"></div></div></div>
          <div class="stat-card"><div class="stat-header"><span class="stat-label">Disk</span><div class="stat-icon purple"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg></div></div><div class="stat-value purple" id="stat-disk"></div><div class="progress-bar"><div class="progress-fill purple" id="stat-disk-bar" style="width:0%"></div></div></div>`;
      }

      const el = id => document.getElementById(id);
      if (el('stat-uptime')) el('stat-uptime').textContent = fmtUptime(s.uptime);
      if (el('stat-cpu')) el('stat-cpu').textContent = s.cpu_load != null ? s.cpu_load : '?';
      if (el('stat-mem')) el('stat-mem').textContent = memPct.toFixed(0) + '%';
      if (el('stat-disk')) el('stat-disk').textContent = diskPct.toFixed(0) + '%';

      setTimeout(() => {
        if (el('stat-cpu-bar')) el('stat-cpu-bar').style.width = cpuPct + '%';
        if (el('stat-mem-bar')) el('stat-mem-bar').style.width = memPct + '%';
        if (el('stat-disk-bar')) el('stat-disk-bar').style.width = diskPct + '%';
      }, 100);
    }).catch(() => {});
  }
  updateStats();
  if (dashboardRefreshTimer) clearInterval(dashboardRefreshTimer);
  dashboardRefreshTimer = setInterval(updateStats, 5000);
}

// ── Terminal (WebSocket + xterm.js) ──
let termInstance = null;
let termSocket = null;
let termReconnectTimer = null;

function renderTerminal(el) {
  if (termSocket) { try { termSocket.close(); } catch (_) {} termSocket = null; }
  if (termInstance) { termInstance.dispose(); termInstance = null; }
  if (termReconnectTimer) { clearTimeout(termReconnectTimer); termReconnectTimer = null; }

  el.innerHTML = `<div class="term-box"><div class="term-bar"><div class="dot dot-r"></div><div class="dot dot-y"></div><div class="dot dot-g"></div><span id="term-bar-title">TermuX Hub Terminal</span></div><div id="term-container" style="flex:1;overflow:hidden"></div><div class="term-input-row" id="term-status-bar" style="display:flex;align-items:center;padding:4px 12px;font-size:11px;color:var(--fg3);gap:12px"><span id="term-status">Connecting...</span><span style="flex:1"></span><span id="term-size">80x24</span></div></div>`;

  if (typeof Terminal === 'undefined') {
    $('#term-container').innerHTML = '<div class="empty" style="padding:48px"><h3>xterm.js not loaded</h3><p>Check your internet connection</p></div>';
    return;
  }

  const term = new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    fontSize: 13,
    fontFamily: "'Fira Code', 'SF Mono', 'JetBrains Mono', monospace",
    theme: {
      background: '#0F172A',
      foreground: '#F8FAFC',
      cursor: '#22C55E',
      cursorAccent: '#0F172A',
      selectionBackground: 'rgba(34,197,94,0.25)',
      black: '#1E293B',
      red: '#EF4444',
      green: '#22C55E',
      yellow: '#F59E0B',
      blue: '#3B82F6',
      magenta: '#A855F7',
      cyan: '#06B6D4',
      white: '#F8FAFC',
      brightBlack: '#64748B',
      brightRed: '#F87171',
      brightGreen: '#4ADE80',
      brightYellow: '#FBBF24',
      brightBlue: '#60A5FA',
      brightMagenta: '#C084FC',
      brightCyan: '#22D3EE',
      brightWhite: '#FFFFFF',
    },
    allowProposedApi: true,
    scrollback: 10000,
    convertEol: true,
  });
  termInstance = term;

  const container = $('#term-container');
  term.open(container);
  term.focus();

  const fitAddon = { fit() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w <= 0 || h <= 0) return;
    const cols = Math.floor(w / term._core._renderService.dimensions.css.cell.width) || 80;
    const rows = Math.floor(h / term._core._renderService.dimensions.css.cell.height) || 24;
    term.resize(cols, rows);
    const sz = $('#term-size');
    if (sz) sz.textContent = cols + 'x' + rows;
    if (termSocket && termSocket.readyState === 1) {
      termSocket.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }};
  term._fitAddon = fitAddon;

  function connectWs() {
    const cols = term.cols || 80;
    const rows = term.rows || 24;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws/terminal?token=${encodeURIComponent(TOKEN)}&cols=${cols}&rows=${rows}`;
    const ws = new WebSocket(url);
    termSocket = ws;

    ws.onopen = () => {
      const st = $('#term-status');
      if (st) { st.textContent = 'Connected'; st.style.color = 'var(--green)'; }
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'exit') {
            term.writeln('\r\n\x1b[33m[Process exited with code ' + msg.code + ']\x1b[0m');
            const st = $('#term-status');
            if (st) { st.textContent = 'Disconnected'; st.style.color = 'var(--orange)'; }
            termReconnectTimer = setTimeout(() => {
              if (state.view === 'terminal') { term.writeln('\r\n\x1b[36mReconnecting...\x1b[0m'); connectWs(); }
            }, 2000);
          }
        } catch (_) { term.write(ev.data); }
      } else {
        term.write(ev.data);
      }
    };

    ws.onclose = () => {
      const st = $('#term-status');
      if (st) { st.textContent = 'Disconnected'; st.style.color = 'var(--orange)'; }
      if (state.view === 'terminal') {
        termReconnectTimer = setTimeout(() => {
          term.writeln('\r\n\x1b[36mReconnecting...\x1b[0m');
          connectWs();
        }, 2000);
      }
    };

    ws.onerror = () => {};
  }

  term.onData(data => {
    if (termSocket && termSocket.readyState === 1) {
      termSocket.send(JSON.stringify({ type: 'input', data }));
    }
  });

  term.onResize(({ cols, rows }) => {
    if (termSocket && termSocket.readyState === 1) {
      termSocket.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
    const sz = $('#term-size');
    if (sz) sz.textContent = cols + 'x' + rows;
  });

  const ro = new ResizeObserver(() => { if (term._fitAddon) term._fitAddon.fit(); });
  ro.observe(container);
  term._resizeObserver = ro;

  setTimeout(() => { term._fitAddon.fit(); connectWs(); }, 100);
}

// ── File Manager ──
let fmRoot = null;
function skeletonFmList() {
  let h = '';
  for (let i = 0; i < 12; i++) h += `<div class="fm-item skeleton" style="height:42px"></div>`;
  return h;
}
async function renderFiles(el) {
  el.innerHTML = '<div class="fm-toolbar" id="fm-toolbar"></div><div class="fm-list" id="fm-list">' + skeletonFmList() + '</div>';
  if (!fmRoot) { try { const s = await api('/api/system'); fmRoot = s.home || '/data/data/com.termux/files/home'; } catch (_) { fmRoot = '/data/data/com.termux/files/home'; } }
  if (state.fmPath == null) state.fmPath = fmRoot;
  fmRender();
}

async function fmRender() {
  const tb = $('#fm-toolbar');
  const list = $('#fm-list');
  if (!tb || !list) return;
  tb.innerHTML = `<div class="fm-bc" id="fm-bc"></div>
    <button class="btn-sm" onclick="fmUp()">&#8593; Up</button>
    <button class="btn-sm" onclick="fmGoto(fmRoot)">~</button>
    <button class="btn-sm" onclick="fmGoto('/sdcard')">SD</button>
    <button class="btn-sm" onclick="fmNew()">+ New</button>
    <button class="btn-sm" onclick="fmRender()">&#8635;</button>`;
  if (state.fmSelected.length > 0) {
    tb.innerHTML += `<span style="color:var(--fg2);font-size:12px">${state.fmSelected.length} selected</span>
      <button class="btn-sm" onclick="fmMultiAction('download')">Download</button>
      <button class="btn-sm" onclick="fmMultiAction('zip')">Zip</button>
      <button class="btn-sm" onclick="fmMultiAction('delete')" style="color:var(--red)">Delete</button>`;
  }
  const bc = $('#fm-bc');
  if (bc) {
    const isHome = state.fmPath.startsWith(fmRoot);
    bc.innerHTML = `<span onclick="fmGoto(fmRoot)">~</span>`;
    if (!isHome) bc.innerHTML += ` <span onclick="fmGoto('/sdcard')">sdcard</span>`;
    let cum = isHome ? fmRoot : '/sdcard';
    const parts = isHome ? state.fmPath.slice(fmRoot.length).split('/').filter(Boolean) : state.fmPath.replace(/^\/sdcard\/?/, '').split('/').filter(Boolean);
    parts.forEach(p => { cum += '/' + p; bc.innerHTML += `<span onclick="fmGoto('${escA(cum)}')">${escH(p)}</span>`; });
  }
  try {
    const r = await api('/fs/list?path=' + encodeURIComponent(state.fmPath));
    if (!r.ok) { list.innerHTML = `<div class="empty">${escH(r.error)}</div>`; return; }
    const entries = (r.entries || []).sort((a, b) => (b.isDir ? 1 : 0) - (a.isDir ? 1 : 0) || a.name.localeCompare(b.name));
    if (entries.length === 0) { list.innerHTML = '<div class="empty">Empty directory</div>'; return; }
    list.innerHTML = '';
    entries.forEach((e, i) => {
      const d = document.createElement('div');
      d.className = 'fm-item';
      d.style.animation = `cardIn .3s ${i * 0.03}s both`;
      const ico = e.isDir ? '&#128193;' : fileIcon(e.name);
      const meta = e.isDir ? '' : fmtSize(e.size);
      d.innerHTML = `<span class="icon">${ico}</span><span class="name">${escH(e.name)}</span><span class="meta">${meta}</span>`;
      d.onclick = () => { if (e.isDir) fmGoto(state.fmPath + '/' + e.name); else fmOpenFile(state.fmPath + '/' + e.name); };
      list.appendChild(d);
    });
  } catch (_) { list.innerHTML = '<div class="empty">Failed to load</div>'; }
}

function fmGoto(p) { state.fmPath = p; state.fmSelected = []; fmRender(); }
function fmUp() { if (state.fmPath === fmRoot) return; const p = state.fmPath.split('/'); p.pop(); fmGoto(p.join('/') || fmRoot); }
async function fmOpenFile(p) {
  try {
    const r = await api('/fs/read?path=' + encodeURIComponent(p));
    if (!r.ok) return toast(r.error, 'error');
    let content = '';
    try { content = r.base64 ? decodeURIComponent(escape(atob(r.base64))) : (r.content || ''); } catch (_) { content = r.content || ''; }
    showModal(`<h3>${escH(p.split('/').pop())}</h3><textarea id="modal-editor" style="width:100%;min-height:300px;font-family:var(--font-mono);font-size:12px;padding:12px;border:1px solid var(--border);border-radius:var(--radius-xs);background:var(--surface);color:var(--fg);resize:vertical">${escH(content)}</textarea><div style="display:flex;gap:8px;margin-top:12px"><button class="btn-sm" onclick="closeModal()">Cancel</button><button class="btn-primary" style="width:auto;padding:8px 20px" onclick="fmSave('${escA(p)}')">Save</button></div>`);
  } catch (_) {}
}

async function fmSave(p) {
  const content = $('#modal-editor')?.value;
  if (content == null) return;
  try { await api('/fs/write', { method: 'POST', body: JSON.stringify({ path: p, content }) }); toast('Saved', 'success'); closeModal(); } catch (_) { toast('Failed', 'error'); }
}

async function fmNew() {
  showModal(`<h3>Create New</h3><input id="fm-new-name" placeholder="filename or folder/" style="margin-bottom:12px"><select id="fm-new-type"><option value="file">File</option><option value="folder">Folder</option></select><div style="display:flex;gap:8px;margin-top:12px"><button class="btn-sm" onclick="closeModal()">Cancel</button><button class="btn-primary" style="width:auto;padding:8px 20px" onclick="fmDoNew()">Create</button></div>`);
  setTimeout(() => $('#fm-new-name')?.focus(), 100);
}

async function fmDoNew() {
  const name = $('#fm-new-name')?.value?.trim();
  if (!name) return;
  const type = $('#fm-new-type')?.value || 'file';
  const fp = state.fmPath + '/' + name;
  try {
    if (type === 'folder') await api('/fs/mkdir', { method: 'POST', body: JSON.stringify({ path: fp }) });
    else await api('/fs/write', { method: 'POST', body: JSON.stringify({ path: fp, content: '' }) });
    toast('Created', 'success'); closeModal(); fmRender();
  } catch (_) { toast('Failed', 'error'); }
}

async function fmMultiAction(action) {
  const files = state.fmSelected.map(n => state.fmPath + '/' + n);
  if (action === 'delete') {
    if (!confirm(`Delete ${files.length} items?`)) return;
    try { for (const f of files) await api('/fs/delete', { method: 'POST', body: JSON.stringify({ path: f }) }); toast('Deleted', 'success'); state.fmSelected = []; fmRender(); } catch (_) { toast('Failed', 'error'); }
  } else if (action === 'download' || action === 'zip') {
    const params = encodeURIComponent(JSON.stringify(files));
    try {
      const r = await fetch('/fs/zip?paths=' + params, { headers: { Authorization: 'Bearer ' + TOKEN } });
      if (!r.ok) { toast('Failed', 'error'); return; }
      const blob = await r.blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'download-' + Date.now() + '.zip';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href); toast('Downloaded', 'success');
    } catch (_) { toast('Download failed', 'error'); }
  }
}

// ── Apps ──
function skeletonAppGrid() {
  let h = '';
  for (let i = 0; i < 12; i++) h += `<div class="skeleton-card" style="padding:16px;display:flex;align-items:center;gap:12px"><div class="skeleton" style="width:44px;height:44px;border-radius:12px;flex-shrink:0"></div><div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="skeleton skeleton-line w60" style="height:12px"></div><div class="skeleton skeleton-line w40" style="height:10px"></div></div></div>`;
  return h;
}
async function renderApps(el) {
  el.innerHTML = '<div class="app-grid" id="app-grid">' + skeletonAppGrid() + '</div>';
  try {
    const r = await api('/api/store');
    const apps = r.apps || [];
    const grid = $('#app-grid');
    if (apps.length === 0) { grid.innerHTML = '<div class="empty">No apps found</div>'; return; }
    grid.innerHTML = '';
    const installed = apps.filter(a => a.installed);
    const available = apps.filter(a => !a.installed);
    if (installed.length) { grid.innerHTML += `<div style="grid-column:1/-1;font-size:12px;font-weight:600;color:var(--fg3);padding:4px 0;text-transform:uppercase;letter-spacing:0.5px">Installed (${installed.length})</div>`; installed.forEach(a => grid.appendChild(appTile(a))); }
    if (available.length) { grid.innerHTML += `<div style="grid-column:1/-1;font-size:12px;font-weight:600;color:var(--fg3);padding:4px 0;text-transform:uppercase;letter-spacing:0.5px">Available (${available.length})</div>`; available.forEach(a => grid.appendChild(appTile(a))); }
  } catch (_) { $('#app-grid').innerHTML = '<div class="empty">Failed to load</div>'; }
}

function appTile(a) {
  const d = document.createElement('div');
  d.className = 'app-tile';
  const colors = ['blue','purple','green','orange','red','teal','pink'];
  const cls = colors[Math.abs(hashStr(a.name)) % colors.length];
  const fallbackIcon = (a.icon || '&#9881;').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const iconContent = a.icon_url ? `<img src="${escH(a.icon_url)}" onerror="this.parentElement.innerHTML='${escH(fallbackIcon)}'">` : (a.icon || '&#9881;');
  d.innerHTML = `<div class="app-icon ${cls}">${iconContent}</div><div><div class="app-name">${escH(a.name)}</div><div class="app-pkg">${escH(a.id)}</div></div>`;
  d.onclick = () => appDetail(a);
  return d;
}

function appDetail(a) {
  showModal(`<h3>${escH(a.name)}</h3><p style="color:var(--fg2);font-size:13px;margin-bottom:12px">${escH(a.description || a.desc || 'No description')}</p><p style="font-size:11px;color:var(--fg3);margin-bottom:16px">${escH(a.id)}</p><div style="display:flex;gap:8px"><button class="btn-sm" onclick="closeModal()">Close</button>${a.installed ? `<button class="btn-danger" onclick="appUninstall('${escA(a.id)}')">Uninstall</button>` : `<button class="btn-primary" style="width:auto;padding:8px 20px" onclick="appInstall('${escA(a.id)}','${escA(a.name)}')">Install</button>`}</div>`);
}

async function appInstall(id, name) {
  closeModal(); toast('Installing ' + name + '...', 'info');
  try { const r = await api('/api/store/install', { method: 'POST', body: JSON.stringify({ id }) }); toast(r.ok ? name + ' installed' : r.error, r.ok ? 'success' : 'error'); if (state.view === 'apps') renderApps($('#views')); } catch (_) { toast('Failed', 'error'); }
}

async function appUninstall(id) {
  closeModal();
  try { const r = await api('/api/store/remove', { method: 'POST', body: JSON.stringify({ id }) }); toast(r.ok ? 'Uninstalled' : r.error, r.ok ? 'success' : 'error'); if (state.view === 'apps') renderApps($('#views')); } catch (_) {}
}

// ── Store ──
let storeTab = 'local';
function skeletonStoreGrid() {
  let h = '';
  for (let i = 0; i < 6; i++) h += `<div class="skeleton-card" style="padding:14px;display:flex;gap:12px"><div class="skeleton" style="width:44px;height:44px;border-radius:12px;flex-shrink:0"></div><div style="flex:1;display:flex;flex-direction:column;gap:8px"><div class="skeleton skeleton-line w60" style="height:13px"></div><div class="skeleton skeleton-line w80" style="height:11px"></div><div class="skeleton skeleton-line w40" style="height:10px"></div><div class="skeleton" style="width:60px;height:28px;border-radius:6px;margin-top:4px"></div></div></div>`;
  return h;
}
async function renderStore(el) {
  el.innerHTML = `<div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap" id="store-tabs"></div><div style="margin-bottom:14px" id="store-search"></div><div class="store-grid" id="store-grid">${skeletonStoreGrid()}</div>`;
  const tabs = $('#store-tabs');
  ['local', 'fdroid', 'apkpure', 'termux'].forEach(t => {
    const b = document.createElement('button');
    b.className = 'btn-sm' + (storeTab === t ? ' active' : '');
    b.textContent = t === 'local' ? 'Local' : t === 'fdroid' ? 'F-Droid' : t === 'apkpure' ? 'APKPure' : 'Termux';
    b.onclick = () => { storeTab = t; renderStore(el); };
    tabs.appendChild(b);
  });
  const search = $('#store-search');
  if (storeTab !== 'local') {
    search.innerHTML = `<div style="display:flex;gap:8px"><input id="store-q" placeholder="Search ${storeTab}..." style="flex:1"><button class="btn-primary" style="width:auto;padding:8px 16px" onclick="storeSearch()">Search</button></div>`;
    setTimeout(() => $('#store-q')?.focus(), 100);
    $('#store-q')?.addEventListener('keydown', e => { if (e.key === 'Enter') storeSearch(); });
  } else { search.innerHTML = ''; }
  loadStoreItems();
}

async function storeSearch() {
  const q = $('#store-q')?.value?.trim();
  if (!q) return;
  const grid = $('#store-grid');
  grid.innerHTML = '<div class="empty">Searching...</div>';
  try {
    const r = await api('/api/android/online-search?q=' + encodeURIComponent(q) + '&source=' + storeTab);
    const items = r.results || [];
    if (items.length === 0) { grid.innerHTML = '<div class="empty">No results</div>'; return; }
    grid.innerHTML = '';
    items.forEach(p => grid.appendChild(storeCard(p, storeTab)));
  } catch (_) { grid.innerHTML = '<div class="empty">Search failed</div>'; }
}

async function loadStoreItems() {
  const grid = $('#store-grid');
  try {
    if (storeTab === 'local') {
      const r = await api('/api/store');
      const items = r.apps || [];
      if (items.length === 0) { grid.innerHTML = '<div class="empty">No apps available</div>'; return; }
      grid.innerHTML = '';
      items.forEach(p => grid.appendChild(storeCard(p, 'local')));
    } else { grid.innerHTML = '<div class="empty">Type a search query above</div>'; }
  } catch (_) { grid.innerHTML = '<div class="empty">Failed to load</div>'; }
}

function storeCard(p, source) {
  const d = document.createElement('div');
  d.className = 'store-card';
  const iconUrl = p.icon_url || (p.icon && String(p.icon).startsWith('http') ? p.icon : null);
  const icon = iconUrl ? `<img src="${escH(iconUrl)}" onerror="this.style.display='none'">` : '&#128230;';
  const meta = [];
  if (p.version) meta.push('v' + p.version);
  if (p.size) { const mb = (parseInt(p.size) / 1048576).toFixed(1); if (mb > 0) meta.push(mb + ' MB'); }
  d.innerHTML = `<div class="sc-icon">${icon}</div><div class="sc-info"><div class="sc-name">${escH(p.name || p.id)}</div>${meta.length ? `<div class="sc-meta">${meta.join(' · ')}</div>` : ''}<div class="sc-desc">${escH(p.summary || p.desc || p.description || '')}</div><div class="sc-btn"><button class="btn-primary" style="width:auto;padding:6px 14px;font-size:11px" onclick="event.stopPropagation();storeInstallObj(${escA(JSON.stringify({...p,source}))})">Install</button></div></div>`;
  return d;
}

async function storeInstallObj(p) {
  const { id, name, source, apkUrl } = p;
  const label = name || id;
  toast('Installing ' + label + '...', 'info');
  try {
    let r;
    if ((source === 'fdroid' || source === 'apkpure') && apkUrl) {
      const urlLower = apkUrl.toLowerCase();
      const format = urlLower.includes('xapk') || urlLower.includes('torrent') ? 'xapk' : urlLower.includes('.apks') ? 'apks' : 'apk';
      r = await api('/api/android/install-apk-url', { method: 'POST', body: JSON.stringify({ url: apkUrl, name: label, format }) });
      if (r.needsUserTap) toast('Open APK install on phone and tap Approve', 'info');
      else toast(r.ok ? label + ' installed' : (r.error || 'failed'), r.ok ? 'success' : 'error');
    } else if (source === 'termux') {
      r = await api('/api/store/install', { method: 'POST', body: JSON.stringify({ id: 'pkg:' + id }) });
      toast(r.ok ? label + ' installed' : r.error, r.ok ? 'success' : 'error');
    } else {
      r = await api('/api/store/install', { method: 'POST', body: JSON.stringify({ id }) });
      toast(r.ok ? label + ' installed' : r.error, r.ok ? 'success' : 'error');
    }
    if (state.view === 'apps') renderApps($('#views'));
  } catch (_) { toast('Failed', 'error'); }
}

// ── Android ──
let androidPollTimer = null;
let androidStreamImg = null;
let androidFullscreen = false;

async function renderAndroid(el) {
  if (androidPollTimer) { clearInterval(androidPollTimer); androidPollTimer = null; }
  if (androidStreamImg) { androidStreamImg.src = ''; androidStreamImg = null; }
  el.innerHTML = `<div class="android-layout" id="android-layout"><div class="android-phone" id="screen-box"><div class="skeleton" style="width:100%;height:100%;border-radius:var(--radius-lg)"></div></div><div class="android-ctrl" id="android-ctrl"><div class="skeleton-card" style="height:100%"><div class="skeleton skeleton-line w40" style="height:16px;margin-bottom:16px"></div><div class="skeleton skeleton-line w80" style="height:12px;margin-bottom:8px"></div><div class="skeleton skeleton-line w60" style="height:12px;margin-bottom:8px"></div><div class="skeleton skeleton-line w80" style="height:12px;margin-bottom:8px"></div><div class="skeleton skeleton-line w40" style="height:12px"></div></div></div></div>`;
  let st = { adb: false, method: 'none' };
  try { st = await api('/api/android/status'); } catch (_) {}
  let shizuku = { running: false, connected: false };
  try { shizuku = await api('/api/android/shizuku/status'); } catch (_) {}
  const ctrl = $('#android-ctrl');
  if (!st.adb) {
    const rishStatus = shizuku.running ? '<span style="color:var(--green)">Shizuku running</span>' : '<span style="color:var(--orange)">Shizuku not detected</span>';
    ctrl.innerHTML = `<div class="ctrl-section"><h3 style="color:var(--orange)">No Shell Access</h3><p style="font-size:13px;color:var(--fg2);margin-bottom:12px">Live screen and remote input need Shizuku (rish) or ADB.</p><div style="padding:12px;background:var(--surface);border-radius:var(--radius-sm);margin-bottom:12px"><div style="font-size:12px;font-weight:600;margin-bottom:6px">Status: ${rishStatus}</div><ol style="font-size:11px;color:var(--fg2);margin:0;padding-left:16px;line-height:1.8"><li>Install <a href="https://play.google.com/store/apps/details?id=moe.shizuku.privileged.api" target="_blank">Shizuku</a> from Play Store</li><li>Open Shizuku → tap <b>Start</b></li><li>In Shizuku → Settings → <b>rish</b> → Write files to Termux</li><li>Allow battery optimization for both Termux and Shizuku</li><li>Click <b>Connect</b> below</li></ol></div><div style="display:flex;gap:8px"><button class="btn-primary" style="width:auto;padding:8px 16px" onclick="shizukuConnect()">Connect via Shizuku</button><button class="btn-sm" onclick="renderAndroid($('#views'))">Refresh</button></div></div><div class="ctrl-section"><h3>Installed Apps</h3><div class="app-list" id="android-apps"><div class="empty">Loading...</div></div></div>`;
    loadAndroidApps();
    return;
  }
  const methodLabel = st.method === 'rish' ? 'rish (Shizuku)' : 'ADB';
  ctrl.innerHTML = `<div class="ctrl-section"><h3>Controls <span style="color:var(--green);font-size:11px">&#9679; ${methodLabel}</span></h3><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn-sm" onclick="androidKey('home')" title="Home">&#127968;</button><button class="btn-sm" onclick="androidKey('back')" title="Back">&larr;</button><button class="btn-sm" onclick="androidKey('app_switch')" title="Recent">&#9776;</button><button class="btn-sm" onclick="androidKey('volume_up')" title="Volume Up">Vol+</button><button class="btn-sm" onclick="androidKey('volume_down')" title="Volume Down">Vol-</button><button class="btn-sm" onclick="androidKey('power')" title="Power">&#9211;</button><button class="btn-sm" onclick="androidToggleFullscreen()" id="btn-fullscreen" title="Fullscreen">&#x26F6;</button></div><div style="margin-top:10px;display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:var(--fg2)">Brightness</span><input type="range" min="1" max="255" value="${st.brightness || 70}" id="android-brightness" oninput="androidBrightness(this.value);$('#android-bri-val').textContent=this.value" style="flex:1"><span style="font-size:11px;color:var(--fg3);min-width:24px;text-align:right" id="android-bri-val">${st.brightness || 70}</span></div></div><div class="ctrl-section"><h3>Type Text</h3><div style="display:flex;gap:6px"><input id="type-text" placeholder="Type here..." onkeydown="if(event.key==='Enter')androidType()" style="flex:1"><button class="btn-primary" style="width:auto;padding:8px 14px" onclick="androidType()">Send</button></div></div><div class="ctrl-section"><h3>Installed Apps</h3><div class="app-list" id="android-apps" style="max-height:200px;overflow-y:auto"><div class="empty">Loading...</div></div></div>`;
  loadAndroidApps();
  const box = $('#screen-box');
  box.innerHTML = '';
  const img = document.createElement('img');
  img.style.cssText = 'width:100%;height:100%;object-fit:contain;cursor:crosshair;border-radius:8px';
  img.onclick = androidTapImg;
  img.onerror = () => { img.src = ''; setTimeout(() => { img.src = '/api/android/stream?t=' + Date.now(); }, 1000); };
  box.appendChild(img);
  androidStreamImg = img;
  img.src = '/api/android/stream?t=' + Date.now();
}

function androidToggleFullscreen() {
  const layout = $('#android-layout');
  if (!layout) return;
  androidFullscreen = !androidFullscreen;
  layout.classList.toggle('android-fullscreen', androidFullscreen);
  if (androidFullscreen && layout.requestFullscreen) layout.requestFullscreen().catch(() => {});
  else if (!androidFullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

async function loadAndroidApps() {
  const list = $('#android-apps');
  if (!list) return;
  try {
    const r = await api('/api/android/apps');
    if (r.ok && r.apps) {
      list.innerHTML = `<div class="empty">${r.total} installed</div>`;
      r.apps.slice(0, 100).forEach(p => {
        const d = document.createElement('div');
        d.className = 'app-list-item';
        d.textContent = p.package;
        d.onclick = () => androidLaunch(p.package);
        list.appendChild(d);
      });
    }
  } catch (_) { if (list) list.innerHTML = '<div class="empty">Failed</div>'; }
}

async function shizukuConnect() {
  toast('Connecting via Shizuku...', 'info');
  try {
    const r = await api('/api/android/shizuku/connect', { method: 'POST', body: JSON.stringify({}) });
    toast(r.ok ? 'Connected via Shizuku' : (r.error || 'Shizuku not running'), r.ok ? 'success' : 'error');
    if (r.ok && state.view === 'android') renderAndroid($('#views'));
  } catch (_) { toast('Failed', 'error'); }
}

const STREAM_W = 720, STREAM_H = 1280;
async function androidTapImg(e) {
  const img = e.target;
  const rect = img.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = Math.round((e.clientX - rect.left) / rect.width * STREAM_W);
  const y = Math.round((e.clientY - rect.top) / rect.height * STREAM_H);
  try { await api('/api/android/input', { method: 'POST', body: JSON.stringify({ type: 'tap', x, y }) }); } catch (_) {}
}

let swipeStart = null;
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('mousedown', e => { if (e.target.closest('#screen-box') && androidStreamImg) swipeStart = { x: e.clientX, y: e.clientY, t: Date.now() }; });
  document.addEventListener('mouseup', e => {
    if (!swipeStart || !e.target.closest('#screen-box')) { swipeStart = null; return; }
    const dx = e.clientX - swipeStart.x, dy = e.clientY - swipeStart.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const dt = Date.now() - swipeStart.t;
    const startX = swipeStart.x, startY = swipeStart.y;
    swipeStart = null;
    if (dist < 10 || dt > 500) return;
    const img = androidStreamImg;
    const rect = img.getBoundingClientRect();
    const sx = Math.round((startX - rect.left) / rect.width * STREAM_W);
    const sy = Math.round((startY - rect.top) / rect.height * STREAM_H);
    const ex = Math.round((e.clientX - rect.left) / rect.width * STREAM_W);
    const ey = Math.round((e.clientY - rect.top) / rect.height * STREAM_H);
    api('/api/android/input', { method: 'POST', body: JSON.stringify({ type: 'swipe', x1: sx, y1: sy, x2: ex, y2: ey, duration: Math.min(dt, 300) }) }).catch(() => {});
  });
});

const ANDROID_KEYS = { home: 3, back: 4, menu: 82, app_switch: 187, power: 26, enter: 66, volume_up: 24, volume_down: 25 };
async function androidKey(key) { try { await api('/api/android/input', { method: 'POST', body: JSON.stringify({ type: 'key', keycode: ANDROID_KEYS[key] || key }) }); } catch (_) {} }
async function androidType() { const t = $('#type-text')?.value; if (!t) return; try { await api('/api/android/input', { method: 'POST', body: JSON.stringify({ type: 'text', text: t }) }); toast('Typed', 'success'); } catch (_) {} }
async function androidBrightness(v) { try { await api('/api/android/display', { method: 'POST', body: JSON.stringify({ action: 'brightness', value: parseInt(v) }) }); } catch (_) {} }
async function androidLaunch(pkg) { try { await api('/api/android/apps/launch', { method: 'POST', body: JSON.stringify({ package: pkg }) }); } catch (_) {} }

// ── Docs ──
function skeletonDocList() {
  let h = '';
  for (let i = 0; i < 8; i++) h += `<div class="skeleton-card" style="padding:14px"><div class="skeleton skeleton-line w40" style="height:13px;margin-bottom:6px"></div><div class="skeleton skeleton-line w80" style="height:11px"></div></div>`;
  return h;
}
async function renderDocs(el) {
  el.innerHTML = `<div style="margin-bottom:14px"><input id="docs-q" placeholder="Search CLI tools..."></div><div id="docs-list" style="display:flex;flex-direction:column;gap:6px">${skeletonDocList()}</div>`;
  $('#docs-q')?.addEventListener('input', () => loadDocs());
  await loadDocs();
}

async function loadDocs() {
  const q = ($('#docs-q')?.value || '').toLowerCase().trim();
  const list = $('#docs-list');
  try {
    const r = await api('/api/store/docs');
    const obj = r.docs || {};
    let docs = Object.keys(obj).map(k => ({ name: k, ...obj[k] }));
    if (q) docs = docs.filter(d => d.name.toLowerCase().includes(q) || (d.about || '').toLowerCase().includes(q));
    list.innerHTML = docs.map(d => `<div class="doc-item" onclick="docDetail('${escA(d.name)}')"><h4>${escH(d.name)}</h4><p>${escH(d.about || '')}</p></div>`).join('') || '<div class="empty">No docs found</div>';
  } catch (_) { list.innerHTML = '<div class="empty">Failed to load</div>'; }
}

async function docDetail(name) {
  try {
    const r = await api('/api/store/docs?id=' + encodeURIComponent(name));
    if (!r.ok) return;
    const d = r.doc;
    showModal(`<h3>${escH(d.name)}</h3><p style="color:var(--fg2);margin-bottom:12px">${escH(d.about || '')}</p><pre style="background:var(--surface);padding:12px;border-radius:var(--radius-xs);overflow-x:auto;font-size:12px;font-family:var(--font-mono)">${escH(d.syntax || '')}</pre>${d.options ? `<h4 style="margin-top:12px;margin-bottom:6px;font-size:12px;color:var(--fg2)">Options</h4><pre style="background:var(--surface);padding:12px;border-radius:var(--radius-xs);overflow-x:auto;font-size:11px;font-family:var(--font-mono)">${escH(d.options)}</pre>` : ''}<div style="margin-top:12px"><button class="btn-sm" onclick="closeModal()">Close</button></div>`);
  } catch (_) {}
}

// ── Logs ──
async function renderLogs(el) {
  el.innerHTML = `<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap"><button class="btn-sm active" onclick="loadLogs('access')" id="log-access">Access Log</button><button class="btn-sm" onclick="loadLogs('package')" id="log-package">Package Log</button><button class="btn-sm" onclick="loadLogs('run')" id="log-run">Run Log</button><span style="flex:1"></span><button class="btn-sm" onclick="renderLogs($('#views'))">&#8635;</button></div><div class="term-box" style="height:calc(100vh - 200px)"><div id="log-output" style="flex:1;overflow-y:auto;padding:16px"><div class="skeleton skeleton-line w80" style="height:11px;margin-bottom:6px"></div><div class="skeleton skeleton-line w60" style="height:11px;margin-bottom:6px"></div><div class="skeleton skeleton-line w80" style="height:11px;margin-bottom:6px"></div><div class="skeleton skeleton-line w40" style="height:11px;margin-bottom:6px"></div><div class="skeleton skeleton-line w80" style="height:11px;margin-bottom:6px"></div><div class="skeleton skeleton-line w60" style="height:11px"></div></div></div>`;
  await loadLogs('access');
}

async function loadLogs(type) {
  $$('.btn-sm').forEach(b => b.classList.remove('active'));
  const btn = $('#log-' + type);
  if (btn) btn.classList.add('active');
  const out = $('#log-output');
  if (!out) return;
  out.style.cssText = 'flex:1;overflow-y:auto;padding:16px;font-family:var(--font-mono);font-size:11px;line-height:1.7;color:var(--fg2);white-space:pre-wrap;word-break:break-all';
  try {
    const r = await api('/api/logs?which=' + type + '&lines=200');
    out.textContent = (r.lines || []).join('\n') || r.error || 'No log data';
    out.scrollTop = out.scrollHeight;
  } catch (_) { out.textContent = 'Failed to load'; }
}

// ── Settings ──
async function renderSettings(el) {
  let cfg = {};
  try { const r = await api('/api/config'); cfg = r.config || {}; } catch (_) {}
  el.innerHTML = `<div style="max-width:520px">
    <div class="ctrl-section"><h3>Server Info</h3><div style="display:flex;flex-direction:column;gap:6px;font-size:13px"><div><span style="color:var(--fg2)">Host:</span> ${location.hostname}</div><div><span style="color:var(--fg2)">Port:</span> ${location.port || '443'}</div><div><span style="color:var(--fg2)">User:</span> ${escH(CURRENT_USER)}</div></div></div>
    <div class="ctrl-section"><h3>Shizuku / Shell Access</h3><div><label style="font-size:12px;color:var(--fg2)">SSH Password</label><input id="cfg-ssh-pw" type="password" value="${escH(cfg.sshPassword || '')}" placeholder="Optional SSH password" style="margin-top:4px"></div></div>
    <div class="ctrl-section"><h3>Screen Streaming</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><label style="font-size:12px;color:var(--fg2)">Resolution</label><select id="cfg-resolution" style="margin-top:4px"><option value="360x640" ${cfg.streamResolution==='360x640'?'selected':''}>360x640</option><option value="720x1280" ${(cfg.streamResolution||'720x1280')==='720x1280'?'selected':''}>720x1280</option><option value="1080x1920" ${cfg.streamResolution==='1080x1920'?'selected':''}>1080x1920</option></select></div><div><label style="font-size:12px;color:var(--fg2)">FPS</label><select id="cfg-fps" style="margin-top:4px"><option value="10" ${(cfg.streamFps||20)==10?'selected':''}>10 fps</option><option value="20" ${(cfg.streamFps||20)==20?'selected':''}>20 fps</option><option value="30" ${cfg.streamFps==30?'selected':''}>30 fps</option></select></div><div><label style="font-size:12px;color:var(--fg2)">Bitrate</label><select id="cfg-bitrate" style="margin-top:4px"><option value="500000" ${cfg.streamBitrate==500000?'selected':''}>500 Kbps</option><option value="1000000" ${cfg.streamBitrate==1000000?'selected':''}>1 Mbps</option><option value="2000000" ${(cfg.streamBitrate||2000000)==2000000?'selected':''}>2 Mbps</option><option value="4000000" ${cfg.streamBitrate==4000000?'selected':''}>4 Mbps</option></select></div><div><label style="font-size:12px;color:var(--fg2)">Quality</label><select id="cfg-quality" style="margin-top:4px"><option value="4" ${cfg.streamQuality==4?'selected':''}>Best</option><option value="8" ${(cfg.streamQuality||8)==8?'selected':''}>Good</option><option value="15" ${cfg.streamQuality==15?'selected':''}>Fast</option></select></div></div></div>
    <div class="ctrl-section"><h3>Device Options</h3><div style="display:flex;flex-direction:column;gap:10px"><label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="checkbox" id="cfg-root-mode" ${cfg.rootMode?'checked':''}> Root mode</label><label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="checkbox" id="cfg-wake-screen" ${cfg.wakeScreenOnStream!==false?'checked':''}> Wake screen before streaming</label><label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="checkbox" id="cfg-auto-reconnect" ${cfg.autoReconnectAdb!==false?'checked':''}> Auto-reconnect ADB</label><div><label style="font-size:12px;color:var(--fg2)">Reconnect Interval (s)</label><input id="cfg-reconnect-interval" type="number" value="${cfg.adbReconnectInterval || 30}" min="5" max="300" style="margin-top:4px"></div><div><label style="font-size:12px;color:var(--fg2)">Record Timeout (s)</label><input id="cfg-record-timeout" type="number" value="${cfg.screenRecordTimeout || 180}" min="0" max="1800" style="margin-top:4px"></div></div></div>
    <div style="display:flex;gap:10px"><button class="btn-primary" style="width:auto;padding:10px 24px" onclick="saveConfig()">Save</button><button class="btn-sm" onclick="renderSettings($('#views'))">Reset</button><span style="flex:1"></span><button class="btn-danger" onclick="doLogout()">Sign Out</button></div></div>`;
}

async function saveConfig() {
  const cfg = {
    sshPassword: $('#cfg-ssh-pw')?.value || '',
    streamResolution: $('#cfg-resolution')?.value || '720x1280',
    streamFps: parseInt($('#cfg-fps')?.value || '20'),
    streamBitrate: parseInt($('#cfg-bitrate')?.value || '2000000'),
    streamQuality: parseInt($('#cfg-quality')?.value || '8'),
    rootMode: $('#cfg-root-mode')?.checked || false,
    wakeScreenOnStream: $('#cfg-wake-screen')?.checked !== false,
    autoReconnectAdb: $('#cfg-auto-reconnect')?.checked !== false,
    adbReconnectInterval: parseInt($('#cfg-reconnect-interval')?.value || '30'),
    screenRecordTimeout: parseInt($('#cfg-record-timeout')?.value || '180'),
  };
  try { const r = await api('/api/config', { method: 'POST', body: JSON.stringify(cfg) }); toast(r.ok ? 'Settings saved' : 'Failed', r.ok ? 'success' : 'error'); } catch (_) { toast('Failed to save', 'error'); }
}

async function doLogout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch (_) {}
  TOKEN = ''; CURRENT_USER = ''; localStorage.removeItem('adm_token'); location.reload();
}

// ── Helpers ──
function escH(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function escA(s) { return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'\\"'); }
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return h; }
function fileIcon(name) { const ext = name.split('.').pop().toLowerCase(); if (['js','ts'].includes(ext)) return '&#128187;'; if (['json'].includes(ext)) return '&#128196;'; if (['md','txt'].includes(ext)) return '&#128221;'; if (['sh'].includes(ext)) return '&#9881;'; if (['png','jpg','jpeg','gif','svg'].includes(ext)) return '&#128247;'; if (['mp3','wav','ogg'].includes(ext)) return '&#127925;'; if (['mp4','mkv'].includes(ext)) return '&#127916;'; if (['zip','tar','gz'].includes(ext)) return '&#128230;'; return '&#128196;'; }
function fmtSize(b) { if (!b || b < 0) return ''; if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB'; return (b / 1073741824).toFixed(1) + ' GB'; }

function showModal(html) {
  closeSidebar();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.id = 'modal-bg';
  bg.onclick = e => { if (e.target === bg) closeModal(); };
  bg.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(bg);
}
function closeModal() { $('#modal-bg')?.remove(); }
function closeSidebar() { $('#sidebar')?.classList.remove('open'); }

// ── Init ──
initParticles();

$('#hamburger')?.addEventListener('click', () => $('#sidebar')?.classList.toggle('open'));
document.addEventListener('click', e => { if (!e.target.closest('.sidebar') && !e.target.closest('.hamburger')) closeSidebar(); });
$('#refresh')?.addEventListener('click', () => renderView(state.view));
$('#logout')?.addEventListener('click', doLogout);

(async function() {
  if (TOKEN) {
    try {
      const r = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + TOKEN } });
      if (r.ok) { const j = await r.json(); if (j.ok) { CURRENT_USER = j.username; showDash(); return; } }
    } catch (_) {}
  }
  showGate();
})();
