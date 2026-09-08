#!/usr/bin/env node
'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const zlib = require('zlib');
const { execFile, spawn } = require('child_process');

const CONFIG = {
  HOST: process.env.ADMIN_HOST || '0.0.0.0',
  PORT: parseInt(process.env.ADMIN_PORT || '8900', 10),
  CERT_DIR: process.env.ADMIN_CERT_DIR || path.join(os.homedir(), '.termux', 'adminapi'),
  PUBLIC_DIR: path.join(os.homedir(), '.termux', 'adminapi', 'public'),
  LOG_FILE: process.env.ADMIN_LOG || path.join(os.homedir(), '.termux', 'adminapi', 'access.log'),
  MAX_FAILURES_PER_IP: 10,
  LOCKOUT_MS: 10 * 60 * 1000,
  MAX_COMMAND_SECONDS: 180,
  MAX_READ_BYTES: 32 * 1024 * 1024,
  MAX_PKG_SECONDS: 1800,
  PKG_LOG: path.join(os.homedir(), '.termux', 'adminapi', 'pkg.log'),
  STORE_APPS: path.join(os.homedir(), '.termux', 'adminapi', 'apps.json'),
  STORE_DIR: path.join(os.homedir(), '.termux', 'store'),
  INSTALLED_FILE: path.join(os.homedir(), '.termux', 'adminapi', 'installed.json'),
  DOCS_FILE: path.join(os.homedir(), '.termux', 'adminapi', 'docs.json'),
  USERS_FILE: path.join(os.homedir(), '.termux', 'adminapi', 'users.json'),
  SESSIONS_FILE: path.join(os.homedir(), '.termux', 'adminapi', 'sessions.json'),
  CONFIG_FILE: path.join(os.homedir(), '.termux', 'adminapi', 'config.json'),
  MAX_BUILD_SECONDS: 1800,
};

// ---- Account-based auth ----
const _fileLocks = new Map();
function withFileLock(key, fn) {
  const prev = _fileLocks.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  _fileLocks.set(key, next.catch(() => {}));
  return next;
}
function loadUsers() { try { return JSON.parse(fs.readFileSync(CONFIG.USERS_FILE, 'utf8')); } catch (_) { return {}; } }
function saveUsers(d) { try { fs.writeFileSync(CONFIG.USERS_FILE, JSON.stringify(d, null, 2)); } catch (_) {} }
function loadSessions() { try { return JSON.parse(fs.readFileSync(CONFIG.SESSIONS_FILE, 'utf8')); } catch (_) { return {}; } }
function saveSessions(d) { try { fs.writeFileSync(CONFIG.SESSIONS_FILE, JSON.stringify(d, null, 2)); } catch (_) {} }
function hashPassword(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(pw, stored) {
  try {
    const h = hashPassword(pw, stored.salt);
    return crypto.timingSafeEqual(Buffer.from(h.hash, 'hex'), Buffer.from(stored.hash, 'hex'));
  } catch (_) { return false; }
}
function sanitizeDesc(text) {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, '') // code blocks
    .replace(/`[^`]*`/g, '') // inline code
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links -> text
    .replace(/[#*_~>]/g, '') // markdown symbols
    .replace(/\\n/g, ' ') // literal \n
    .replace(/\n+/g, ' ') // newlines
    .replace(/<[^>]+>/g, '') // HTML tags
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 300);
}
function createSession(username) {
  const token = crypto.randomBytes(48).toString('hex');
  return withFileLock('sessions', () => {
    const sessions = loadSessions();
    sessions[token] = { username, created: Date.now(), expires: Date.now() + 30 * 24 * 60 * 60 * 1000 };
    saveSessions(sessions);
    return token;
  });
}
function validateSession(token) {
  if (!token) return null;
  const sessions = loadSessions();
  const s = sessions[token];
  if (!s) return null;
  if (s.expires < Date.now()) { delete sessions[token]; saveSessions(sessions); return null; }
  return s.username;
}
function cleanupSessions() {
  const sessions = loadSessions();
  const now = Date.now();
  let changed = false;
  for (const [k, v] of Object.entries(sessions)) {
    if (v.expires < now) { delete sessions[k]; changed = true; }
  }
  if (changed) saveSessions(sessions);
}
setInterval(cleanupSessions, 60 * 60 * 1000);

const authAttempts = new Map();
function checkRateLimit(ip, maxAttempts, windowMs) {
  const now = Date.now();
  const key = ip;
  const entry = authAttempts.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
  entry.count++;
  authAttempts.set(key, entry);
  return entry.count > maxAttempts ? false : true;
}

const certFile = path.join(CONFIG.CERT_DIR, 'cert.pem');
const keyFile = path.join(CONFIG.CERT_DIR, 'key.pem');
if (!fs.existsSync(certFile) || !fs.existsSync(keyFile)) {
  console.error('[adminapi] missing cert/key'); process.exit(1);
}

let storeRegistry = [];
try { storeRegistry = JSON.parse(fs.readFileSync(CONFIG.STORE_APPS, 'utf8')); } catch (_) {}
let storeDocs = {};
try { storeDocs = JSON.parse(fs.readFileSync(CONFIG.DOCS_FILE, 'utf8')); } catch (_) {}
const activeBuilds = new Map();
function loadInstalled() { try { return JSON.parse(fs.readFileSync(CONFIG.INSTALLED_FILE, 'utf8')); } catch (_) { return {}; } }
function saveInstalled(d) { try { fs.writeFileSync(CONFIG.INSTALLED_FILE, JSON.stringify(d, null, 2)); } catch (_) {} }
function getBuildLog(id) { const f = path.join(CONFIG.STORE_DIR, id, 'build.log'); try { return fs.readFileSync(f, 'utf8'); } catch (_) { return ''; } }

// ---- Device config (web-editable) ----
const DEFAULT_CONFIG = {
  sshPassword: '',
  streamBitrate: 4000000,
  streamResolution: '720x1280',
  streamFps: 20,
  streamQuality: 8,
  hostname: '0.0.0.0',
  port: 8900,
  adminNote: '',
  rootMode: false,
  wakeScreenOnStream: true,
  screenRecordTimeout: 180,
  autoReconnectAdb: true,
  adbReconnectInterval: 30,
};
function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG.CONFIG_FILE, 'utf8')) }; }
  catch (_) { return { ...DEFAULT_CONFIG }; }
}
function saveConfig(d) {
  try { fs.writeFileSync(CONFIG.CONFIG_FILE, JSON.stringify(d, null, 2)); } catch (_) {}
}
const ADB_TARGET_FILE = path.join(CONFIG.CERT_DIR, 'adb-target');
let adbTarget = '';
try { adbTarget = fs.readFileSync(ADB_TARGET_FILE, 'utf8').trim(); } catch (_) {}
function saveAdbTarget(t) { adbTarget = t; try { fs.writeFileSync(ADB_TARGET_FILE, t, 'utf8'); } catch (_) {} }
const startupConfig = loadConfig();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
};

const PKG_LOG = CONFIG.PKG_LOG;

let aptNameCache = null, aptNameCacheAt = 0;
async function cacheAptSearch() {
  if (aptNameCache && Date.now() - aptNameCacheAt < 5 * 60 * 1000) return aptNameCache;
  try {
    const r = await runCmd('apt-cache search . 2>/dev/null || dpkg --print-avail 2>/dev/null', 30);
    const map = {};
    r.stdout.split('\n').forEach((l) => {
      const i = l.indexOf(' - ');
      if (i > 0) map[l.slice(0, i).trim()] = l.slice(i + 3).trim();
    });
    if (Object.keys(map).length) { aptNameCache = map; aptNameCacheAt = Date.now(); return map; }
    return {};
  } catch (_) { return {}; }
}

function shellQuote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}
function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'app';
}
function copyRecursive(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const e of fs.readdirSync(src)) copyRecursive(path.join(src, e), path.join(dest, e));
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}
function walkSearch(dir, q, depth, results) {
  if (depth < 0) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.name.toLowerCase().includes(q)) results.push({ name: e.name, path: full, isDir: e.isDirectory() });
    if (e.isDirectory() && depth > 0) walkSearch(full, q, depth - 1, results);
  }
}
function makeZipSel(srcs) {
  return rebuildZip(srcs);
}

function rebuildZip(srcs) {
  const chunks = [], central = [];
  let count = 0, localOffset = 0;
  const mtime = new Date();
  const dosT = ((mtime.getHours() << 11) | (mtime.getMinutes() << 5) | (mtime.getSeconds() >> 1)) & 0xffff;
  const dosD = (((mtime.getFullYear() - 1980) << 9) | ((mtime.getMonth() + 1) << 5) | mtime.getDate()) & 0xffff;
  const walk = (abs, zname) => {
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      const base = zname ? zname + '/' : path.basename(abs) + '/';
      for (const e of fs.readdirSync(abs)) walk(path.join(abs, e), base + e);
    } else {
      let content;
      try { content = fs.readFileSync(abs); } catch (_) { return; }
      const name = zname || path.basename(abs);
      const nameBuf = Buffer.from(name, 'utf8');
      const size = content.length;
      const crc = zlib.crc32(content) >>> 0;
      const thisOffset = localOffset;
      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0);
      lh.writeUInt16LE(20, 4);
      lh.writeUInt16LE(0x0800, 6);
      lh.writeUInt16LE(0, 8);
      lh.writeUInt16LE(dosT, 10);
      lh.writeUInt16LE(dosD, 12);
      lh.writeUInt32LE(crc, 14);
      lh.writeUInt32LE(size, 18);
      lh.writeUInt32LE(size, 22);
      lh.writeUInt16LE(nameBuf.length, 26);
      lh.writeUInt16LE(0, 28);
      chunks.push(lh, nameBuf, content);
      localOffset += 30 + nameBuf.length + size;
      const ch = Buffer.alloc(46);
      ch.writeUInt32LE(0x02014b50, 0);
      ch.writeUInt16LE(20, 4);
      ch.writeUInt16LE(20, 6);
      ch.writeUInt16LE(0x0800, 8);
      ch.writeUInt16LE(0, 10);
      ch.writeUInt16LE(dosT, 12);
      ch.writeUInt16LE(dosD, 14);
      ch.writeUInt32LE(crc, 16);
      ch.writeUInt32LE(size, 20);
      ch.writeUInt32LE(size, 24);
      ch.writeUInt16LE(nameBuf.length, 28);
      ch.writeUInt16LE(0, 30);
      ch.writeUInt16LE(0, 32);
      ch.writeUInt16LE(0, 34);
      ch.writeUInt16LE(0, 36);
      ch.writeUInt32LE(0, 38);
      ch.writeUInt32LE(thisOffset, 42);
      central.push(ch, nameBuf);
      count++;
    }
  };
  for (const s of srcs) walk(s, '');
  const cat = Buffer.concat(chunks);
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(count & 0xffff, 8);
  eocd.writeUInt16LE(count & 0xffff, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(cat.length, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([cat, cd, eocd]);
}

// ---- Online App Store (F-Droid cached index + Termux packages) ----
const FDROID_INDEX_CACHE = path.join(os.homedir(), '.termux', 'adminapi', 'fdroid-index.json');
const FDROID_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

function httpGetSimple(urlStr, timeout = 15000) {
  return new Promise((resolve) => {
    const curlPath = '/data/data/com.termux/files/usr/bin/curl';
    const args = ['-skL', '--max-time', String(Math.floor(timeout / 1000)), urlStr];
    const p = spawn(curlPath, args, { timeout: timeout + 5000, cwd: os.homedir(), env: process.env });
    let data = '';
    p.stdout.on('data', (c) => { data += c; });
    p.on('close', (code) => { console.log('[httpGet] url:', urlStr.substring(0, 80), 'bytes:', data.length, 'exit:', code); resolve(data); });
    p.on('error', () => resolve(''));
  });
}

async function refreshFDroidIndex() {
  console.log('[FDroid] downloading index...');
  try {
    const tmpFile = path.join(os.homedir(), '.termux', 'adminapi', 'fdroid-index-tmp.json');
    const dl = await runCmd(`curl -skL --max-time 120 -o "${tmpFile}" https://f-droid.org/repo/index-v1.json`, 130);
    if (dl.exitCode !== 0) throw new Error('curl failed: ' + (dl.stderr || dl.stdout));
    const raw = fs.readFileSync(tmpFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.apps) {
      const pkgs = parsed.apps.map(app => {
        const loc = (app.localized && app.localized['en-US']) || {};
        return {
          packageName: app.packageName,
          name: app.name || loc.name || app.packageName,
          summary: loc.summary || '',
          description: (loc.description || '').substring(0, 500),
          icon: app.icon ? `https://f-droid.org/repo/icons/${app.icon}` : '',
          suggestedVersionName: app.suggestedVersionName || '',
          suggestedVersionCode: app.suggestedVersionCode || '',
          license: app.license || '',
          categories: app.categories || [],
          apkName: app.apkName || ''
        };
      });
      fs.writeFileSync(FDROID_INDEX_CACHE, JSON.stringify({ ts: Date.now(), count: pkgs.length, pkgs }));
      console.log('[FDroid] cached', pkgs.length, 'packages from apps[]');
    }
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  } catch (e) { console.error('[FDroid] refresh failed:', e.message); }
}

