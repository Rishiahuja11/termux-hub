/* globals hljs */
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let TOKEN = localStorage.getItem('adm_token') || '';
let CURRENT_USER = '';

const VIEWS = [
  { id: 'dashboard', icon: '&#9673;', name: 'Dashboard' },
  { id: 'terminal', icon: '&#9618;', name: 'Terminal' },
  { id: 'files', icon: '&#9776;', name: 'Files' },
  { id: 'apps', icon: '&#9881;', name: 'Apps' },
  { id: 'store', icon: '&#10070;', name: 'Store' },
  { id: 'android', icon: '&#9743;', name: 'Android' },
  { id: 'docs', icon: '&#9998;', name: 'Docs' },
  { id: 'logs', icon: '&#9881;', name: 'Logs' },
  { id: 'settings', icon: '&#9883;', name: 'Settings' },
];

let state = { view: 'dashboard', fmPath: null, fmSelected: [], termHistory: [], termHistIdx: -1 };

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
  const gate = $('#gate');
  gate.classList.remove('hidden');
  // Check if any users exist by trying /api/auth/me (will 401 if not logged in)
  // Show appropriate form
  const form = $('#gate-form');
  const userRow = $('#gate-user-row');
  const label = $('#gate-subtitle');
  const pwLabel = $('#gate-pw-label');
  const pw = $('#gate-password');
  const btn = $('#gate-btn');
  const toggle = $('#gate-toggle');

  // Always show username+password form
  userRow.style.display = '';
  pwLabel.textContent = 'Password';
  pw.type = 'password';
  btn.textContent = 'Sign In';
  label.textContent = 'Sign in to your device';
  toggle.textContent = 'Create account';
  toggle.onclick = () => {
    if (btn.textContent === 'Create Account') {
      btn.textContent = 'Sign In';
      label.textContent = 'Sign in to your device';
      toggle.textContent = 'Create account';
    } else {
      btn.textContent = 'Create Account';
      label.textContent = 'Set up your account';
      toggle.textContent = 'Sign in instead';
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
      if (r.ok) {
        TOKEN = r.token;
        CURRENT_USER = r.username;
        localStorage.setItem('adm_token', TOKEN);
        showDash();
      } else {
        $('#gate-err').textContent = r.error || 'Failed';
      }
    } catch (_) {
      $('#gate-err').textContent = 'Connection failed';
    }
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
    d.innerHTML = `<span class="ico">${v.icon}</span><span>${v.name}</span>`;
    d.onclick = () => navigateTo(v.id);
    nav.appendChild(d);
  });
}

function navigateTo(viewId) {
  state.view = viewId;
  location.hash = viewId;
  $$('.nav-item').forEach((el, i) => {
    el.classList.toggle('active', VIEWS[i].id === viewId);
  });
  $('#view-title').textContent = VIEWS.find(v => v.id === viewId)?.name || '';
  renderView(viewId);
}