async function getFDroidIndex() {
  try {
    if (fs.existsSync(FDROID_INDEX_CACHE)) {
      const c = JSON.parse(fs.readFileSync(FDROID_INDEX_CACHE, 'utf8'));
      if (c.pkgs && c.pkgs.length && (Date.now() - c.ts) < FDROID_CACHE_MAX_AGE) return c.pkgs;
    }
  } catch (_) {}
  await refreshFDroidIndex();
  try { return JSON.parse(fs.readFileSync(FDROID_INDEX_CACHE, 'utf8')).pkgs || []; } catch (_) { return []; }
}

async function searchFDroid(q) {
  const pkgs = await getFDroidIndex();
  if (!pkgs.length) return [];
  const lq = q.toLowerCase();
  const nameMatches = [];
  const pkgMatches = [];
  const sumMatches = [];
  for (const p of pkgs) {
    const name = (p.name || '').toLowerCase();
    const pkg = (p.packageName || '').toLowerCase();
    const sum = (p.summary || '').toLowerCase();
    if (name.includes(lq)) nameMatches.push(p);
    else if (pkg.includes(lq)) pkgMatches.push(p);
    else if (sum.includes(lq)) sumMatches.push(p);
  }
  const all = [...nameMatches, ...pkgMatches, ...sumMatches];
  return all.slice(0, 60).map(p => ({
    id: p.packageName, name: p.name, summary: p.summary || '',
    icon: p.icon, version: p.suggestedVersionName || '',
    source: 'fdroid', size: 0,
    apkUrl: p.suggestedVersionCode ? `https://f-droid.org/repo/${p.packageName}_${p.suggestedVersionCode}.apk` : '',
    license: p.license || '', description: sanitizeDesc(p.description || p.summary || '')
  }));
}

async function searchTermuxPkgs(q) {
  const r = await runCmd(`apt search "${q.replace(/"/g, '\\"')}" 2>/dev/null`, 10);
  const lines = (r.stdout || '').split('\n').filter(l => l.includes('/'));
  return lines.slice(0, 40).map(line => {
    const m = line.match(/^([a-z0-9_.+-]+)\/[^\s]+\s+\S+\s+\S+\s*\[([^\]]*)\]?\s*$/);
    if (!m) {
      const parts = line.split('/');
      const name = (parts[0] || '').trim();
      const rest = line.substring(line.indexOf(' ')).trim();
      if (!name || !/^[a-z0-9]/.test(name)) return null;
      return { id: `pkg:${name}`, name, summary: rest.replace(/\s*\[[^\]]*\]\s*$/, '').trim(), icon: '', source: 'termux', version: '', size: '', apkUrl: '' };
    }
    return { id: `pkg:${m[1]}`, name: m[1], summary: (line.substring(line.indexOf(' ')).replace(/\s*\[[^\]]*\]\s*$/, '').trim()), icon: '', source: 'termux', version: '', size: '', apkUrl: '' };
  }).filter(Boolean);
}

async function gatherFDroidDetail(id) {
  const pkgs = await getFDroidIndex();
  const p = pkgs.find(x => x.packageName === id);
  if (!p) return { name: id, icon: '', screenshots: [], description: '', version: '', size: '', rating: '' };
  return {
    name: p.name || id, icon: p.icon || `https://f-droid.org/repo/icons/${id}.png`,
    screenshots: [], description: sanitizeDesc(p.description || p.summary || ''), version: p.suggestedVersionName || '', size: '',
    apkUrl: p.suggestedVersionCode ? `https://f-droid.org/repo/${id}_${p.suggestedVersionCode}.apk` : '',
    license: p.license || '', rating: '', categories: p.categories || []
  };
}

// ---- APKPure API (pureapk.com internal API) ----
const APKPURE_HEADERS = { 'x-sv': '33', 'x-abis': 'arm64-v8a,armeabi-v7a', 'x-gp': '1', 'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 13; SM-G998B Build/TP1A.220624.014)' };

function apkpureHttpGet(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.get(u, { headers: APKPURE_HEADERS, timeout: 15000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const loc = res.headers.location.startsWith('http') ? res.headers.location : `${u.protocol}//${u.host}${res.headers.location}`;
        res.resume();
        return apkpureHttpGet(loc).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function apkpureExtractStrings(buf) {
  const strings = [];
  let i = 0;
  while (i < buf.length - 2) {
    const byte = buf[i]; const wireType = byte & 0x07; i++;
    if (wireType === 2) {
      let len = 0, shift = 0;
      while (i < buf.length) { const b = buf[i]; i++; len |= (b & 0x7f) << shift; shift += 7; if (shift > 35) break; if (!(b & 0x80)) break; }
      if (len > 0 && len < 2000 && i + len <= buf.length) {
        const str = buf.slice(i, i + len).toString('utf8');
        const printable = str.replace(/[\x00-\x08\x0e-\x1f]/g, '');
        if (printable.length > 2 && printable.length >= len * 0.3) strings.push(printable);
        i += len;
      } else { i += len; }
    } else if (wireType === 0) { while (i < buf.length && (buf[i] & 0x80)) i++; i++; }
    else if (wireType === 5) { i += 4; } else if (wireType === 1) { i += 8; } else { i++; }
  }
  return strings;
}

async function apkpureGetAppVersion(pkg) {
  const url = `https://api.pureapk.com/m/v3/cms/app_version?hl=en-US&package_name=${encodeURIComponent(pkg)}`;
  const r = await apkpureHttpGet(url);
  const buf = r.body;
  const data = { name: '', package: pkg, version: '', size: 0, apkUrl: '', icon: '', description: '', category: '' };

  const rawLatin = buf.toString('latin1');
  const allUrls = [];
  const urlRe = /https?:\/\/[^\x00-\x1f"'\s<>]+/g;
  let m;
  while ((m = urlRe.exec(rawLatin)) !== null) allUrls.push(m[0]);

  const cdnUrls = allUrls.filter(u => u.includes('data.winudf.com'));
  const apkUrls = allUrls.filter(u => u.includes('download.pureapk.com') && /\/APK\//i.test(u));
  const torrentUrls = allUrls.filter(u => u.includes('download.pureapk.com') && /\/TORRENT\//i.test(u));
  if (cdnUrls.length > 0) data.apkUrl = cdnUrls[0];
  else if (apkUrls.length > 0) data.apkUrl = apkUrls[0];
  else if (torrentUrls.length > 0) data.apkUrl = torrentUrls[0];

  for (const u of allUrls) { if (u.includes('image.winudf.com') && u.includes('icon')) { data.icon = u; break; } }

  const strings = apkpureExtractStrings(buf);
  const junk = /^(INVALID_COMMAND|SUCCESS|FAILURE|OK|ERROR|CMS|TAG|detail|WebPage|eventPosition|tag_list|currentPage|eventId|app_tag_|tag_detail_|app_|detail_|$)/i;
  for (const s of strings) {
    if (junk.test(s) || /^https?:\/\//.test(s)) continue;
    const clean = s.replace(/["'\)]+$/, '').trim();
    if (clean.match(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/) && !data.package) data.package = clean;
    else if (clean.match(/^\d+\.\d+/) && clean.length < 20 && !data.version) data.version = clean;
    else if (clean.match(/^\d{4,}$/) && !data.size) data.size = parseInt(clean);
    else if (clean.length > 80 && clean.includes(' ')) data.description = clean.replace(/<[^>]+>/g, '').substring(0, 500);
    else if (clean.match(/^[A-Z][a-zA-Z0-9 &.-]+$/) && clean.length > 2 && clean.length < 50 && !data.name) data.name = clean;
    else if (clean.match(/^[A-Z]/) && clean.length > 3 && clean.length < 30 && !data.category) data.category = clean;
  }
  if (!data.name) {
    for (const u of cdnUrls) {
      const fn = u.match(/filename=([^&]+)/);
      if (fn && fn[1] && !fn[1].includes('com.')) { data.name = decodeURIComponent(fn[1]).replace(/[_+]/g, ' ').trim(); break; }
    }
  }
  return data;
}

async function searchAPKPure(q) {
  const safeQ = q.replace(/[^a-zA-Z0-9 ]/g, ' ').trim();
  const strategies = [
    async () => {
      const r = await runCmd(`curl -sL ${shellQuote('https://lite.duckduckgo.com/lite/?q=apkpure.com+' + safeQ)} -H "User-Agent: Mozilla/5.0" 2>&1`, 12);
      const pkgs = new Set();
      for (const m of (r.stdout || '').matchAll(/apkpure\.com\/[a-z0-9-]+\/([a-z][a-z0-9_.]+)/gi)) {
        if (m[1].includes('.') && /^[a-z]/.test(m[1]) && m[1].length < 80) pkgs.add(m[1]);
      }
      return [...pkgs];
    },
    async () => {
      const r = await runCmd(`curl -sL ${shellQuote('https://search.brave.com/search?q=apkpure.com+' + safeQ)} -H "User-Agent: Mozilla/5.0" 2>&1`, 12);
      const pkgs = new Set();
      for (const m of (r.stdout || '').matchAll(/apkpure\.com\/[a-z0-9-]+\/([a-z][a-z0-9_.]+)/gi)) {
        if (m[1].includes('.') && /^[a-z]/.test(m[1]) && m[1].length < 80) pkgs.add(m[1]);
      }
      return [...pkgs];
    },
  ];
  let pkgs = [];
  for (const s of strategies) { try { pkgs = await s(); if (pkgs.length > 0) break; } catch (_) {} }

  const results = [];
  for (const pkg of pkgs.slice(0, 15)) {
    try {
      const detail = await apkpureGetAppVersion(pkg);
      const slugName = (detail.name && detail.name !== pkg) ? detail.name : slugToName(pkg.split('.').pop());
      results.push({ id: pkg, name: slugName || pkg, summary: detail.description ? detail.description.substring(0, 120) : '', icon: detail.icon || '', source: 'apkpure', version: detail.version || '', size: detail.size ? String(detail.size) : '', apkUrl: detail.apkUrl || '' });
    } catch (_) {
      results.push({ id: pkg, name: slugToName(pkg.split('.').pop()), summary: '', icon: '', source: 'apkpure', version: '', size: '', apkUrl: '' });
    }
  }
  return results;
}

function slugToName(slug) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function gatherUpToDownDetail(urlStr) {
  try {
    const html = await httpGetSimple(urlStr, 12000);
    const name = (html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || [])[1] || '';
    const version = (html.match(/class="version">([^<]+)/i) || [])[1] || '';
    const size = (html.match(/class="size">([^<]+)/i) || [])[1] || '';
    const icon = (html.match(/class="package-image"[^>]*>[\s\S]*?src="([^"]+)"/i) || [])[1] || '';
    const dl = (html.match(/href="(https?:\/\/[^"]*\.apk)"/i) || [])[1] || '';
    return { name: name.trim(), version: version.trim(), size: size.trim(), icon, apkUrl: dl };
  } catch (_) {
    return { name: '', version: '', size: '', icon: '', apkUrl: '' };
  }
}

async function gatherAPKPureDetail(id) {
  try {
    const detail = await apkpureGetAppVersion(id);
    return { name: detail.name || id, icon: detail.icon || '', screenshots: [], description: detail.description || '', version: detail.version || '', size: detail.size ? String(detail.size) : '', apkUrl: detail.apkUrl || '', license: '', rating: '', categories: detail.category ? [detail.category] : [] };
  } catch (_) {
    return { name: id, icon: '', screenshots: [], description: '', version: '', size: '', apkUrl: '', license: '', rating: '', categories: [] };
  }
}

function log(line) {
  const entry = `[${new Date().toISOString()}] ${line}`;
  try { fs.appendFileSync(CONFIG.LOG_FILE, entry + '\n'); } catch (_) {}
}

const failures = new Map();
function checkAuth(req) {
  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const now = Date.now();
  const rec = failures.get(ip);
  if (rec && rec.lockedUntil > now) return { ok: false, ip, locked: true, remaining: Math.ceil((rec.lockedUntil - now) / 1000) };
  const h = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  if (m) {
    const username = validateSession(m[1]);
    if (username) { failures.delete(ip); return { ok: true, ip, username }; }
    // Invalid/expired token — don't count as brute force (user just has stale session)
    return { ok: false, ip };
  }
  // No token at all — count toward lockout (potential brute force)
  const count = (rec && !rec.lockedUntil && rec.count) || 0;
  if (count + 1 >= CONFIG.MAX_FAILURES_PER_IP) {
    failures.set(ip, { count: 0, lockedUntil: now + CONFIG.LOCKOUT_MS });
    return { ok: false, ip, locked: true, remaining: Math.ceil(CONFIG.LOCKOUT_MS / 1000) };
  }
  failures.set(ip, { count: count + 1, lockedUntil: 0 });
  return { ok: false, ip };
}
function timingSafeEqualStr(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req, limit) {
  return new Promise((res, rej) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { rej(new Error('too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => res(Buffer.concat(chunks).toString('utf8')));
    req.on('error', rej);
  });
}
const EXTRA_ALLOWED_ROOTS = ['/sdcard', '/storage/emulated/0', '/data/data/com.termux/files/usr'];
function isWithinRoot(p) {
  const root = os.homedir();
  let r;
  try { r = fs.realpathSync(path.resolve(p)); } catch (_) { return false; }
  for (const allowed of [root, ...EXTRA_ALLOWED_ROOTS]) {
    let allowedReal;
    try { allowedReal = fs.realpathSync(allowed); } catch (_) { allowedReal = allowed; }
    const rel = path.relative(allowedReal, r);
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return true;
  }
  return false;
}
function runCmd(cmd, timeoutSec, cwd) {
  return new Promise((res) => {
    const shell = process.env.SHELL || '/data/data/com.termux/files/usr/bin/bash';
    execFile(shell, ['-l', '-c', cmd], { timeout: (timeoutSec || 30) * 1000, maxBuffer: 64 * 1024 * 1024, cwd: cwd || os.homedir(), env: process.env },
      (err, stdout, stderr) => {
        if (err && err.killed) res({ ok: true, timedOut: true, stdout, stderr, exitCode: null });
        else res({ ok: true, stdout, stderr, exitCode: err ? (err.code === null ? -1 : err.code) : 0, timedOut: false });
      });
  });
}
function bytes(n) { if (n === null || n === undefined) return null; const u = ['B','KB','MB','GB','TB']; let i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return n.toFixed(i ? 1 : 0) + ' ' + u[i]; }

async function getSystem() {
  const home = os.homedir();
  const mem = os.totalmem(), freemem = os.freemem();
  let cpuLoad = null, uptimeSec = os.uptime();
  try {
    const s = await runCmd('cat /proc/loadavg', 5);
    const parts = s.stdout.trim().split(/\s+/);
    cpuLoad = parseFloat(parts[0]);
  } catch (_) {}
  let storage = null;
  try {
    const s = await runCmd('df -k "' + home + '"', 5);
    const lines = s.stdout.trim().split('\n');
    if (lines.length >= 2) {
      const f = lines[1].trim().split(/\s+/);
      storage = { total: +f[1] * 1024, used: +f[2] * 1024, available: +f[3] * 1024 };
    }
  } catch (_) {}
  return {
    hostname: os.hostname(), platform: process.platform, arch: process.arch,
    os_release: os.release(), uptime: uptimeSec, user: os.userInfo().username,
    cpu_cores: os.cpus().length, cpu_load: cpuLoad, cpu_model: (os.cpus()[0] || {}).model || '',
    mem_total: mem, mem_used: mem - freemem, mem_free: freemem,
    storage, home,
  };
}

async function getApps(serverRoot) {
  const out = { webrunner_projects: [], services: [] };
  try {
    const s = await runCmd('ps -eo pid,comm,args', 8);
    const lines = s.stdout.split('\n');
    out.services = lines
      .map((l) => l.trim().split(/\s+/))
      .filter((a) => a.length >= 2)
      .map((a) => ({ pid: a[0], name: a[1], args: a.slice(2).join(' ') }))
      .filter((p) => ['java','node','npm','cloudflared','sshd','crond','code-server'].includes(p.name))
      .map((p) => ({ pid: p.pid, name: p.name, args: p.args.slice(0, 160) }));
  } catch (_) {}
  // heuristic WebRunner project status via listening ports
  try {
    const s = await runCmd('ss -tln 2>/dev/null | grep -E ":3000|:8443|:8900" || true', 8);
    out.ports = s.stdout;
  } catch (_) {}
  return out;
}

async function tailFile(file, lines) {
  try {
    if (!fs.existsSync(file)) return { ok: true, file, lines: [], error: 'no file' };
    const data = fs.readFileSync(file, 'utf8');
    const arr = data.split('\n').filter((x) => x.length);
    return { ok: true, file, lines: arr.slice(-lines) };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function route(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const method = req.method, pathname = url.pathname;

  // static UI (no data, no auth) — served after /health
  if ((pathname === '/' || pathname === '/index.html' || pathname.startsWith('/assets/') || pathname.startsWith('/favicon')) && method === 'GET') {
    let rel = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.join(CONFIG.PUBLIC_DIR, rel);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile() && filePath.startsWith(path.resolve(CONFIG.PUBLIC_DIR))) {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      return res.end(fs.readFileSync(filePath));
    }
    return sendJson(res, 404, { ok: false, error: 'asset not found' });
  }

  if (pathname === '/health' && method === 'GET') return sendJson(res, 200, { status: 'ok', time: new Date().toISOString() });

  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');

  // ---- Account auth endpoints (no auth required) ----
  if (pathname === '/api/auth/create' && method === 'POST') {
    if (!checkRateLimit(ip, 5, 60000)) return sendJson(res, 429, { ok: false, error: 'too many attempts, try again in 1 minute' });
    let body; try { body = JSON.parse(await readBody(req, 4096)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const username = (body.username || '').trim().toLowerCase();
    const password = body.password || '';
    if (!username || username.length < 3) return sendJson(res, 400, { ok: false, error: 'username must be at least 3 characters' });
    if (!password || password.length < 4) return sendJson(res, 400, { ok: false, error: 'password must be at least 4 characters' });
    if (!/^[a-z0-9._-]+$/.test(username)) return sendJson(res, 400, { ok: false, error: 'username can only contain letters, numbers, dots, dashes' });
    let token;
    try {
      token = await withFileLock('users', () => {
        const users = loadUsers();
        if (users[username] && users[username].hash === 'placeholder') {
          users[username] = { ...hashPassword(password), created: Date.now() };
          saveUsers(users);
          return createSession(username);
        }
        if (users[username]) return null;
        users[username] = { ...hashPassword(password), created: Date.now() };
        saveUsers(users);
        return createSession(username);
      });
    } catch (_) { return sendJson(res, 500, { ok: false, error: 'internal' }); }
    if (token === null) return sendJson(res, 409, { ok: false, error: 'username already exists' });
    log(`account-create user=${username} ip=${ip}`);
    return sendJson(res, 200, { ok: true, token, username });
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    if (!checkRateLimit(ip, 10, 60000)) return sendJson(res, 429, { ok: false, error: 'too many attempts, try again in 1 minute' });
    let body; try { body = JSON.parse(await readBody(req, 4096)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const username = (body.username || '').trim().toLowerCase();
    const password = body.password || '';
    if (!username || !password) return sendJson(res, 400, { ok: false, error: 'username and password required' });
    const users = loadUsers();
    const user = users[username];
    if (!user || !verifyPassword(password, user)) {
      log(`login-fail user=${username} ip=${ip}`);
      return sendJson(res, 401, { ok: false, error: 'invalid username or password' });
    }
    const token = await createSession(username);
    log(`login user=${username} ip=${ip}`);
    return sendJson(res, 200, { ok: true, token, username });
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const auth = checkAuth(req);
    if (!auth.ok) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
    return sendJson(res, 200, { ok: true, username: auth.username });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const h = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
    if (h) {
      const sessions = loadSessions();
      delete sessions[h];
      saveSessions(sessions);
    }
    return sendJson(res, 200, { ok: true });
  }

  const auth = checkAuth(req);
  if (!auth.ok) return sendJson(res, auth.locked ? 429 : 401, { ok: false, error: auth.locked ? 'locked' : 'unauthorized', retryIn: auth.remaining || null });

  if (pathname === '/api/system' && method === 'GET') { try { return sendJson(res, 200, { ok: true, ...await getSystem() }); } catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); } }
  if (pathname === '/api/apps' && method === 'GET') { try { return sendJson(res, 200, { ok: true, ...await getApps() }); } catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); } }
  if (pathname === '/api/logs' && method === 'GET') {
    const which = url.searchParams.get('which') || 'access';
    const n = Math.min(Math.max(parseInt(url.searchParams.get('lines') || '200', 10) || 200, 10), 2000);
    let file;
    if (which === 'package' || which === 'pkg') file = CONFIG.PKG_LOG;
    else if (which === 'minecraft') file = path.join(os.homedir(), 'server', 'server.log');
    else if (which === 'run') file = path.join(CONFIG.CERT_DIR, 'server.log');
    else file = CONFIG.LOG_FILE;
    const r = await tailFile(file, n);
    r.which = which;
    return sendJson(res, 200, r);
  }

  if (pathname === '/exec' && method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req, 64 * 1024));
      const cmd = (body.cmd || '').trim();
      if (!cmd) return sendJson(res, 400, { ok: false, error: 'no command' });
      log(`exec ip=${ip}`);
      const timeout = Math.min(Math.max(parseInt(body.timeout || '30', 10) || 30, 1), CONFIG.MAX_COMMAND_SECONDS);
      const result = await runCmd(cmd, timeout, body.cwd);
      return sendJson(res, 200, result);
    } catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
  }

  if (pathname === '/fs/list' && method === 'GET') {
    const p = url.searchParams.get('path') || os.homedir();
    if (!isWithinRoot(p)) return sendJson(res, 403, { ok: false, error: 'outside home root' });
    try {
      const entries = fs.readdirSync(p, { withFileTypes: true }).map((d) => {
        let size = null; try { if (!d.isDirectory()) size = fs.statSync(path.join(p, d.name)).size; } catch (_) {}
        return { name: d.name, isDir: d.isDirectory(), size };
      }).sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
      return sendJson(res, 200, { ok: true, path: p, entries });
    } catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
  }

  if (pathname === '/fs/read' && method === 'GET') {
    const p = url.searchParams.get('path');
    if (!p) return sendJson(res, 400, { ok: false, error: 'path required' });
    if (!isWithinRoot(p)) return sendJson(res, 403, { ok: false, error: 'outside home root' });
    try {
      const st = fs.statSync(p);
      if (st.isDirectory()) return sendJson(res, 400, { ok: false, error: 'is a directory' });
      if (st.size > CONFIG.MAX_READ_BYTES) return sendJson(res, 400, { ok: false, error: 'file too large' });
      return sendJson(res, 200, { ok: true, path: p, size: st.size, base64: fs.readFileSync(p).toString('base64') });
    } catch (e) { return sendJson(res, 404, { ok: false, error: e.message }); }
  }

  if (pathname === '/fs/write' && method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req, 64 * 1024 * 1024)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const p = body.path;
    if (!p) return sendJson(res, 400, { ok: false, error: 'path required' });
    if (!isWithinRoot(p)) return sendJson(res, 403, { ok: false, error: 'outside home root' });
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      const content = body.base64 ? Buffer.from(body.base64, 'base64') : Buffer.from(String(body.content ?? ''));
      fs.writeFileSync(p, content);
      return sendJson(res, 200, { ok: true, path: p, written: content.length });
    } catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
  }

  if (pathname === '/fs/delete' && method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req, 512 * 1024)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const p = body.path;
    if (!p) return sendJson(res, 400, { ok: false, error: 'path required' });
    if (!isWithinRoot(p)) return sendJson(res, 403, { ok: false, error: 'outside home root' });
    try { fs.rmSync(p, { recursive: true, force: true }); return sendJson(res, 200, { ok: true, path: p }); }
    catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
  }

  if (pathname === '/fs/mkdir' && method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req, 512 * 1024)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const p = body.path;
    if (!p) return sendJson(res, 400, { ok: false, error: 'path required' });
    if (!isWithinRoot(p)) return sendJson(res, 403, { ok: false, error: 'outside home root' });
    try { fs.mkdirSync(p, { recursive: true }); return sendJson(res, 200, { ok: true, path: p }); }
    catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
  }

  if (pathname === '/fs/rename' && method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req, 512 * 1024)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const from = body.from, to = body.to;
    if (!from || !to) return sendJson(res, 400, { ok: false, error: 'from & to required' });
    if (!isWithinRoot(from) || !isWithinRoot(to)) return sendJson(res, 403, { ok: false, error: 'outside home root' });
    try { fs.renameSync(from, to); return sendJson(res, 200, { ok: true, from, to }); }
    catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
  }

  if (pathname === '/fs/move' && method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req, 4 * 1024 * 1024)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const srcs = Array.isArray(body.paths) ? body.paths : (body.path ? [body.path] : []);
    const dest = body.dest;
    if (!srcs.length || !dest) return sendJson(res, 400, { ok: false, error: 'paths[] and dest required' });
    if (!isWithinRoot(dest)) return sendJson(res, 403, { ok: false, error: 'dest outside home root' });
    try {
      fs.mkdirSync(dest, { recursive: true });
      const moved = [];
      for (const s of srcs) {
        if (!isWithinRoot(s)) continue;
        const base = path.basename(s);
        let target = path.join(dest, base);
        let i = 1;
        while (fs.existsSync(target)) target = path.join(dest, `${base}.${i++}`);
        fs.renameSync(s, target);
        moved.push({ from: s, to: target });
      }
      return sendJson(res, 200, { ok: true, moved });
    } catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
  }

  if (pathname === '/fs/copy' && method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req, 4 * 1024 * 1024)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const srcs = Array.isArray(body.paths) ? body.paths : (body.path ? [body.path] : []);
    const dest = body.dest;
    if (!srcs.length || !dest) return sendJson(res, 400, { ok: false, error: 'paths[] and dest required' });
    if (!isWithinRoot(dest)) return sendJson(res, 403, { ok: false, error: 'dest outside home root' });
    try {
      fs.mkdirSync(dest, { recursive: true });
      const copied = [];
      for (const s of srcs) {
        if (!isWithinRoot(s)) continue;
        const base = path.basename(s);
        let target = path.join(dest, base);
        let i = 1;
        while (fs.existsSync(target)) target = path.join(dest, `${base}.${i++}`);
        copyRecursive(s, target);
        copied.push({ from: s, to: target });
      }
      return sendJson(res, 200, { ok: true, copied });
    } catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
  }

  if (pathname === '/fs/search' && method === 'GET') {
    const p = url.searchParams.get('path') || os.homedir();
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const depth = Math.min(Math.max(parseInt(url.searchParams.get('depth') || '4', 10) || 4, 1), 8);
    if (!q) return sendJson(res, 400, { ok: false, error: 'q required' });
    if (!isWithinRoot(p)) return sendJson(res, 403, { ok: false, error: 'outside home root' });
    try {
      const results = [];
      walkSearch(p, q, depth, results);
      return sendJson(res, 200, { ok: true, query: q, results: results.slice(0, 500) });
    } catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
  }

  if (pathname === '/fs/zip' && method === 'GET') {
    const srcsParam = url.searchParams.get('paths');
    let srcs = [];
    try { srcs = srcsParam ? JSON.parse(srcsParam) : []; } catch (_) {}
    if (!srcs.length) return sendJson(res, 400, { ok: false, error: 'no paths' });
    for (const s of srcs) if (!isWithinRoot(s)) return sendJson(res, 403, { ok: false, error: 'outside home root' });
    const zip = makeZipSel(srcs);
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="download-${Date.now()}.zip"`, 'Cache-Control': 'no-store' });
    return res.end(zip);
  }

  // ---- Software / package management (Termux apt/pkg) ----
  if (pathname === '/api/packages/lists' && method === 'GET') {
    const type = url.searchParams.get('type') || 'available';
    const q = (url.searchParams.get('q') || '').toLowerCase();
    try {
      const r = await runCmd('dpkg --list 2>/dev/null', 15);
      const availMap = { available: await cacheAptSearch(), installed: {} };
      const installed = [];
      r.stdout.split('\n').forEach((l) => {
        const m = /^ii\s+(\S+)\s+(\S+)\s+/.exec(l);
        if (m) installed.push({ name: m[1], version: m[2] });
      });
      const installedMap = {};
      installed.forEach((p) => installedMap[p.name] = p);
      let out;
      if (type === 'installed') out = installed;
      else out = Object.keys(availMap.available).filter((n) => !q || n.toLowerCase().includes(q)).map((n) => ({ name: n, summary: availMap.available[n], version: installedMap[n] && installedMap[n].version || null, installed: !!installedMap[n] }));
      out.sort((a, b) => (a.installed === b.installed ? a.name.localeCompare(b.name) : a.installed ? -1 : 1));
      return sendJson(res, 200, { ok: true, type, total: out.length, backend: 'apt', packages: out });
    } catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); }
  }

  if (pathname === '/api/packages/info' && method === 'GET') {
    const name = url.searchParams.get('name');
    if (!name) return sendJson(res, 400, { ok: false, error: 'name required' });
    try {
      const r = await runCmd('apt-cache show ' + shellQuote(name) + ' 2>&1', 15);
      const s = await runCmd('apt-cache policy ' + shellQuote(name) + ' 2>/dev/null', 10);
      const inst = await runCmd('dpkg -s ' + shellQuote(name) + ' 2>/dev/null', 10);
      return sendJson(res, 200, { ok: true, name, show: r.stdout, policy: s.stdout, installed: inst.stdout });
    } catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); }
  }

  if (pathname === '/api/packages/install' && method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req, 512 * 1024)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const name = (body.name || '').trim();
    const action = body.action || 'install';
    if (!name) return sendJson(res, 400, { ok: false, error: 'name required' });
    if (!/^[A-Za-z0-9+.\-_]+$/.test(name)) return sendJson(res, 400, { ok: false, error: 'invalid package name' });
    const op = action === 'remove' ? 'remove' : action === 'update' ? 'update' : 'install';
    let cmd;
    if (op === 'update') cmd = 'pkg update 2>&1';
    else if (op === 'remove') cmd = 'pkg remove -y ' + shellQuote(name) + ' 2>&1';
    else cmd = 'pkg install -y ' + shellQuote(name) + ' 2>&1';
    const logLine = `[${new Date().toISOString()}] ${cmd}\n`;
    fs.appendFileSync(PKG_LOG, logLine);
    const r = await runCmd(cmd, CONFIG.MAX_PKG_SECONDS);
    fs.appendFileSync(PKG_LOG, r.stdout + '\n' + r.stderr + '\n[exit ' + (r.exitCode === null ? 'timed out' : r.exitCode) + ']\n\n');
    return sendJson(res, r.exitCode === 0 ? 200 : 400, { ok: r.exitCode === 0, name, action: op, exitCode: r.exitCode, output: r.stdout + r.stderr });
  }

  if (pathname === '/api/packages/log' && method === 'GET') {
    const n = Math.min(Math.max(parseInt(url.searchParams.get('lines') || '200', 10) || 200, 10), 2000);
    const r = await tailFile(PKG_LOG, n);
    return sendJson(res, 200, r);
  }

  // ---- Android Control (ADB-based) ----
  if (pathname === '/api/android/adb-connect' && method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req, 1024)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const target = String(body.target || body.host || '').trim();
    if (!target) return sendJson(res, 400, { ok: false, error: 'target (host:port) required' });
    adbCmd(['kill-server'], 8).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
    await adbCmd(['start-server'], 15);
    const r = await adbCmd(['connect', target], 20);
    await new Promise(r => setTimeout(r, 1000));
    const ok = adbConnected();
    if (ok) saveAdbTarget(target);
    log(`adb-connect target=${target} ok=${ok} ip=${ip}`);
    return sendJson(res, ok ? 200 : 500, { ok, adb: ok, target, error: ok ? null : (r.stderr || 'connect failed') });
  }

  // Shizuku status endpoint
  if (pathname === '/api/android/shizuku/status' && method === 'GET') {
    const running = rishAvailable();
    const connected = rishConnected();
    const adb = adbConnected();
    return sendJson(res, 200, { ok: true, running, connected, adb });
  }

  // Shizuku connect endpoint
  if (pathname === '/api/android/shizuku/connect' && method === 'POST') {
    log(`shizuku-connect ip=${ip}`);
    const ok = rishConnected();
    log(`shizuku-connect rish=${ok}`);
    return sendJson(res, ok ? 200 : 500, { ok, error: ok ? null : 'rish not available or Shizuku not running. Open Shizuku app and ensure it says "Shizuku is running".' });
  }

  // Shizuku disconnect endpoint
  if (pathname === '/api/android/shizuku/disconnect' && method === 'POST') {
    log(`shizuku-disconnect ip=${ip}`);
    adbCmd(['disconnect'], 8).catch(() => {});
    adbCmd(['kill-server'], 8).catch(() => {});
    saveAdbTarget('');
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/android/status' && method === 'GET') {
    const hasShell = rishConnected() || adbConnected();
    const methodUsed = rishConnected() ? 'rish' : adbConnected() ? 'adb' : 'none';
    if (!hasShell) {
      return sendJson(res, 200, { ok: true, method: 'none', adb: false, canScreencap: false, canInput: false, canDisplay: false, brightness: null, thirdPartyApps: 0 });
    }
    // Batch all checks into a single rish call to avoid Shizuku timeouts
    const batch = await shellCmd('echo "===SC===" && screencap -p | wc -c && echo "===IN===" && cmd statusbar expand-notifications 2>&1 || echo no-input && echo "===BR===" && settings get system screen_brightness 2>&1 && echo "===PK===" && pm list packages -3 2>/dev/null | wc -l', 15);
    const output = batch.stdout || '';
    const scMatch = output.match(/===SC===\n(\d+)/);
    const canScreencap = scMatch && parseInt(scMatch[1]) > 1000;
    const canInput = !output.includes('SecurityException') && !output.includes('no-input');
    const brMatch = output.match(/===BR===\n(\d+)/);
    const canDisplay = brMatch !== null;
    const brightness = brMatch ? brMatch[1] : null;
    const pkMatch = output.match(/===PK===\n(\d+)/);
    const thirdPartyApps = pkMatch ? parseInt(pkMatch[1]) : 0;
    return sendJson(res, 200, { ok: true, method: methodUsed, adb: hasShell, canScreencap, canInput, canDisplay, brightness, thirdPartyApps });
  }

  if (pathname === '/api/android/screenshot' && method === 'GET') {
    if (!rishConnected() && !adbConnected()) return sendJson(res, 503, { ok: false, error: 'No shell access (rish or ADB)' });
    let buf;
    try {
      if (rishConnected()) {
        buf = await new Promise((resolve, reject) => {
          const p = spawn('/data/data/com.termux/files/usr/bin/bash', ['-l', '-c', `echo 'screencap -p' | "${RISH_BIN}" 2>/dev/null`], { encoding: 'buffer', timeout: 20000, maxBuffer: 32 * 1024 * 1024, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
          const chunks = [];
          p.stdout.on('data', c => chunks.push(c));
          p.on('close', () => resolve(Buffer.concat(chunks)));
          p.on('error', reject);
        });
      } else {
        buf = await new Promise((resolve, reject) => {
          execFile(ADB_BIN, ['exec-out', 'screencap', '-p'], { encoding: 'buffer', timeout: 20000, maxBuffer: 32 * 1024 * 1024, env: process.env },
            (err, stdout) => err ? reject(err) : resolve(stdout));
        });
      }
    } catch (e) { return sendJson(res, 500, { ok: false, error: 'screencap failed: ' + e.message }); }
    if (!buf || buf.length < 100) return sendJson(res, 500, { ok: false, error: 'screencap empty' });
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'Content-Length': buf.length });
    return res.end(buf);
  }

  // MJPEG live stream: screenrecord H264 -> ffmpeg MJPEG pipeline
  if (pathname === '/api/android/stream' && method === 'GET') {
    const cfg = loadConfig();
    const boundary = 'frame';
    const fps = cfg.streamFps || 20;
    const bitrate = cfg.streamBitrate || 4000000;
    const resParts = (cfg.streamResolution || '720x1280').split('x');
    const sw = parseInt(resParts[0]) || 720;
    const sh = parseInt(resParts[1]) || 1280;

    // Wake screen
    if (cfg.wakeScreenOnStream !== false) {
      try { await shellCmd('input keyevent KEYCODE_WAKEUP', 3); } catch (_) {}
    }

    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=' + boundary,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let alive = true;
    let frameCount = 0;

    const FFMPEG = '/data/data/com.termux/files/usr/bin/ffmpeg';
    const STREAM_FILE = '/sdcard/.stream.h264';
    const recordTimeout = cfg.screenRecordTimeout || 180;

    const SOI = Buffer.from([0xFF, 0xD8]);
    const EOI = Buffer.from([0xFF, 0xD9]);

    let pipeline;
    let rishProc;

    const cleanupStream = () => {
      try { if (rishProc) rishProc.kill('SIGTERM'); } catch (_) {}
      try { execFileSync('/data/data/com.termux/files/usr/bin/bash', ['-l', '-c', `pkill -f "screenrecord.*${STREAM_FILE}" 2>/dev/null; rm -f "${STREAM_FILE}" "/sdcard/.stream_cmd.sh"`], { timeout: 3000, env: process.env }); } catch (_) {}
    };

    const startPipeline = () => {
      cleanupStream();
      if (rishConnected()) {
        // Spawn rish directly with persistent stdin, send screenrecord command
        const cmdFile = '/sdcard/.stream_cmd.sh';
        const rmLine = `rm -f "${STREAM_FILE}"`;
        const srLine = `screenrecord --output-format=h264 --bit-rate=${bitrate} --size=${sw}x${sh} --time-limit=${recordTimeout} "${STREAM_FILE}" &`;
        const tailLine = `tail -f /dev/null`;
        fs.writeFileSync(cmdFile, `#!/system/bin/sh\n${rmLine}\n${srLine}\n${tailLine}\n`, { mode: 0o755 });
        rishProc = spawn('/data/data/com.termux/files/usr/bin/bash', ['-l', '-c', `"${RISH_BIN}" < "${cmdFile}"`], { env: process.env, stdio: ['ignore', 'ignore', 'ignore'], detached: true });
        rishProc.unref();

        let waitCount = 0;
        const waitForFile = () => {
          if (!alive || !res.writable) { cleanupStream(); return; }
          if (fs.existsSync(STREAM_FILE) && fs.statSync(STREAM_FILE).size > 1000) {
            startFfmpeg();
          } else if (waitCount++ < 40) {
            setTimeout(waitForFile, 250);
          } else {
            log('android-stream timeout waiting for screenrecord');
            alive = false;
          }
        };
        waitForFile();
      } else {
        // ADB path (direct pipe)
        const cmd = `"${ADB_BIN}" exec-out screenrecord --output-format=h264 --bit-rate=${bitrate} --size=${sw}x${sh} --time-limit=${recordTimeout} - 2>/dev/null | "${FFMPEG}" -hide_banner -loglevel quiet -f h264 -i pipe:0 -f mjpeg -q:v ${cfg.streamQuality || 8} -r ${fps} -an pipe:1`;
        const p = spawn('/data/data/com.termux/files/usr/bin/bash', ['-l', '-c', cmd], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
        let localBuf = Buffer.alloc(0);
        p.stdout.on('data', (chunk) => {
          if (!alive || !res.writable) return;
          localBuf = Buffer.concat([localBuf, chunk]);
          while (localBuf.length > 2) {
            const soi = localBuf.indexOf(SOI);
            if (soi === -1) { localBuf = Buffer.alloc(0); break; }
            if (soi > 0) localBuf = localBuf.slice(soi);
            const eoi = localBuf.indexOf(EOI, 2);
            if (eoi === -1) break;
            const frameLen = eoi + 2;
            const frame = localBuf.slice(0, frameLen);
            localBuf = localBuf.slice(frameLen);
            if (frame.length > 100 && alive && res.writable) {
              frameCount++;
              try {
                res.write('--' + boundary + '\r\nContent-Type: image/jpeg\r\nContent-Length: ' + frame.length + '\r\n\r\n');
                res.write(frame);
                res.write('\r\n');
              } catch (_) { alive = false; }
            }
          }
        });
        p.on('close', () => { if (alive && res.writable) { log(`android-stream adb-restart frames=${frameCount} ip=${ip}`); startPipeline(); } });
        p.on('error', () => { alive = false; });
        pipeline = p;
      }
      return pipeline;
    };

    const startFfmpeg = () => {
      if (!alive || !res.writable) { cleanupStream(); return; }
      const ffmpegCmd = `"${FFMPEG}" -hide_banner -loglevel quiet -f h264 -re -i "${STREAM_FILE}" -f mjpeg -q:v ${cfg.streamQuality || 8} -r ${fps} -an pipe:1`;
      const p = spawn('/data/data/com.termux/files/usr/bin/bash', ['-l', '-c', ffmpegCmd], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
      let localBuf = Buffer.alloc(0);
      p.stdout.on('data', (chunk) => {
        if (!alive || !res.writable) return;
        localBuf = Buffer.concat([localBuf, chunk]);
        while (localBuf.length > 2) {
          const soi = localBuf.indexOf(SOI);
          if (soi === -1) { localBuf = Buffer.alloc(0); break; }
          if (soi > 0) localBuf = localBuf.slice(soi);
          const eoi = localBuf.indexOf(EOI, 2);
          if (eoi === -1) break;
          const frameLen = eoi + 2;
          const frame = localBuf.slice(0, frameLen);
          localBuf = localBuf.slice(frameLen);
          if (frame.length > 100 && alive && res.writable) {
            frameCount++;
            try {
              res.write('--' + boundary + '\r\nContent-Type: image/jpeg\r\nContent-Length: ' + frame.length + '\r\n\r\n');
              res.write(frame);
              res.write('\r\n');
            } catch (_) { alive = false; }
          }
        }
      });
      p.on('close', () => {
        cleanupStream();
        if (alive && res.writable) {
          log(`android-stream file-restart frames=${frameCount} ip=${ip}`);
          startPipeline();
        }
      });
      p.on('error', () => { cleanupStream(); alive = false; });
      pipeline = p;
    };

    pipeline = startPipeline();
    req.on('close', () => { alive = false; cleanupStream(); });

    log(`android-stream start method=screenrecord-ffmpeg fps=${fps} bitrate=${bitrate} resolution=${sw}x${sh} ip=${ip}`);
    return;
  }

  if (pathname === '/api/android/input' && method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req, 1024)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const type = body.type;
    if (!type) return sendJson(res, 400, { ok: false, error: 'type required' });
    let cmd;
    if (type === 'tap') cmd = `input tap ${Math.round(body.x)} ${Math.round(body.y)}`;
    else if (type === 'swipe') cmd = `input swipe ${Math.round(body.x1)} ${Math.round(body.y1)} ${Math.round(body.x2)} ${Math.round(body.y2)} ${body.duration || 300}`;
    else if (type === 'key') {
      const k = String(body.keycode || body.key || '');
      if (!/^[a-zA-Z0-9_]+$/.test(k)) return sendJson(res, 400, { ok: false, error: 'invalid keycode' });
      cmd = `input keyevent ${k}`;
    }
    else if (type === 'text') cmd = `input text ${shellQuote(String(body.text || ''))}`;
    else if (type === 'longpress') cmd = `input swipe ${Math.round(body.x)} ${Math.round(body.y)} ${Math.round(body.x)} ${Math.round(body.y)} 1000`;
    else return sendJson(res, 400, { ok: false, error: 'unknown type: ' + type });
    log(`android-input type=${type} ip=${ip}`);
    const r = await shellCmd(cmd, 10);
    return sendJson(res, r.exitCode === 0 ? 200 : 500, { ok: r.exitCode === 0, error: r.stderr || null });
  }

  if (pathname === '/api/android/display' && method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req, 1024)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const action = body.action;
    let cmd;
    if (action === 'brightness') cmd = `settings put system screen_brightness ${Math.min(255, Math.max(0, Math.round(body.value)))}`;
    else if (action === 'screen_off') cmd = 'input keyevent KEYCODE_SLEEP';
    else if (action === 'screen_on') cmd = 'input keyevent KEYCODE_WAKEUP';
    else if (action === 'power') cmd = 'input keyevent KEYCODE_POWER';
    else if (action === 'volume_up') cmd = 'input keyevent KEYCODE_VOLUME_UP';
    else if (action === 'volume_down') cmd = 'input keyevent KEYCODE_VOLUME_DOWN';
    else if (action === 'volume_mute') cmd = 'input keyevent KEYCODE_VOLUME_MUTE';
    else if (action === 'home') cmd = 'input keyevent KEYCODE_HOME';
    else if (action === 'back') cmd = 'input keyevent KEYCODE_BACK';
    else if (action === 'recent') cmd = 'input keyevent KEYCODE_APP_SWITCH';
    else if (action === 'notifications') cmd = 'cmd statusbar expand-notifications';
    else if (action === 'lock') cmd = 'input keyevent KEYCODE_POWER';
    else if (action === 'unlock') cmd = 'input keyevent KEYCODE_WAKEUP && sleep 0.5 && input swipe 540 2000 540 800 300';
    else return sendJson(res, 400, { ok: false, error: 'unknown action' });
    log(`android-display action=${action} ip=${ip}`);
    const r = await shellCmd(cmd, 10);
    return sendJson(res, r.exitCode === 0 ? 200 : 500, { ok: r.exitCode === 0, error: r.stderr || null });
  }

  if (pathname === '/api/android/apps' && method === 'GET') {
    const type = url.searchParams.get('type') || 'all';
    const max = Math.min(Math.max(parseInt(url.searchParams.get('max') || '250', 10) || 250, 10), 400);
    let cmd = 'pm list packages -f';
    if (type === 'thirdparty') cmd += ' -3';
    else if (type === 'system') cmd += ' -s';
    let r = await shellCmd(cmd + ' 2>/dev/null', 20);
    let lines = (r.stdout || '').split('\n').filter((l) => l.startsWith('package:'));
    let viaAdb = false;
    if (lines.length === 0 && !rishConnected()) {
      const r2 = await runCmd(`"${ADB_BIN}" shell pm list packages -f 2>/dev/null`, 20);
      lines = r2.stdout.split('\n').filter((l) => l.startsWith('package:'));
      viaAdb = lines.length > 0;
    }
    const apps = lines.slice(0, max).map(line => {
      const parts = line.replace('package:', '').trim();
      const eqIdx = parts.lastIndexOf('=');
      const apkPath = eqIdx > 0 ? parts.substring(0, eqIdx) : '';
      const pkg = eqIdx > 0 ? parts.substring(eqIdx + 1) : parts;
      const name = pkg.split('.').pop().replace(/[^a-zA-Z0-9]/g, ' ').trim();
      return { package: pkg, name: name || pkg, apkPath, version: '' };
    }).sort((a, b) => a.package.localeCompare(b.package));
    return sendJson(res, 200, { ok: true, type, count: apps.length, total: apps.length, apps, viaAdb });
  }

  if (pathname === '/api/android/apps/launch' && method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req, 1024)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const pkg = body.package;
    if (!pkg) return sendJson(res, 400, { ok: false, error: 'package required' });
    if (!/^[a-zA-Z0-9._]+$/.test(pkg)) return sendJson(res, 400, { ok: false, error: 'invalid package name' });
    log(`android-launch pkg=${pkg} ip=${ip}`);
    const r = await shellCmd(`monkey -p ${shellQuote(pkg)} -c android.intent.category.LAUNCHER 1 2>&1`, 10);
    return sendJson(res, r.exitCode === 0 ? 200 : 500, { ok: r.exitCode === 0, output: r.stdout });
  }

  if (pathname === '/api/android/apps/uninstall' && method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req, 1024)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const pkg = body.package;
    if (!pkg) return sendJson(res, 400, { ok: false, error: 'package required' });
    if (!/^[a-zA-Z0-9._]+$/.test(pkg)) return sendJson(res, 400, { ok: false, error: 'invalid package name' });
    log(`android-uninstall pkg=${pkg} ip=${ip}`);
    const r = await shellCmd(`pm uninstall ${shellQuote(pkg)} 2>&1`, 30);
    return sendJson(res, r.exitCode === 0 ? 200 : 500, { ok: r.exitCode === 0, package: pkg, output: r.stdout + r.stderr });
  }

  if (pathname === '/api/android/clipboard' && method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req, 8 * 1024)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const text = body.text || '';
    const safe = shellQuote(text.slice(0, 4000));
    const r = await runCmd('termux-clipboard-set ' + safe + ' 2>/dev/null || printf %s ' + safe + ' | ' + (rishConnected() ? `"${RISH_BIN}"` : `"${ADB_BIN}" shell`) + ' "cmd clipboard set primary 2>/dev/null"', 8);
    return sendJson(res, 200, { ok: true, set: text.length > 0, note: r.stderr || null });
  }

  if (pathname === '/api/android/shell' && method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req, 64 * 1024)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const cmd = (body.cmd || '').trim();
    if (!cmd) return sendJson(res, 400, { ok: false, error: 'cmd required' });
    log(`android-shell cmd=${cmd.slice(0, 80)} ip=${ip}`);
    const r = await shellCmd(cmd, body.timeout || 30);
    return sendJson(res, 200, { ok: true, stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode });
  }

  if (pathname === '/api/android/online-search' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim();
    const source = url.searchParams.get('source') || 'all';
    if (!q) return sendJson(res, 400, { ok: false, error: 'q required' });
    log(`online-search q=${q} source=${source} ip=${ip}`);
    const results = [];
    const searched = [];
    const searchOne = async (name, fn) => { try { const r = await fn(q); results.push(...r); searched.push(name); } catch (_) { searched.push(name + ':error'); } };
    const promises = [];
    if (source === 'all' || source === 'fdroid') promises.push(searchOne('fdroid', searchFDroid));
    if (source === 'all' || source === 'termux') promises.push(searchOne('termux', searchTermuxPkgs));
    if (source === 'all' || source === 'apkpure') promises.push(searchOne('apkpure', searchAPKPure));
    await Promise.all(promises);
    return sendJson(res, 200, { ok: true, query: q, sources: searched, total: results.length, results: results.slice(0, 200) });
  }

  if (pathname === '/api/android/refresh-index' && method === 'POST') {
    log(`refresh-fdroid-index ip=${ip}`);
    refreshFDroidIndex().then(() => {}).catch(() => {});
    return sendJson(res, 200, { ok: true, message: 'refresh started in background' });
  }

  if (pathname === '/api/android/app-detail' && method === 'GET') {
    const source = url.searchParams.get('source') || 'apkpure';
    const id = url.searchParams.get('id') || '';
    const urlStr = url.searchParams.get('url') || '';
    if (!id && !urlStr) return sendJson(res, 400, { ok: false, error: 'id required' });
    log(`app-detail source=${source} id=${id} ip=${ip}`);
    let detail = { name: id, icon: '', screenshots: [], description: '', version: '', size: '' };
    try {
      if (source === 'fdroid') detail = await gatherFDroidDetail(id);
      else if (source === 'apkpure') detail = await gatherAPKPureDetail(id);
      else if (source === 'uptodown' && urlStr) detail = await gatherUpToDownDetail(urlStr);
    } catch (e) { return sendJson(res, 200, { ok: true, source, id, detail, error: e.message }); }
    return sendJson(res, 200, { ok: true, source, id, detail });
  }

  if (pathname === '/api/android/download-apk' && method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req, 1024)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const urlStr = body.url;
    if (!urlStr) return sendJson(res, 400, { ok: false, error: 'url required' });
    log(`download-apk url=${urlStr.slice(0, 80)} ip=${ip}`);
    const apkDir = path.join(os.homedir(), '.termux', 'adminapi', 'apks');
    fs.mkdirSync(apkDir, { recursive: true });
    const filename = path.basename(urlStr.split('?')[0]) || 'app.apk';
    const dest = path.join(apkDir, filename);
    const r = await runCmd(`curl -L -o ${shellQuote(dest)} ${shellQuote(urlStr)} 2>&1`, 120);
    const size = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
    if (size < 1000) return sendJson(res, 500, { ok: false, error: 'download failed or too small', output: r.stdout + r.stderr });
    return sendJson(res, 200, { ok: true, file: dest, size, filename });
  }

  if (pathname === '/api/android/install-apk' && method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req, 1024)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const apkPath = body.path;
    if (!apkPath) return sendJson(res, 400, { ok: false, error: 'path required' });
    log(`install-apk path=${apkPath} ip=${ip}`);
    let hasAdb = adbConnected();
    if (!hasAdb) {
      log('install-apk adb not connected, attempting reconnect...');
      await ensureAdb().catch(() => {});
      hasAdb = adbConnected();
    }
    if (hasAdb) {
      const r = await runCmd(`"${ADB_BIN}" install -r "${apkPath}" 2>&1`, 120);
      log(`install-apk adb result: exit=${r.exitCode} out=${(r.stdout+r.stderr).slice(0,200)}`);
      return sendJson(res, r.exitCode === 0 ? 200 : 500, { ok: r.exitCode === 0, method: 'adb', output: r.stdout + r.stderr });
    }
    log('install-apk falling back to termux-open (adb unavailable)');
    const r2 = await runCmd(`chmod 644 "${apkPath}" 2>/dev/null; termux-open "${apkPath}" 2>&1`, 15);
    const needsTap = r2.exitCode === 0;
    return sendJson(res, 200, { ok: true, method: 'termux-open', needsUserTap: needsTap, output: r2.stdout + r2.stderr, hint: 'APK opened with system installer - approve on the phone screen' });
  }

  if (pathname === '/api/android/install-apk-url' && method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req, 1024)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const urlStr = body.url;
    if (!urlStr) return sendJson(res, 400, { ok: false, error: 'url required' });
    log(`install-apk-url url=${urlStr.slice(0, 80)} ip=${ip}`);
    const apkDir = path.join(os.homedir(), '.termux', 'adminapi', 'apks');
    fs.mkdirSync(apkDir, { recursive: true });

    // Detect file type from URL
    const urlLower = urlStr.toLowerCase();
    const isXapk = urlLower.includes('xapk') || urlLower.includes('torrent') || body.format === 'xapk';
    const isApks = urlLower.includes('.apks') || body.format === 'apks';
    const ext = isXapk ? '.xapk' : isApks ? '.apks' : '.apk';
    const filename = (body.name ? slugify(body.name) : 'app') + '-' + Date.now() + ext;
    const dest = path.join(apkDir, filename);
    const dl = await runCmd(`curl -L -s -o ${shellQuote(dest)} ${shellQuote(urlStr)} 2>&1`, 180);
    const size = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
    if (size < 1000) return sendJson(res, 500, { ok: false, error: 'download failed or too small', output: dl.stdout + dl.stderr });

    // Ensure ADB connected
    let hasAdb = adbConnected();
    if (!hasAdb) {
      log('install-apk-url adb not connected, attempting reconnect...');
      await ensureAdb().catch(() => {});
      hasAdb = adbConnected();
    }

    if (hasAdb) {
      // XAPK/APKS: extract and use install-multiple
      if (isXapk || isApks) {
        log(`install-apk-url extracting ${ext} bundle`);
        const tmpDir = path.join(apkDir, '_extract_' + Date.now());
        await runCmd(`mkdir -p "${tmpDir}" && unzip -o "${dest}" -d "${tmpDir}" 2>&1`, 60);

        // Find all APK files recursively
        const findR = await runCmd(`find "${tmpDir}" -name "*.apk" -type f 2>/dev/null`, 10);
        const apkFiles = (findR.stdout || '').split('\n').filter(f => f.trim());

        if (apkFiles.length === 0) {
          await runCmd(`rm -rf "${tmpDir}"`, 5);
          return sendJson(res, 500, { ok: false, error: 'no APK files found in bundle' });
        }

        log(`install-apk-url found ${apkFiles.length} APK(s) in bundle`);
        let installOk = false;

        if (apkFiles.length === 1) {
          const r = await runCmd(`"${ADB_BIN}" install -r "${apkFiles[0]}" 2>&1`, 120);
          installOk = r.exitCode === 0;
          log(`install-apk-url single apk result: exit=${r.exitCode}`);
        }

        if (!installOk) {
          // Try install-multiple for split APKs
          const r = await runCmd(`"${ADB_BIN}" install-multiple -r ${apkFiles.map(f => `"${f}"`).join(' ')} 2>&1`, 180);
          installOk = r.exitCode === 0;
          log(`install-apk-url install-multiple result: exit=${r.exitCode}`);
          if (!installOk) {
            // Fall back to base APK only
            const baseApk = apkFiles.find(f => path.basename(f).startsWith('base')) || apkFiles[0];
            const r2 = await runCmd(`"${ADB_BIN}" install -r "${baseApk}" 2>&1`, 120);
            installOk = r2.exitCode === 0;
            log(`install-apk-url fallback base apk result: exit=${r2.exitCode}`);
          }
        }

        // Copy OBB data if present
        const obbR = await runCmd(`find "${tmpDir}" -path "*/obb/*" -type f 2>/dev/null | head -5`, 5);
        if (obbR.stdout.trim()) {
          log('install-apk-url copying OBB data');
          await runCmd(`cp -r "${tmpDir}"/obb/* /sdcard/Android/obb/ 2>/dev/null || true`, 30);
        }

        await runCmd(`rm -rf "${tmpDir}"`, 5);
        return sendJson(res, installOk ? 200 : 500, { ok: installOk, method: 'adb', format: ext, file: dest, size, apkCount: apkFiles.length });
      }

      // Standard APK
      const r = await runCmd(`"${ADB_BIN}" install -r "${dest}" 2>&1`, 120);
      log(`install-apk-url adb result: exit=${r.exitCode} out=${(r.stdout+r.stderr).slice(0,200)}`);
      return sendJson(res, r.exitCode === 0 ? 200 : 500, { ok: r.exitCode === 0, method: 'adb', file: dest, size, output: r.stdout + r.stderr });
    }
    log('install-apk-url falling back to termux-open (adb unavailable)');
    await runCmd(`chmod 644 "${dest}" 2>/dev/null; termux-open "${dest}" 2>&1`, 15);
    return sendJson(res, 200, { ok: true, method: 'termux-open', needsUserTap: true, file: dest, size, hint: 'APK opened with system installer - approve on the phone screen' });
  }

  if (pathname === '/api/store' && method === 'GET') {
    const installed = loadInstalled();
    const category = url.searchParams.get('category');
    const q = (url.searchParams.get('q') || '').toLowerCase();
    let apps = storeRegistry.map((a) => {
      const inst = installed[a.id] || {};
      const dir = path.join(CONFIG.STORE_DIR, a.id);
      let dirExists = false;
      try { dirExists = fs.existsSync(dir) && fs.statSync(dir).isDirectory(); } catch (_) {}
      return { ...a, installed: inst.installed || dirExists, building: activeBuilds.has(a.id), buildOk: inst.buildOk || false, dir, stars: a.stars || 0 };
    });
    if (category && category !== 'all') apps = apps.filter((a) => a.category === category);
    if (q) apps = apps.filter((a) => a.name.toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q));
    apps.sort((a, b) => a.name.localeCompare(b.name));
    return sendJson(res, 200, { ok: true, apps });
  }

  if (pathname === '/api/store/docs' && method === 'GET') {
    const id = url.searchParams.get('id');
    if (id) return sendJson(res, 200, { ok: true, doc: storeDocs[id] || null });
    return sendJson(res, 200, { ok: true, docs: storeDocs });
  }

  if (pathname === '/api/store/help' && method === 'GET') {
    const cmd = url.searchParams.get('cmd');
    if (!cmd || !/^[A-Za-z0-9._\-]+$/.test(cmd)) return sendJson(res, 400, { ok: false, error: 'invalid cmd' });
    const r = await runCmd(cmd + ' --help 2>&1 | head -120 || true', 8);
    return sendJson(res, 200, { ok: true, cmd, output: r.stdout + r.stderr });
  }

  if (pathname === '/api/store/status' && method === 'GET') {
    const id = url.searchParams.get('id');
    if (!id) return sendJson(res, 400, { ok: false, error: 'id required' });
    const app = storeRegistry.find((a) => a.id === id);
    if (!app) return sendJson(res, 404, { ok: false, error: 'app not found' });
    const installed = loadInstalled();
    const inst = installed[id] || {};
    const dir = path.join(CONFIG.STORE_DIR, id);
    let dirExists = false;
    try { dirExists = fs.existsSync(dir) && fs.statSync(dir).isDirectory(); } catch (_) {}
    return sendJson(res, 200, { ok: true, ...app, installed: inst.installed || dirExists, building: activeBuilds.has(id), buildOk: inst.buildOk || false });
  }

  if (pathname === '/api/store/install' && method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req, 1024)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const id = (body.id || '').trim();
    if (!id) return sendJson(res, 400, { ok: false, error: 'id required' });
    if (id.startsWith('pkg:')) {
      const pkgName = id.replace('pkg:', '').trim();
      if (!pkgName || !/^[a-z0-9][a-z0-9._+-]+$/.test(pkgName)) return sendJson(res, 400, { ok: false, error: 'invalid package name' });
      if (activeBuilds.has(id)) return sendJson(res, 409, { ok: false, error: 'already building' });
      log(`termux-pkg-install pkg=${pkgName} ip=${ip}`);
      const buildProc = { output: '', killed: false };
      activeBuilds.set(id, buildProc);
      const appDir = path.join(CONFIG.STORE_DIR, id);
      const logFile = path.join(appDir, 'build.log');
      fs.mkdirSync(appDir, { recursive: true });
      const ws = fs.createWriteStream(logFile);
      const doBuild = async () => {
        try {
          const r = await runCmd('pkg install -y ' + shellQuote(pkgName), CONFIG.MAX_BUILD_SECONDS);
          ws.write(r.stdout + '\n' + r.stderr + '\n');
          buildProc.output = r.stdout + r.stderr;
          buildProc.exitCode = r.exitCode;
          ws.write('\nexit ' + r.exitCode + '\n');
          const ok = buildProc.exitCode === 0;
          buildProc.buildOk = ok;
          const installed = loadInstalled();
          installed[id] = { installed: ok, timestamp: Date.now(), buildOk: ok };
          saveInstalled(installed);
          ws.end();
        } catch (e) {
          ws.write('ERROR: ' + e.message + '\n');
          buildProc.output += 'ERROR: ' + e.message;
          buildProc.exitCode = -1;
          ws.end();
        }
        activeBuilds.delete(id);
      };
      doBuild();
      return sendJson(res, 200, { ok: true, building: true, id });
    }
    const app = storeRegistry.find((a) => a.id === id);
    if (!app) return sendJson(res, 404, { ok: false, error: 'app not found' });
    if (activeBuilds.has(id)) return sendJson(res, 409, { ok: false, error: 'already building' });
    const installed = loadInstalled();
    if (installed[id] && installed[id].installed) return sendJson(res, 409, { ok: false, error: 'already installed' });
    log(`store-install id=${id} ip=${ip}`);
    const appDir = path.join(CONFIG.STORE_DIR, id);
    const logFile = path.join(appDir, 'build.log');
    fs.mkdirSync(appDir, { recursive: true });
    const buildProc = { output: '', killed: false };
    activeBuilds.set(id, buildProc);
    const ws = fs.createWriteStream(logFile);
    const doBuild = async () => {
      try {
        const isPkg = !!app.pkg;
        if (isPkg) {
          const r = await runCmd('pkg install -y ' + shellQuote(app.pkg), CONFIG.MAX_BUILD_SECONDS);
          ws.write(r.stdout + '\n' + r.stderr + '\n');
          buildProc.output = r.stdout + r.stderr;
          buildProc.exitCode = r.exitCode;
          ws.write('\nexit ' + r.exitCode + '\n');
        } else {
          ws.write('=== Cloning ' + app.repo + ' ===\n');
          await runCmd('git clone --depth 1 ' + shellQuote(app.repo) + ' ' + shellQuote(appDir + '/src'), CONFIG.MAX_BUILD_SECONDS);
          ws.write('=== Building ===\n');
          const buildEnv = `HOME="${os.homedir()}" PREFIX="${os.homedir()}/.termux/usr" PATH="${os.homedir()}/.termux/usr/bin:$PATH"`;
          const buildCmd = buildEnv + ' bash -c "cd ' + shellQuote(appDir + '/src') + ' && ' + (shellQuote(app.build || 'echo no-build-command')) + '"';
          const r = await runCmd(buildCmd, CONFIG.MAX_BUILD_SECONDS);
          ws.write(r.stdout + '\n' + r.stderr + '\n');
          buildProc.output = r.stdout + r.stderr;
          buildProc.exitCode = r.exitCode;
          ws.write('\nexit ' + r.exitCode + '\n');
        }
        const ok = buildProc.exitCode === 0;
        buildProc.buildOk = ok;
        installed[id] = { installed: ok, timestamp: Date.now(), buildOk: ok };
        saveInstalled(installed);
        ws.end();
      } catch (e) {
        ws.write('ERROR: ' + e.message + '\n');
        buildProc.output += 'ERROR: ' + e.message;
        buildProc.exitCode = -1;
        ws.end();
      } finally {
        activeBuilds.delete(id);
      }
    };
    doBuild();
    return sendJson(res, 202, { ok: true, id, status: 'building' });
  }

  if (pathname === '/api/store/remove' && method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req, 1024)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const id = (body.id || '').trim();
    if (!id) return sendJson(res, 400, { ok: false, error: 'id required' });
    const app = storeRegistry.find((a) => a.id === id);
    if (!app) return sendJson(res, 404, { ok: false, error: 'app not found' });
    if (activeBuilds.has(id)) return sendJson(res, 409, { ok: false, error: 'currently building' });
    log(`store-remove id=${id} ip=${ip}`);
    const appDir = path.join(CONFIG.STORE_DIR, id);
    try { fs.rmSync(appDir, { recursive: true, force: true }); } catch (_) {}
    const installed = loadInstalled();
    delete installed[id];
    saveInstalled(installed);
    if (app.pkg) await runCmd('pkg remove -y ' + shellQuote(app.pkg) + ' 2>/dev/null || true', 60);
    return sendJson(res, 200, { ok: true, id, removed: true });
  }

  if (pathname === '/api/store/log' && method === 'GET') {
    const id = url.searchParams.get('id');
    if (!id) return sendJson(res, 400, { ok: false, error: 'id required' });
    const n = Math.min(Math.max(parseInt(url.searchParams.get('lines') || '200', 10) || 200, 10), 2000);
    const logFile = path.join(CONFIG.STORE_DIR, id, 'build.log');
    const r = await tailFile(logFile, n);
    r.building = activeBuilds.has(id);
    if (activeBuilds.has(id)) r.output = (activeBuilds.get(id) || {}).output || '';
    return sendJson(res, 200, r);
  }

  if (pathname === '/api/store/stop' && method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req, 1024)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const id = (body.id || '').trim();
    if (!id || !activeBuilds.has(id)) return sendJson(res, 400, { ok: false, error: 'no active build' });
    const b = activeBuilds.get(id);
    b.killed = true;
    activeBuilds.delete(id);
    return sendJson(res, 200, { ok: true, id, stopped: true });
  }

  // ---- Device config (web-editable settings) ----
  if (pathname === '/api/config' && method === 'GET') {
    return sendJson(res, 200, { ok: true, config: loadConfig() });
  }
  if (pathname === '/api/config' && method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req, 4096)); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }
    const current = loadConfig();
    const updated = { ...current };
    // Only allow updating known fields
    const allowed = ['sshPassword', 'streamBitrate', 'streamResolution', 'streamFps', 'streamQuality', 'hostname', 'port', 'adminNote', 'rootMode', 'wakeScreenOnStream', 'screenRecordTimeout', 'autoReconnectAdb', 'adbReconnectInterval'];
    for (const k of allowed) { if (body[k] !== undefined) updated[k] = body[k]; }
    saveConfig(updated);
    log(`config-update ip=${ip} fields=${Object.keys(body).join(',')}`);
    return sendJson(res, 200, { ok: true, config: updated });
  }
  if (pathname === '/api/config/restart' && method === 'POST') {
    log(`server-restart ip=${ip}`);
    setTimeout(() => process.exit(0), 500);
    return sendJson(res, 200, { ok: true, message: 'restarting' });
  }

  if (pathname === '/auth' && method === 'GET') {
    log(`auth-ok ip=${ip}`);
    return sendJson(res, 200, { ok: true, user: process.env.USER || os.userInfo().username, ip, hostname: os.hostname() });
  }

  return sendJson(res, 404, { ok: false, error: 'not found' });
}