function renderView(id) {
  if (id !== 'android') {
    if (androidPollTimer) { clearInterval(androidPollTimer); androidPollTimer = null; }
    if (androidStreamImg) { androidStreamImg.src = ''; androidStreamImg = null; }
    if (androidFullscreen) { androidFullscreen = false; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  }
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

// ── Dashboard ──
async function renderDashboard(el) {
  el.innerHTML = '<div class="stats-row" id="stats-row"></div><h3 style="margin-bottom:16px">Quick Actions</h3><div class="card-grid" id="quick-grid"></div>';
  const grid = $('#quick-grid');
  grid.innerHTML = '<div class="empty">Loading...</div>';

  // System stats
  api('/api/system').then(s => {
    const sr = $('#stats-row');
    if (!sr) return;
    const fmtUptime = sec => { if (!sec && sec !== 0) return '?'; const d = Math.floor(sec/86400), h = Math.floor(sec%86400/3600), m = Math.floor(sec%3600/60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };
    const mem = s.mem_total ? ((s.mem_used / s.mem_total) * 100).toFixed(0) + '%' : '?';
    const cap = b => b ? (b > 1073741824 ? (b/1073741824).toFixed(1)+' GB' : b > 1048576 ? (b/1048576).toFixed(0)+' MB' : b > 1024 ? (b/1024).toFixed(0)+' KB' : b+' B') : '?';
    const diskUsed = s.storage ? ((s.storage.used / s.storage.total) * 100).toFixed(0) + '%' : '?';
    sr.innerHTML = `
      <div class="stat"><span class="label">Uptime</span><span class="value">${fmtUptime(s.uptime)}</span></div>
      <div class="stat"><span class="label">CPU Load</span><span class="value">${s.cpu_load != null ? s.cpu_load : '?'}</span></div>
      <div class="stat"><span class="label">Memory</span><span class="value">${mem}<span style="font-size:12px;color:var(--fg2)"> ${cap(s.mem_used)}</span></span></div>
      <div class="stat"><span class="label">Disk</span><span class="value">${diskUsed}<span style="font-size:12px;color:var(--fg2)"> ${s.storage ? cap(s.storage.used) : ''}</span></span></div>
    `;
  }).catch(() => {});

  const icons = ['blue','purple','green','orange','red','teal','pink'];
  const items = [
    { ico: '&#9618;', name: 'Terminal', desc: 'Shell access', cls: 'blue', view: 'terminal' },
    { ico: '&#9776;', name: 'Files', desc: 'Browse & manage', cls: 'green', view: 'files' },
    { ico: '&#9881;', name: 'Apps', desc: 'Manage apps', cls: 'purple', view: 'apps' },
    { ico: '&#10070;', name: 'Store', desc: 'Install apps', cls: 'orange', view: 'store' },
    { ico: '&#9743;', name: 'Android', desc: 'Remote control', cls: 'red', view: 'android' },
    { ico: '&#9998;', name: 'Docs', desc: 'CLI reference', cls: 'teal', view: 'docs' },
    { ico: '&#9883;', name: 'Settings', desc: 'Config', cls: 'pink', view: 'settings' },
  ];
  grid.innerHTML = '';
  items.forEach(it => {
    const d = document.createElement('div');
    d.className = 'card';
    d.onclick = () => navigateTo(it.view);
    d.innerHTML = `<div class="card-icon ${it.cls}">${it.ico}</div><h3>${it.name}</h3><p>${it.desc}</p>`;
    grid.appendChild(d);
  });
}

// ── Terminal ──
function renderTerminal(el) {
  el.innerHTML = `<div class="term"><div class="term-output" id="term-output"></div><div class="term-input-row"><span class="term-prompt">$</span><input id="term-input" type="text" placeholder="Enter command..." autocomplete="off"></div></div>`;
  const out = $('#term-output');
  const inp = $('#term-input');
  if (state.termHistory.length === 0) {
    out.innerHTML = '<span style="color:var(--accent2)">Welcome to TermuX Hub Terminal</span>\n';
  }
  inp.focus();
  inp.onkeydown = async e => {
    if (e.key === 'Enter') {
      const cmd = inp.value.trim();
      if (!cmd) return;
      state.termHistory.push(cmd);
      state.termHistIdx = state.termHistory.length;
      out.innerHTML += `<span style="color:var(--accent2)">$</span> ${escH(cmd)}\n`;
      inp.value = '';
      try {
        const r = await api('/exec', { method: 'POST', body: JSON.stringify({ cmd, timeout: 120 }) });
        const outText = (r.stdout || '') + (r.stderr || '');
        if (outText) out.innerHTML += escH(outText);
      } catch (_) { out.innerHTML += '<span style="color:var(--danger)">Error running command</span>\n'; }
      out.scrollTop = out.scrollHeight;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (state.termHistIdx > 0) { state.termHistIdx--; inp.value = state.termHistory[state.termHistIdx]; }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (state.termHistIdx < state.termHistory.length - 1) { state.termHistIdx++; inp.value = state.termHistory[state.termHistIdx]; } else { state.termHistIdx = state.termHistory.length; inp.value = ''; }
    }
  };
}

// ── File Manager ──
let fmRoot = null;
async function renderFiles(el) {
  el.innerHTML = '<div class="fm-toolbar" id="fm-toolbar"></div><div class="fm-list" id="fm-list"><div class="empty">Loading...</div></div>';
  if (!fmRoot) {
    try { const s = await api('/api/system'); fmRoot = s.home || '/data/data/com.termux/files/home'; } catch (_) { fmRoot = '/data/data/com.termux/files/home'; }
  }
  if (state.fmPath == null) { state.fmPath = fmRoot; }
  fmRender();
}

async function fmRender() {
  const tb = $('#fm-toolbar');
  const list = $('#fm-list');
  if (!tb || !list) return;
  // Toolbar
  tb.innerHTML = `<div class="breadcrumb" id="fm-bc"></div>
    <button class="btn ghost sm" id="fm-up" onclick="fmUp()">&#8593; Up</button>
    <button class="btn ghost sm" id="fm-home" onclick="fmGoto(fmRoot)">~</button>
    <button class="btn ghost sm" id="fm-sdcard" onclick="fmGoto('/sdcard')">SD</button>
    <button class="btn ghost sm" id="fm-new" onclick="fmNew()">+ New</button>
    <button class="btn ghost sm" id="fm-refresh" onclick="fmRender()">&#8635;</button>`;
  if (state.fmSelected.length > 0) {
    tb.innerHTML += `<span style="color:var(--fg2);font-size:13px">${state.fmSelected.length} selected</span>
      <button class="btn ghost sm" onclick="fmMultiAction('download')">Download</button>
      <button class="btn ghost sm" onclick="fmMultiAction('zip')">Zip</button>
      <button class="btn ghost sm" onclick="fmMultiAction('move')">Move</button>
      <button class="btn ghost sm" onclick="fmMultiAction('delete')" style="color:var(--danger)">Delete</button>`;
  }
  // Breadcrumb
  const bc = $('#fm-bc');
  if (bc) {
    const isHome = state.fmPath.startsWith(fmRoot);
    bc.innerHTML = `<span onclick="fmGoto(fmRoot)">~</span>`;
    if (!isHome) bc.innerHTML += ` <span onclick="fmGoto('/sdcard')">sdcard</span>`;
    let cum = isHome ? fmRoot : '/sdcard';
    const parts = state.fmPath.startsWith(fmRoot) ? state.fmPath.slice(fmRoot.length).split('/').filter(Boolean) : state.fmPath.replace(/^\/sdcard\/?/, '').split('/').filter(Boolean);
    parts.forEach((p) => {
      cum += '/' + p;
      bc.innerHTML += `<span onclick="fmGoto('${escA(cum)}')">${escH(p)}</span>`;
    });
  }
  // List
  try {
    const r = await api('/fs/list?path=' + encodeURIComponent(state.fmPath));
    if (!r.ok) { list.innerHTML = `<div class="empty">${escH(r.error)}</div>`; return; }
    const entries = r.entries || [];
    entries.sort((a, b) => (b.isDir ? 1 : 0) - (a.isDir ? 1 : 0) || a.name.localeCompare(b.name));
    if (entries.length === 0) { list.innerHTML = '<div class="empty">Empty directory</div>'; return; }
    list.innerHTML = '';
    entries.forEach(e => {
      const d = document.createElement('div');
      d.className = 'fm-item';
      const checked = state.fmSelected.includes(e.name);
      const ico = e.isDir ? '&#128193;' : fileIcon(e.name);
      const meta = e.isDir ? '' : fmtSize(e.size);
      d.innerHTML = `<input type="checkbox" ${checked ? 'checked' : ''} onclick="event.stopPropagation();fmToggle('${escA(e.name)}')">
        <span class="icon">${ico}</span>
        <span class="name">${escH(e.name)}</span>
        <span class="meta">${meta}</span>`;
      d.onclick = () => { if (e.isDir) fmGoto(state.fmPath + '/' + e.name); else fmOpenFile(state.fmPath + '/' + e.name); };
      list.appendChild(d);
    });
  } catch (_) { list.innerHTML = '<div class="empty">Failed to load</div>'; }
}

function fmGoto(p) { state.fmPath = p; state.fmSelected = []; fmRender(); }
function fmUp() { if (state.fmPath === fmRoot) return; const p = state.fmPath.split('/'); p.pop(); const joined = p.join('/') || fmRoot; fmGoto(joined === fmRoot ? fmRoot : joined); }
function fmToggle(name) { const i = state.fmSelected.indexOf(name); if (i >= 0) state.fmSelected.splice(i, 1); else state.fmSelected.push(name); fmRender(); }

async function fmOpenFile(p) {
  try {
    const r = await api('/fs/read?path=' + encodeURIComponent(p));
    if (!r.ok) return toast(r.error, 'error');
    let content = '';
    try { content = r.base64 ? decodeURIComponent(escape(atob(r.base64))) : (r.content || ''); } catch (_) { content = r.content || ''; }
    showModal(`<h3>${escH(p.split('/').pop())}</h3><div class="editor"><textarea id="modal-editor" style="min-height:300px;font-family:monospace">${escH(content)}</textarea><div class="btn-row"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="fmSave('${escA(p)}')">Save</button></div></div>`);
  } catch (_) {}
}

async function fmSave(p) {
  const content = $('#modal-editor')?.value;
  if (content == null) return;
  try { await api('/fs/write', { method: 'POST', body: JSON.stringify({ path: p, content }) }); toast('Saved', 'success'); closeModal(); } catch (_) { toast('Failed', 'error'); }
}

async function fmNew() {
  showModal(`<h3>Create New</h3>
    <div class="field"><label>Name</label><input id="fm-new-name" class="inp" placeholder="filename or folder/"></div>
    <div class="field"><label>Type</label><select id="fm-new-type" class="inp"><option value="file">File</option><option value="folder">Folder</option></select></div>
    <div class="btn-row"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="fmDoNew()">Create</button></div>`);
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
    try {
      for (const f of files) await api('/fs/delete', { method: 'POST', body: JSON.stringify({ path: f }) });
      toast('Deleted', 'success'); state.fmSelected = []; fmRender();
    } catch (_) { toast('Failed', 'error'); }
  } else if (action === 'download' || action === 'zip') {
    const params = encodeURIComponent(JSON.stringify(files));
    try {
      const r = await fetch('/fs/zip?paths=' + params, { headers: { Authorization: 'Bearer ' + TOKEN } });
      if (!r.ok) { toast('Failed: ' + (await r.text()), 'error'); return; }
      const blob = await r.blob();
      const name = files.length === 1 ? files[0].split('/').pop() + '.zip' : 'download-' + Date.now() + '.zip';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast('Downloaded', 'success');
    } catch (_) { toast('Download failed', 'error'); }
  } else if (action === 'move') {
    const dest = prompt('Move to directory:');
    if (!dest) return;
    try { await api('/fs/move', { method: 'POST', body: JSON.stringify({ paths: files, dest }) }); toast('Moved', 'success'); state.fmSelected = []; fmRender(); } catch (_) { toast('Failed', 'error'); }
  }
}

// ── Apps ──
async function renderApps(el) {
  el.innerHTML = '<div class="app-grid" id="app-grid"><div class="empty">Loading...</div></div>';
  try {
    const r = await api('/api/store');
    const apps = r.apps || [];
    const grid = $('#app-grid');
    if (apps.length === 0) { grid.innerHTML = '<div class="empty">No apps found</div>'; return; }
    grid.innerHTML = '';
    const installed = apps.filter(a => a.installed);
    const available = apps.filter(a => !a.installed);
    if (installed.length) {
      grid.innerHTML += `<div style="grid-column:1/-1;font-size:13px;font-weight:600;color:var(--fg2);padding:4px 0">INSTALLED (${installed.length})</div>`;
      installed.forEach(a => grid.appendChild(appTile(a)));
    }
    if (available.length) {
      grid.innerHTML += `<div style="grid-column:1/-1;font-size:13px;font-weight:600;color:var(--fg2);padding:4px 0">AVAILABLE (${available.length})</div>`;
      available.forEach(a => grid.appendChild(appTile(a)));
    }
  } catch (_) { $('#app-grid').innerHTML = '<div class="empty">Failed to load</div>'; }
}

function appTile(a) {
  const d = document.createElement('div');
  d.className = 'app-tile';
  const colors = ['blue','purple','green','orange','red','teal','pink'];
  const cls = colors[Math.abs(hashStr(a.name)) % colors.length];
  const fallbackIcon = (a.icon || '⚙').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const iconContent = a.icon_url ? `<img src="${escH(a.icon_url)}" onerror="this.parentElement.innerHTML='${escH(fallbackIcon)}'">` : (a.icon || '⚙');
  d.innerHTML = `<div class="app-icon ${cls}">${iconContent}</div>
    <div class="app-name">${escH(a.name)}</div>
    <div class="app-pkg">${escH(a.id)}</div>`;
  d.onclick = () => appDetail(a);
  return d;
}

function appDetail(a) {
  const installed = a.installed;
  showModal(`<h3>${escH(a.name)}</h3>
    <p style="color:var(--fg2);font-size:14px;margin-bottom:12px">${escH(a.description || a.desc || 'No description')}</p>
    <p style="font-size:12px;color:var(--fg3)">${escH(a.id)}</p>
    <div class="btn-row">
      <button class="btn ghost" onclick="closeModal()">Close</button>
      ${installed ? `<button class="btn danger" onclick="appUninstall('${escA(a.id)}')">Uninstall</button>` : `<button class="btn primary" onclick="appInstall('${escA(a.id)}','${escA(a.name)}')">Install</button>`}
    </div>`);
}

async function appInstall(id, name) {
  closeModal();
  toast('Installing ' + name + '...', 'info');
  try {
    const r = await api('/api/store/install', { method: 'POST', body: JSON.stringify({ id }) });
    toast(r.ok ? name + ' installed' : r.error, r.ok ? 'success' : 'error');
    if (state.view === 'apps') renderApps($('#views'));
  } catch (_) { toast('Failed', 'error'); }
}

async function appUninstall(id) {
  closeModal();
  try {
    const r = await api('/api/store/remove', { method: 'POST', body: JSON.stringify({ id }) });
    toast(r.ok ? 'Uninstalled' : r.error, r.ok ? 'success' : 'error');
    if (state.view === 'apps') renderApps($('#views'));
  } catch (_) {}
}

// ── Store ──
let storeTab = 'local';
async function renderStore(el) {
  el.innerHTML = `<div class="store-tabs" id="store-tabs"></div>
    <div class="store-search" id="store-search"></div>
    <div class="store-grid" id="store-grid"><div class="empty">Loading...</div></div>`;
  const tabs = $('#store-tabs');
  ['local', 'fdroid', 'apkpure', 'termux'].forEach(t => {
    const b = document.createElement('button');
    b.className = 'store-tab' + (storeTab === t ? ' active' : '');
    b.textContent = t === 'local' ? 'Local' : t === 'fdroid' ? 'F-Droid' : t === 'apkpure' ? 'APKPure' : 'Termux';
    b.onclick = () => { storeTab = t; renderStore(el); };
    tabs.appendChild(b);
  });
  const search = $('#store-search');
  if (storeTab !== 'local') {
    const srcLabel = storeTab === 'fdroid' ? 'F-Droid' : storeTab === 'apkpure' ? 'APKPure (Google Play)' : 'Termux packages';
    search.innerHTML = `<input class="inp" id="store-q" placeholder="Search ${srcLabel}...">
      <button class="btn primary" onclick="storeSearch()">Search</button>`;
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
    } else {
      grid.innerHTML = '<div class="empty">Type a search query above</div>';
    }
  } catch (_) { grid.innerHTML = '<div class="empty">Failed to load</div>'; }
}

function storeCard(p, source) {
  const d = document.createElement('div');
  d.className = 'store-card';
  const iconUrl = p.icon_url || (p.icon && String(p.icon).startsWith('http') ? p.icon : null);
  const icon = iconUrl ? `<img src="${escH(iconUrl)}" onerror="this.parentElement.innerHTML='&#128230;'">` : '&#128230;';
  const btn = document.createElement('button');
  btn.className = 'btn primary sm';
  btn.textContent = 'Install';
  btn.onclick = () => storeInstallObj({ ...p, source });
  const info = document.createElement('div');
  info.className = 'sc-info';
  const n = document.createElement('div');
  n.className = 'sc-name';
  n.textContent = p.name || p.id;
  const meta = [];
  if (p.version) meta.push('v' + p.version);
  if (p.size) { const mb = (parseInt(p.size) / 1048576).toFixed(1); if (mb > 0) meta.push(mb + ' MB'); }
  const ds = document.createElement('div');
  ds.className = 'sc-desc';
  ds.textContent = p.summary || p.desc || p.description || '';
  if (meta.length) {
    const mt = document.createElement('div');
    mt.className = 'sc-meta';
    mt.textContent = meta.join(' · ');
    info.appendChild(n); info.appendChild(mt); info.appendChild(ds);
  } else {
    info.appendChild(n); info.appendChild(ds);
  }
  const db = document.createElement('div');
  db.className = 'sc-btn';
  db.appendChild(btn);
  info.appendChild(db);
  const ic = document.createElement('div');
  ic.className = 'sc-icon';
  ic.innerHTML = icon;
  d.appendChild(ic); d.appendChild(info);
  return d;
}

async function storeInstallObj(p) {
  const { id, name, source, apkUrl } = p;
  const label = name || id;
  toast('Installing ' + label + '...', 'info');
  try {
    let r;
    if ((source === 'fdroid' || source === 'apkpure') && apkUrl) {
      // Detect XAPK/APKS from URL
      const urlLower = apkUrl.toLowerCase();
      const format = urlLower.includes('xapk') || urlLower.includes('torrent') ? 'xapk' : urlLower.includes('.apks') ? 'apks' : 'apk';
      r = await api('/api/android/install-apk-url', { method: 'POST', body: JSON.stringify({ url: apkUrl, name: label, format }) });
      if (r.needsUserTap) {
        toast('Open APK install on the phone screen and tap Approve', 'info');
      } else if (r.ok && r.format) {
        toast(label + ' installed (' + r.format + ', ' + (r.apkCount || 1) + ' APKs)', 'success');
      } else {
        toast(r.ok ? label + ' installed' : (r.error || 'failed'), r.ok ? 'success' : 'error');
      }
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
  el.innerHTML = `<div class="android-layout" id="android-layout">
    <div class="screen-container" id="screen-box">
      <div class="empty">Detecting connection...</div>
    </div>
    <div class="android-ctrl" id="android-ctrl"></div>
  </div>`;
  let st = { adb: false, method: 'none' };
  try { st = await api('/api/android/status'); } catch (_) {}
  let shizuku = { running: false, connected: false };
  try { shizuku = await api('/api/android/shizuku/status'); } catch (_) {}
  const ctrl = $('#android-ctrl');
  if (!st.adb) {
    const rishStatus = shizuku.running
      ? `<span style="color:var(--success)">&#9679; rish installed (Shizuku running)</span>`
      : `<span style="color:var(--warn)">&#9679; Shizuku not detected</span>`;
    ctrl.innerHTML = `
      <div class="ctrl-section" style="border-color:var(--warn)">
        <h3 style="color:var(--warn)">No Shell Access</h3>
        <p style="font-size:13px;color:var(--fg2);margin-bottom:12px">Live screen and remote input need Shizuku (rish) or ADB.</p>
        <div style="margin-bottom:12px;padding:10px;background:var(--bg2);border-radius:8px">
          <div style="font-size:12px;font-weight:600;margin-bottom:6px">Status: ${rishStatus}</div>
          <ol style="font-size:11px;color:var(--fg2);margin:0;padding-left:16px;line-height:1.8">
            <li>Install <a href="https://play.google.com/store/apps/details?id=moe.shizuku.privileged.api" target="_blank" style="color:var(--accent)">Shizuku</a> from Play Store</li>
            <li>Open Shizuku → tap <b>Start</b></li>
            <li>In Shizuku → Settings → <b>rish</b> → Write files to Termux</li>
            <li>Allow battery optimization: Settings → Apps → Termux → Battery → Unrestricted</li>
            <li>Allow battery optimization: Settings → Apps → Shizuku → Battery → Unrestricted</li>
            <li>Click <b>Connect</b> below</li>
          </ol>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <button class="btn primary sm" onclick="shizukuConnect()">Connect via Shizuku</button>
          <button class="btn ghost sm" onclick="renderAndroid($('#views'))">Refresh</button>
        </div>
      </div>
      <div class="ctrl-section"><h3>Installed Apps</h3><div class="app-list" id="android-apps"><div class="empty">Loading...</div></div></div>`;
    loadAndroidApps();
    return;
  }
  const methodLabel = st.method === 'rish' ? 'rish (Shizuku)' : 'ADB';
  ctrl.innerHTML = `
    <div class="ctrl-section"><h3>Controls <span style="color:var(--success);font-size:11px">&#9679; ${methodLabel}</span></h3>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn sm ghost" onclick="androidKey('home')" title="Home">&#127968;</button>
        <button class="btn sm ghost" onclick="androidKey('back')" title="Back">&larr;</button>
        <button class="btn sm ghost" onclick="androidKey('app_switch')" title="Recent">&#9776;</button>
        <button class="btn sm ghost" onclick="androidKey('volume_up')" title="Volume Up">Vol+</button>
        <button class="btn sm ghost" onclick="androidKey('volume_down')" title="Volume Down">Vol-</button>
        <button class="btn sm ghost" onclick="androidKey('power')" title="Power">&#9211;</button>
        <button class="btn sm ghost" onclick="androidToggleFullscreen()" id="btn-fullscreen" title="Fullscreen">&#x26F6;</button>
      </div>
      <div style="margin-top:10px;display:flex;align-items:center;gap:8px">
        <span style="font-size:12px;color:var(--fg2)">Brightness</span>
        <input type="range" min="1" max="255" value="${st.brightness || 70}" id="android-brightness" oninput="androidBrightness(this.value);$('#android-bri-val').textContent=this.value" style="flex:1">
        <span style="font-size:11px;color:var(--fg3);min-width:24px;text-align:right" id="android-bri-val">${st.brightness || 70}</span>
      </div>
    </div>
    <div class="ctrl-section"><h3>Type Text</h3>
      <div style="display:flex;gap:6px">
        <input class="inp" id="type-text" placeholder="Type here..." onkeydown="if(event.key==='Enter')androidType()" style="flex:1">
        <button class="btn primary sm" onclick="androidType()">Send</button>
      </div>
    </div>
    <div class="ctrl-section"><h3>Installed Apps</h3>
      <div class="app-list" id="android-apps" style="max-height:200px;overflow-y:auto"><div class="empty">Loading...</div></div>
    </div>`;
  loadAndroidApps();
  // Start MJPEG live stream
  const box = $('#screen-box');
  box.innerHTML = '';
  const img = document.createElement('img');
  img.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:12px;cursor:crosshair';
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
  const btn = $('#btn-fullscreen');
  if (btn) btn.innerHTML = androidFullscreen ? '&#9633;' : '&#x26F6;';
  if (androidFullscreen && layout.requestFullscreen) layout.requestFullscreen().catch(() => {});
  else if (!androidFullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

async function loadAndroidApps() {
  const list = $('#android-apps');
  if (!list) return;
  try {
    const r = await api('/api/android/apps');
    if (r.ok && r.apps) {
      list.innerHTML = '';
      list.appendChild(Object.assign(document.createElement('div'), { className: 'empty', textContent: r.total + ' installed' }));
      r.apps.slice(0, 100).forEach(p => {
        const d = document.createElement('div');
        d.className = 'app-list-item';
        d.textContent = p.package;
        d.title = p.package;
        d.onclick = () => androidLaunch(p.package);
        list.appendChild(d);
      });
    }
  } catch (_) { if (list) list.innerHTML = '<div class="empty">Failed</div>'; }
}

async function adbConnect() {
  const t = $('#adb-target')?.value?.trim();
  if (!t) return;
  toast('Connecting ADB to ' + t + '...', 'info');
  try {
    const r = await api('/api/android/adb-connect', { method: 'POST', body: JSON.stringify({ target: t }) });
    toast(r.ok ? 'ADB connected' : (r.error || 'Failed'), r.ok ? 'success' : 'error');
    if (r.ok && state.view === 'android') renderAndroid($('#views'));
  } catch (_) { toast('Failed', 'error'); }
}

async function shizukuConnect() {
  toast('Connecting via Shizuku...', 'info');
  try {
    const r = await api('/api/android/shizuku/connect', { method: 'POST', body: JSON.stringify({}) });
    toast(r.ok ? 'Connected via Shizuku' : (r.error || 'Shizuku not running - start it first'), r.ok ? 'success' : 'error');
    if (r.ok && state.view === 'android') renderAndroid($('#views'));
  } catch (_) { toast('Failed', 'error'); }
}

async function shizukuDisconnect() {
  toast('Disconnecting...', 'info');
  try {
    await api('/api/android/shizuku/disconnect', { method: 'POST', body: JSON.stringify({}) });
    toast('Disconnected', 'success');
    if (state.view === 'android') renderAndroid($('#views'));
  } catch (_) { toast('Failed', 'error'); }
}

// Stream uses 720x1280 resolution (set in screenrecord args)
const STREAM_W = 720, STREAM_H = 1280;

async function androidTapImg(e) {
  const img = e.target;
  const rect = img.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = Math.round((e.clientX - rect.left) / rect.width * STREAM_W);
  const y = Math.round((e.clientY - rect.top) / rect.height * STREAM_H);
  try { await api('/api/android/input', { method: 'POST', body: JSON.stringify({ type: 'tap', x, y }) }); } catch (_) {}
}

// Swipe support on the screen image
let swipeStart = null;
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#screen-box') || !androidStreamImg) return;
    swipeStart = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  document.addEventListener('mouseup', (e) => {
    if (!swipeStart || !e.target.closest('#screen-box')) { swipeStart = null; return; }
    const dx = e.clientX - swipeStart.x, dy = e.clientY - swipeStart.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dt = Date.now() - swipeStart.t;
    swipeStart = null;
    if (dist < 10 || dt > 500) return; // too short or too slow
    const img = androidStreamImg;
    const rect = img.getBoundingClientRect();
    const sx = Math.round((swipeStart?.x ?? e.clientX - dx - rect.left) / rect.width * STREAM_W);
    const sy = Math.round((swipeStart?.y ?? e.clientY - dy - rect.top) / rect.height * STREAM_H);
    const ex = Math.round((e.clientX - rect.left) / rect.width * STREAM_W);
    const ey = Math.round((e.clientY - rect.top) / rect.height * STREAM_H);
    api('/api/android/input', { method: 'POST', body: JSON.stringify({ type: 'swipe', x1: sx, y1: sy, x2: ex, y2: ey, duration: Math.min(dt, 300) }) }).catch(() => {});
  });
});

const ANDROID_KEYS = { home: 3, back: 4, menu: 82, app_switch: 187, power: 26, enter: 66, volume_up: 24, volume_down: 25, brightness_up: 220, brightness_down: 221 };
async function androidKey(key) { const kc = ANDROID_KEYS[key] || key; try { await api('/api/android/input', { method: 'POST', body: JSON.stringify({ type: 'key', keycode: kc }) }); } catch (_) {} }
async function androidType() { const t = $('#type-text')?.value; if (!t) return; try { await api('/api/android/input', { method: 'POST', body: JSON.stringify({ type: 'text', text: t }) }); toast('Typed', 'success'); } catch (_) {} }
async function androidBrightness(v) { try { await api('/api/android/display', { method: 'POST', body: JSON.stringify({ action: 'brightness', value: parseInt(v) }) }); } catch (_) {} }
async function androidLaunch(pkg) { try { await api('/api/android/apps/launch', { method: 'POST', body: JSON.stringify({ package: pkg }) }); } catch (_) {} }

// ── Docs ──
async function renderDocs(el) {
  el.innerHTML = `<div class="store-search" style="margin-bottom:16px"><input class="inp" id="docs-q" placeholder="Search CLI tools..."></div><div id="docs-list" style="display:flex;flex-direction:column;gap:8px"></div>`;
  const list = $('#docs-list');
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
    list.innerHTML = docs.map(d => `<div class="card" style="cursor:default" onclick="docDetail('${escA(d.name)}')">
      <h3>${escH(d.name)}</h3><p style="font-size:13px;color:var(--fg2)">${escH(d.about || '')}</p>
    </div>`).join('') || '<div class="empty">No docs found</div>';
  } catch (_) { list.innerHTML = '<div class="empty">Failed to load</div>'; }
}

async function docDetail(name) {
  try {
    const r = await api('/api/store/docs?id=' + encodeURIComponent(name));
    if (!r.ok) return;
    const d = r.doc;
    showModal(`<h3>${escH(d.name)}</h3>
      <p style="color:var(--fg2);margin-bottom:12px">${escH(d.about || '')}</p>
      <pre style="background:var(--bg);padding:12px;border-radius:8px;overflow-x:auto;font-size:13px">${escH(d.syntax || '')}</pre>
      ${d.options ? `<h4 style="margin-top:12px;margin-bottom:8px;font-size:13px;color:var(--fg2)">Options</h4><pre style="background:var(--bg);padding:12px;border-radius:8px;overflow-x:auto;font-size:12px">${escH(d.options)}</pre>` : ''}
      <div class="btn-row"><button class="btn ghost" onclick="closeModal()">Close</button></div>`);
  } catch (_) {}
}

// ── Logs ──
async function renderLogs(el) {
  el.innerHTML = `<div class="fm-toolbar" style="margin-bottom:12px">
    <button class="btn ghost sm active" onclick="loadLogs('access')" id="log-access">Access Log</button>
    <button class="btn ghost sm" onclick="loadLogs('package')" id="log-package">Package Log</button>
    <button class="btn ghost sm" onclick="loadLogs('run')" id="log-run">Run Log</button>
    <span style="flex:1"></span>
    <button class="btn ghost sm" onclick="renderLogs($('#views'))">&#8635; Refresh</button>
  </div>
  <div class="term"><div class="term-output" id="log-output" style="height:calc(100vh - 200px)">Loading...</div></div>`;
  await loadLogs('access');
}

async function loadLogs(type) {
  $$('.fm-toolbar .btn').forEach(b => b.classList.remove('active'));
  const btn = $('#log-' + type) || $('#log-' + (type === 'minecraft' ? 'access' : type));
  if (btn) btn.classList.add('active');
  const out = $('#log-output');
  if (!out) return;
  try {
    const r = await api('/api/logs?which=' + type + '&lines=200');
    const lines = r.lines || [];
    out.textContent = lines.join('\n') || r.error || 'No log data';
    out.scrollTop = out.scrollHeight;
  } catch (_) { out.textContent = 'Failed to load'; }
}

// ── Settings ──
async function renderSettings(el) {
  let cfg = {};
  try { const r = await api('/api/config'); cfg = r.config || {}; } catch (_) {}
  el.innerHTML = `<div style="max-width:520px">
    <h3 style="margin-bottom:16px">Settings</h3>
    <div class="ctrl-section" style="margin-bottom:16px">
      <h3>Server Info</h3>
      <div style="display:flex;flex-direction:column;gap:6px;font-size:13px">
        <div><span style="color:var(--fg2)">Host:</span> ${location.hostname}</div>
        <div><span style="color:var(--fg2)">Port:</span> ${location.port || '443'}</div>
        <div><span style="color:var(--fg2)">User:</span> ${escH(CURRENT_USER)}</div>
      </div>
    </div>
    <div class="ctrl-section" style="margin-bottom:16px">
      <h3>Shizuku / Shell Access</h3>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div>
          <label style="font-size:12px;color:var(--fg2)">SSH Password (for remote setup)</label>
          <input class="inp" id="cfg-ssh-pw" type="password" value="${escH(cfg.sshPassword || '')}" placeholder="Optional SSH password" style="width:100%;margin-top:4px">
        </div>
      </div>
    </div>
    <div class="ctrl-section" style="margin-bottom:16px">
      <h3>Screen Streaming</h3>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;gap:10px">
          <div style="flex:1">
            <label style="font-size:12px;color:var(--fg2)">Resolution</label>
            <select class="inp" id="cfg-resolution" style="width:100%;margin-top:4px">
              <option value="360x640" ${cfg.streamResolution==='360x640'?'selected':''}>360x640 (Low)</option>
              <option value="720x1280" ${(cfg.streamResolution||'720x1280')==='720x1280'?'selected':''}>720x1280 (HD)</option>
              <option value="1080x1920" ${cfg.streamResolution==='1080x1920'?'selected':''}>1080x1920 (FHD)</option>
            </select>
          </div>
          <div style="flex:1">
            <label style="font-size:12px;color:var(--fg2)">FPS</label>
            <select class="inp" id="cfg-fps" style="width:100%;margin-top:4px">
              <option value="10" ${(cfg.streamFps||20)==10?'selected':''}>10 fps (Low latency)</option>
              <option value="20" ${(cfg.streamFps||20)==20?'selected':''}>20 fps (Balanced)</option>
              <option value="30" ${cfg.streamFps==30?'selected':''}>30 fps (Smooth)</option>
            </select>
          </div>
        </div>
        <div style="display:flex;gap:10px">
          <div style="flex:1">
            <label style="font-size:12px;color:var(--fg2)">Bitrate</label>
            <select class="inp" id="cfg-bitrate" style="width:100%;margin-top:4px">
              <option value="500000" ${cfg.streamBitrate==500000?'selected':''}>500 Kbps</option>
              <option value="1000000" ${cfg.streamBitrate==1000000?'selected':''}>1 Mbps</option>
              <option value="2000000" ${(cfg.streamBitrate||2000000)==2000000?'selected':''}>2 Mbps</option>
              <option value="4000000" ${cfg.streamBitrate==4000000?'selected':''}>4 Mbps</option>
            </select>
          </div>
          <div style="flex:1">
            <label style="font-size:12px;color:var(--fg2)">Quality (lower=better)</label>
            <select class="inp" id="cfg-quality" style="width:100%;margin-top:4px">
              <option value="4" ${cfg.streamQuality==4?'selected':''}>4 (Best)</option>
              <option value="8" ${(cfg.streamQuality||8)==8?'selected':''}>8 (Good)</option>
              <option value="15" ${cfg.streamQuality==15?'selected':''}>15 (Fast)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
    <div class="ctrl-section" style="margin-bottom:16px">
      <h3>Device Options</h3>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <input type="checkbox" id="cfg-root-mode" ${cfg.rootMode?'checked':''} style="width:auto">
          <label for="cfg-root-mode" style="font-size:13px;cursor:pointer">Root mode (direct screenrecord, no ADB needed)</label>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <input type="checkbox" id="cfg-wake-screen" ${cfg.wakeScreenOnStream!==false?'checked':''} style="width:auto">
          <label for="cfg-wake-screen" style="font-size:13px;cursor:pointer">Wake screen before streaming</label>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <input type="checkbox" id="cfg-auto-reconnect" ${cfg.autoReconnectAdb!==false?'checked':''} style="width:auto">
          <label for="cfg-auto-reconnect" style="font-size:13px;cursor:pointer">Auto-reconnect ADB</label>
        </div>
        <div>
          <label style="font-size:12px;color:var(--fg2)">ADB Reconnect Interval (seconds)</label>
          <input class="inp" id="cfg-reconnect-interval" type="number" value="${cfg.adbReconnectInterval || 30}" min="5" max="300" style="width:100%;margin-top:4px">
        </div>
        <div>
          <label style="font-size:12px;color:var(--fg2)">Screen Record Timeout (seconds, 0=unlimited)</label>
          <input class="inp" id="cfg-record-timeout" type="number" value="${cfg.screenRecordTimeout || 180}" min="0" max="1800" style="width:100%;margin-top:4px">
        </div>
      </div>
    </div>
    <div style="display:flex;gap:10px">
      <button class="btn primary" onclick="saveConfig()">Save Settings</button>
      <button class="btn ghost" onclick="renderSettings($('#views'))">Reset</button>
      <span style="flex:1"></span>
      <button class="btn danger" onclick="doLogout()">Sign Out</button>
    </div>
  </div>`;
}

async function saveConfig() {
  const cfg = {
    sshPassword: $('#cfg-ssh-pw')?.value || '',
    streamResolution: $('#cfg-resolution')?.value || '720x1280',
    streamFps: parseInt($('#cfg-fps')?.value || '15'),
    streamBitrate: parseInt($('#cfg-bitrate')?.value || '2000000'),
    streamQuality: parseInt($('#cfg-quality')?.value || '8'),
    rootMode: $('#cfg-root-mode')?.checked || false,
    wakeScreenOnStream: $('#cfg-wake-screen')?.checked !== false,
    autoReconnectAdb: $('#cfg-auto-reconnect')?.checked !== false,
    adbReconnectInterval: parseInt($('#cfg-reconnect-interval')?.value || '30'),
    screenRecordTimeout: parseInt($('#cfg-record-timeout')?.value || '180'),
  };
  try {
    const r = await api('/api/config', { method: 'POST', body: JSON.stringify(cfg) });
    toast(r.ok ? 'Settings saved' : 'Failed', r.ok ? 'success' : 'error');
  } catch (_) { toast('Failed to save', 'error'); }
}

async function doLogout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch (_) {}
  TOKEN = '';
  CURRENT_USER = '';
  localStorage.removeItem('adm_token');
  location.reload();
}

// ── Helpers ──
function escH(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function escA(s) { return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'\\"'); }
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return h; }
function fileIcon(name) { const ext = name.split('.').pop().toLowerCase(); if (['js','ts'].includes(ext)) return '&#128187;'; if (['json'].includes(ext)) return '&#128196;'; if (['md','txt'].includes(ext)) return '&#128221;'; if (['sh'].includes(ext)) return '&#9881;'; if (['png','jpg','jpeg','gif','svg'].includes(ext)) return '&#128247;'; if (['mp3','wav','ogg'].includes(ext)) return '&#127925;'; if (['mp4','mkv'].includes(ext)) return '&#127916;'; if (['zip','tar','gz'].includes(ext)) return '&#128230;'; if (['java','kt'].includes(ext)) return '&#9749;'; return '&#128196;'; }
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
$('#hamburger')?.addEventListener('click', () => $('#sidebar')?.classList.toggle('open'));
document.addEventListener('click', e => { if (!e.target.closest('.sidebar') && !e.target.closest('.hamburger')) closeSidebar(); });
$('#refresh')?.addEventListener('click', () => renderView(state.view));
$('#logout')?.addEventListener('click', doLogout);

// Boot
(async function() {
  if (TOKEN) {
    try {
      const r = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + TOKEN } });
      if (r.ok) {
        const j = await r.json();
        if (j.ok) { CURRENT_USER = j.username; showDash(); return; }
      }
    } catch (_) {}
  }
  showGate();
})();