const server = https.createServer({ cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }, (req, res) => {
  route(req, res).catch((e) => { if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'internal' }); });
});

// ── WebSocket Terminal (raw implementation, no deps) ──
const activeTerminals = new Map();
function wsAccept(socket) {
  const key = socket.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-5AB9C4F2C1E1').digest('base64');
  socket.writeHead(101, { 'Upgrade': 'websocket', 'Connection': 'Upgrade', 'Sec-WebSocket-Accept': accept });
  socket.setNoDelay(true);
  socket.setKeepAlive(true, 30000);
  return socket;
}
function wsSend(socket, data) {
  if (socket.destroyed) return;
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  try { socket.write(Buffer.concat([header, payload])); } catch (_) {}
}
function wsSendBinary(socket, data) {
  if (socket.destroyed) return;
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x82;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x82;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x82;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  try { socket.write(Buffer.concat([header, payload])); } catch (_) {}
}
function wsClose(socket, code) {
  if (socket.destroyed) return;
  try {
    const buf = Buffer.alloc(4);
    buf[0] = 0x88;
    buf[1] = 2;
    buf.writeUInt16BE(code || 1000, 2);
    socket.write(buf);
  } catch (_) {}
  setTimeout(() => { try { socket.destroy(); } catch (_) {} }, 200);
}
function wsParseFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    if (buffer.length - offset < 2) break;
    const byte0 = buffer[offset];
    const byte1 = buffer[offset + 1];
    const opcode = byte0 & 0x0f;
    const masked = !!(byte1 & 0x80);
    let payloadLen = byte1 & 0x7f;
    let headerLen = 2;
    if (payloadLen === 126) {
      if (buffer.length - offset < 4) break;
      payloadLen = buffer.readUInt16BE(offset + 2);
      headerLen = 4;
    } else if (payloadLen === 127) {
      if (buffer.length - offset < 10) break;
      payloadLen = buffer.readUInt32BE(offset + 6);
      headerLen = 10;
    }
    const maskLen = masked ? 4 : 0;
    if (buffer.length - offset < headerLen + maskLen + payloadLen) break;
    let payload = buffer.slice(offset + headerLen + maskLen, offset + headerLen + maskLen + payloadLen);
    if (masked) {
      const mask = buffer.slice(offset + headerLen, offset + headerLen + 4);
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    }
    frames.push({ opcode, payload });
    offset += headerLen + maskLen + payloadLen;
  }
  return { frames, remaining: buffer.slice(offset) };
}

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'https://localhost');
  if (url.pathname !== '/ws/terminal') { socket.destroy(); return; }
  const token = url.searchParams.get('token');
  const username = validateSession(token);
  if (!username) { wsAccept(socket); wsClose(socket, 4001); return; }

  const ws = wsAccept(socket);
  let buf = head || Buffer.alloc(0);
  let shellProc = null;
  let termId = crypto.randomBytes(8).toString('hex');
  const termCols = parseInt(url.searchParams.get('cols') || '80', 10);
  const termRows = parseInt(url.searchParams.get('rows') || '24', 10);

  function spawnShell(cols, rows) {
    const shell = process.env.SHELL || '/data/data/com.termux/files/usr/bin/bash';
    const env = Object.assign({}, process.env, {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      COLUMNS: String(cols || 80),
      LINES: String(rows || 24),
    });
    shellProc = spawn(shell, ['--login'], {
      cwd: os.homedir(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    shellProc.stdout.on('data', d => wsSendBinary(ws, d));
    shellProc.stderr.on('data', d => wsSendBinary(ws, d));
    shellProc.on('close', (code) => {
      wsSend(ws, JSON.stringify({ type: 'exit', code }));
      wsClose(ws, 1000);
    });
    shellProc.on('error', () => { wsClose(ws, 1011); });
    activeTerminals.set(termId, shellProc);
    return shellProc;
  }

  spawnShell(termCols, termRows);
  wsSend(ws, JSON.stringify({ type: 'connected', termId }));

  ws.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    const parsed = wsParseFrames(buf);
    buf = parsed.remaining;
    for (const frame of parsed.frames) {
      if (frame.opcode === 0x08) { if (shellProc) shellProc.kill(); wsClose(ws, 1000); return; }
      if (frame.opcode === 0x09) {
        const pong = Buffer.alloc(2);
        pong[0] = 0x8a;
        pong[1] = 0;
        try { ws.write(pong); } catch (_) {}
        continue;
      }
      if (frame.opcode === 0x01) {
        try {
          const msg = JSON.parse(frame.payload.toString());
          if (msg.type === 'input' && shellProc && !shellProc.killed) {
            shellProc.stdin.write(msg.data);
          } else if (msg.type === 'resize' && shellProc && !shellProc.killed) {
            try {
              const winsize = Buffer.alloc(8);
              winsize.writeUInt16BE(msg.cols || 80, 0);
              winsize.writeUInt16BE(msg.rows || 24, 2);
              winsize.writeUInt16BE(0, 4);
              winsize.writeUInt16BE(0, 6);
              const { execSync } = require('child_process');
              execSync(`kill -s SIGWINCH ${shellProc.pid}`, { stdio: 'ignore' });
            } catch (_) {}
          }
        } catch (_) {}
      }
    }
  });
  ws.on('close', () => {
    if (shellProc && !shellProc.killed) shellProc.kill();
    activeTerminals.delete(termId);
  });
  ws.on('error', () => {
    if (shellProc && !shellProc.killed) shellProc.kill();
    activeTerminals.delete(termId);
  });
});

// ---- ADB auto-connect manager ----
const RISH_BIN = '/data/data/com.termux/files/usr/bin/rish';
const ADB_BIN = '/data/data/com.termux/files/usr/bin/adb';
function adbCmd(args, timeoutSec) {
  return new Promise((resolve) => {
    const child = execFile(ADB_BIN, args, { timeout: (timeoutSec || 20) * 1000, maxBuffer: 16 * 1024 * 1024, env: process.env }, (err, stdout, stderr) =>
      resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || ''), code: err ? (err.code === null ? -1 : err.code) : 0 }));
    child.on('error', () => resolve({ ok: false, stdout: '', stderr: 'adb not found', code: -1 }));
  });
}
function rishAvailable() {
  try { return fs.existsSync(RISH_BIN) && fs.statSync(RISH_BIN).size > 50; } catch (_) { return false; }
}
let _rishCache = { result: false, lastCheck: 0 };
function rishConnected() {
  if (!rishAvailable()) return false;
  const now = Date.now();
  if (now - _rishCache.lastCheck < 5000) return _rishCache.result;
  try {
    const s = require('child_process').execFileSync('/data/data/com.termux/files/usr/bin/bash', ['-l', '-c', `echo id | "${RISH_BIN}"`], { encoding: 'utf8', timeout: 10000, env: process.env });
    _rishCache = { result: s.includes('uid='), lastCheck: now };
    return _rishCache.result;
  } catch (_) { _rishCache = { result: false, lastCheck: now }; return false; }
}
function rishCmd(cmd, timeoutSec) {
  const safe = cmd.replace(/'/g, "'\\''");
  return runCmd(`echo '${safe}' | "${RISH_BIN}"`, timeoutSec || 30);
}
function adbConnected() {
  try {
    const s = require('child_process').execSync(`"${ADB_BIN}" get-state 2>/dev/null`, { encoding: 'utf8', timeout: 8000 });
    return s.trim() === 'device';
  } catch (_) { return false; }
}
function shellCmd(cmd, timeoutSec) {
  if (rishConnected()) return rishCmd(cmd, timeoutSec);
  if (adbConnected()) return runCmd(`"${ADB_BIN}" shell ${cmd}`, timeoutSec);
  return runCmd(cmd, timeoutSec);
}
async function ensureAdb() {
  if (rishConnected() || adbConnected()) return true;
  // Try saved adb target
  if (adbTarget) {
    adbCmd(['kill-server'], 8).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
    await adbCmd(['start-server'], 15);
    const r = await adbCmd(['connect', adbTarget], 20);
    await new Promise(r => setTimeout(r, 1000));
    if (adbConnected()) return true;
  }
  return rishConnected();
}
async function adbLoop() {
  try { await ensureAdb(); } catch (_) {}
  setTimeout(adbLoop, 30000);
}
setTimeout(adbLoop, 2000);

// Admin endpoint to (re)connect wireless adb given host:port
// (defined here but handled in route via /api/android/adb-connect)

server.on('error', (e) => { log('server-error ' + e.message); if (e.code === 'EADDRINUSE') process.exit(1); });
server.listen(CONFIG.PORT, CONFIG.HOST, () => {
  log(`adminapi ui on https://${CONFIG.HOST}:${CONFIG.PORT} (auth on)`);
  refreshFDroidIndex().catch(() => {});
});
