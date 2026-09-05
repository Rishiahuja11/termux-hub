#!/usr/bin/env node
// APKPure CLI — search, download & install APKs/XAPKs/APKs via internal API
// Usage: node apkpure-cli.js <search query or package name>

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const HEADERS = {
  'x-sv': '33',
  'x-abis': 'arm64-v8a,armeabi-v7a',
  'x-gp': '1',
  'User-Agent': 'Dalvik/2.0 (Linux; U; Android 13; SM-G998B Build/TP1A.220624.014)',
};

const ADB_BIN = process.env.ADB_BIN || '/data/data/com.termux/files/usr/bin/adb';

// ── HTTP fetch with redirect support ──
function httpGet(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get(u, { headers: { ...HEADERS, 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0', 'Accept': 'text/html,application/xhtml+xml' }, timeout: 20000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const loc = res.headers.location.startsWith('http') ? res.headers.location : `${u.protocol}//${u.host}${res.headers.location}`;
        res.resume();
        return httpGet(loc, maxRedirects - 1).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ── Search with retry ──
async function searchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await httpGet(url);
      if (r.status === 200) return r;
      if (r.status === 429 && i < retries) {
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      return r;
    } catch (e) {
      if (i < retries) await new Promise(r => setTimeout(r, 1000));
      else throw e;
    }
  }
}

// ── DuckDuckGo HTML search ──
async function searchByName(query) {
  const strategies = [
    async () => {
      const r = await searchWithRetry(`https://lite.duckduckgo.com/lite/?q=apkpure.com+${encodeURIComponent(query)}`);
      const pkgs = new Set();
      for (const m of r.body.toString().matchAll(/apkpure\.com\/[a-z0-9-]+\/([a-z][a-z0-9_.]+)/gi)) {
        if (m[1].includes('.') && /^[a-z]/.test(m[1]) && m[1].length < 80) pkgs.add(m[1]);
      }
      return [...pkgs];
    },
    async () => {
      const r = await searchWithRetry(`https://search.brave.com/search?q=apkpure.com+${encodeURIComponent(query)}`);
      const pkgs = new Set();
      for (const m of r.body.toString().matchAll(/apkpure\.com\/[a-z0-9-]+\/([a-z][a-z0-9_.]+)/gi)) {
        if (m[1].includes('.') && /^[a-z]/.test(m[1]) && m[1].length < 80) pkgs.add(m[1]);
      }
      return [...pkgs];
    },
    async () => {
      const r = await searchWithRetry(`https://www.google.com/search?q=site:apkpure.com+${encodeURIComponent(query)}&num=10`);
      const pkgs = new Set();
      for (const m of r.body.toString().matchAll(/apkpure\.com\/[a-z0-9-]+\/([a-z][a-z0-9_.]+)/gi)) {
        if (m[1].includes('.') && /^[a-z]/.test(m[1]) && m[1].length < 80) pkgs.add(m[1]);
      }
      return [...pkgs];
    },
  ];
  for (const s of strategies) { try { const r = await s(); if (r.length > 0) return r; } catch (_) {} }
  return [];
}

// ── Get app version info from APKPure API ──
async function getAppVersion(pkg) {
  const url = `https://api.pureapk.com/m/v3/cms/app_version?hl=en-US&package_name=${encodeURIComponent(pkg)}`;
  const r = await httpGet(url);
  const buf = r.body;
  const data = { name: '', package: pkg, version: '', size: 0, apkUrl: '', icon: '', banner: '', description: '', category: '', isXapk: false };

  const rawLatin = buf.toString('latin1');
  const urlRe = /https?:\/\/[^\x00-\x1f"'\s<>]+/g;
  let m;
  const allUrls = [];
  while ((m = urlRe.exec(rawLatin)) !== null) allUrls.push(m[0]);

  for (const u of allUrls) { if (u.includes('image.winudf.com') && u.includes('icon')) { data.icon = u; break; } }
  for (const u of allUrls) { if (u.includes('image.winudf.com') && u.includes('banner')) { data.banner = u; break; } }

  const cdnUrls = allUrls.filter(u => u.includes('data.winudf.com'));
  const apkUrls = allUrls.filter(u => u.includes('download.pureapk.com') && /\/APK\//i.test(u));
  const torrentUrls = allUrls.filter(u => u.includes('download.pureapk.com') && /\/TORRENT\//i.test(u));

  if (cdnUrls.length > 0) { data.apkUrl = cdnUrls[0]; }
  else if (apkUrls.length > 0) { data.apkUrl = apkUrls[0]; }
  else if (torrentUrls.length > 0) { data.apkUrl = torrentUrls[0]; data.isXapk = true; }

  const strings = extractProtoStrings(buf);
  const junk = /^(INVALID_COMMAND|SUCCESS|FAILURE|OK|ERROR|NULL|undefined|true|false|CMS|TAG|detail|WebPage|eventPosition|tag_list|currentPage|eventId|app_tag_|tag_detail_|app_|detail_|$)/i;
  for (const s of strings) {
    if (junk.test(s) || /^https?:\/\//.test(s)) continue;
    if (s.match(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/) && !data.package) data.package = s;
    else if (s.match(/^\d+\.\d+/) && s.length < 20 && !data.version) data.version = s;
    else if (s.match(/^\d{4,}$/) && !data.size) data.size = parseInt(s);
    else if (s.length > 80 && s.includes(' ')) data.description = s.replace(/<[^>]+>/g, '').substring(0, 500);
    else if (s.match(/^[A-Z][a-z]/) && s.length > 2 && s.length < 40 && !data.name) data.name = s;
    else if (s.match(/^[A-Z]/) && s.length > 3 && s.length < 30 && !data.category) data.category = s;
  }
  return data;
}

// ── Minimal protobuf string extractor ──
function extractProtoStrings(buf) {
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

// ── Download with progress ──
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    mod.get(u, { headers: { 'User-Agent': HEADERS['User-Agent'] }, timeout: 600000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const loc = res.headers.location.startsWith('http') ? res.headers.location : `${u.protocol}//${u.host}${res.headers.location}`;
        res.resume();
        return downloadFile(loc, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      const ws = fs.createWriteStream(dest);
      let downloaded = 0;
      const t0 = Date.now();
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        ws.write(chunk);
        const pct = total > 0 ? ((downloaded / total) * 100).toFixed(1) + '%' : '?';
        const mb = (downloaded / 1048576).toFixed(1);
        const totalMB = total > 0 ? '/' + (total / 1048576).toFixed(1) : '';
        const speed = (downloaded / 1048576 / ((Date.now() - t0) / 1000)).toFixed(1);
        process.stdout.write(`\r  ⬇ ${pct}  ${mb}${totalMB} MB  ${speed} MB/s`);
      });
      res.on('end', () => { ws.end(); process.stdout.write('\n'); resolve(downloaded); });
      res.on('error', (e) => { ws.destroy(); reject(e); });
    }).on('error', reject);
  });
}

// ── Recursively find all .apk files ──
function findApks(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findApks(full));
    else if (entry.name.endsWith('.apk')) results.push(full);
  }
  return results;
}

// ── APK/XAPK/APKS installer ──
async function installFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  console.log(`\n📦 Installing ${path.basename(filePath)}...`);

  if (ext === '.apk') {
    try {
      await execFileAsync(ADB_BIN, ['install', '-r', filePath], { timeout: 120000, env: process.env });
      console.log('✅ Installed successfully via adb install');
      return true;
    } catch (e) {
      const stderr = e.stderr || '';
      if (stderr.includes('INSTALL_FAILED_ALREADY_EXISTS')) {
        console.log('  Already installed, retrying with -r -d...');
        try {
          await execFileAsync(ADB_BIN, ['install', '-r', '-d', filePath], { timeout: 120000, env: process.env });
          console.log('✅ Installed successfully');
          return true;
        } catch (e2) {
          console.log('❌ Install failed:', (e2.stderr || e2.message).substring(0, 200));
          return false;
        }
      }
      console.log('❌ Install failed:', stderr.substring(0, 300));
      return false;
    }
  }

  if (ext === '.xapk' || ext === '.apks') {
    console.log(`  Extracting ${ext.toUpperCase()} bundle...`);
    const tmpDir = path.join(path.dirname(filePath), '_extract_' + path.basename(filePath, ext));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      await execFileAsync('unzip', ['-o', filePath, '-d', tmpDir], { timeout: 60000, env: process.env });
    } catch (e) {
      console.log('❌ Failed to extract:', e.message.substring(0, 200));
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return false;
    }

    const apkFiles = findApks(tmpDir);
    console.log(`  Found ${apkFiles.length} APK file(s)`);

    if (apkFiles.length === 0) {
      console.log('❌ No APK files found in bundle');
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return false;
    }

    // Find OBB directories
    const obbDirs = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'obb') obbDirs.push(full);
          else walk(full);
        }
      }
    };
    walk(tmpDir);

    let success = false;

    if (apkFiles.length === 1) {
      try {
        await execFileAsync(ADB_BIN, ['install', '-r', apkFiles[0]], { timeout: 120000, env: process.env });
        success = true;
      } catch (e) {
        console.log('  Single install failed, trying install-multiple...');
      }
    }

    if (!success) {
      try {
        const args = ['install-multiple', '-r', ...apkFiles];
        await execFileAsync(ADB_BIN, args, { timeout: 180000, env: process.env });
        success = true;
      } catch (e) {
        console.log('  install-multiple failed:', (e.stderr || e.message).substring(0, 300));
        const baseApk = apkFiles.find(a => path.basename(a).startsWith('base')) || apkFiles[0];
        console.log(`  Retrying with base APK only: ${path.basename(baseApk)}`);
        try {
          await execFileAsync(ADB_BIN, ['install', '-r', baseApk], { timeout: 120000, env: process.env });
          success = true;
        } catch (e2) {
          console.log('❌ Install failed:', (e2.stderr || e2.message).substring(0, 300));
        }
      }
    }

    // Copy OBB data if present
    if (success && obbDirs.length > 0) {
      console.log('  Copying OBB data...');
      for (const obbDir of obbDirs) {
        try {
          await execFileAsync(ADB_BIN, ['push', obbDir + '/.', '/sdcard/Android/obb'], { timeout: 300000, env: process.env });
          console.log('  ✅ OBB data copied');
        } catch (e) {
          console.log('  ⚠  OBB copy failed:', e.message.substring(0, 100));
        }
      }
    }

    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (success) console.log('✅ Installed successfully');
    else console.log('❌ Installation failed');
    return success;
  }

  console.log('❌ Unknown file type:', ext);
  return false;
}

// ── Interactive prompt ──
function prompt(msg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(msg, a => { rl.close(); resolve(a.trim()); }));
}

// ── Main ──
async function main() {
  const autoDownload = process.argv.includes('--dl');
  const noInstall = process.argv.includes('--no-install');
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const query = args.join(' ');

  if (!query) {
    console.log(`
  APKPure CLI — search, download & install APKs/XAPKs/APKs

  Usage:
    node apkpure-cli.js <search query>          Interactive search by app name
    node apkpure-cli.js <package.name>          Lookup specific package
    node apkpure-cli.js --dl <package>          Auto-download + install
    node apkpure-cli.js --no-install <pkg>      Download only (skip install)

  Flags:
    --dl          Auto-download + install first result (no prompts)
    --no-install  Download only, don't run adb install

  Examples:
    node apkpure-cli.js notepad
    node apkpure-cli.js com.farmerbb.notepad
    node apkpure-cli.js --dl com.farmerbb.notepad
`);
    process.exit(1);
  }

  let packages = [];
  if (query.includes('.') && /^[a-z]/.test(query)) {
    console.log(`\n🔍 Looking up ${query}...`);
    try {
      const detail = await getAppVersion(query);
      if (detail.name || detail.version || detail.apkUrl) {
        packages = [{ id: query, name: detail.name || query, version: detail.version, size: detail.size, category: detail.category }];
      }
    } catch (_) {}
  }
  if (packages.length === 0) {
    console.log(`\n🔍 Searching for "${query}"...`);
    const pkgs = await searchByName(query);
    if (pkgs.length === 0) {
      // If query looks like a package, try it directly anyway
      if (query.includes('.') && /^[a-z]/.test(query)) {
        console.log('  DuckDuckGo returned no results, trying direct API lookup...');
        try {
          const d = await getAppVersion(query);
          if (d.apkUrl) packages = [{ id: query, name: d.name || query, version: d.version, size: d.size, category: d.category }];
        } catch (_) {}
      }
      if (packages.length === 0) { console.log('  No results found.'); process.exit(1); }
    } else {
      for (const pkg of pkgs.slice(0, 10)) {
        try { const d = await getAppVersion(pkg); packages.push({ id: pkg, name: d.name || pkg, version: d.version, size: d.size, category: d.category }); }
        catch (_) { packages.push({ id: pkg, name: pkg, version: '', size: 0, category: '' }); }
      }
    }
  }

  console.log(`\n📱 ${packages.length} result${packages.length > 1 ? 's' : ''}:\n`);
  packages.forEach((r, i) => {
    const parts = []; if (r.version) parts.push(`v${r.version}`); if (r.size > 0) parts.push(`${(r.size / 1048576).toFixed(1)} MB`); if (r.category) parts.push(r.category);
    console.log(`  ${i + 1}. ${r.name || r.id}${parts.length ? ' (' + parts.join(' · ') + ')' : ''}`);
    if (r.id !== r.name) console.log(`     ${r.id}`);
  });

  let pkg;
  if (packages.length === 1 || autoDownload) { pkg = packages[0].id; if (packages.length > 1 && autoDownload) console.log(`\n  (auto-selecting: ${pkg})`); }
  else {
    const choice = await prompt(`\n  Enter number (1-${packages.length}) or package name: `);
    const num = parseInt(choice, 10);
    if (num >= 1 && num <= packages.length) pkg = packages[num - 1].id;
    else if (choice.includes('.')) pkg = choice;
    else { console.log('Invalid selection.'); process.exit(1); }
  }

  console.log(`\n📦 Fetching ${pkg} details...`);
  const detail = await getAppVersion(pkg);
  if (!detail.apkUrl) { console.log('  Could not get download URL.'); process.exit(1); }

  const fmt = detail.apkUrl.toLowerCase().includes('torrent') || detail.apkUrl.includes('.xapk') ? 'XAPK bundle' : detail.apkUrl.includes('.apks') ? 'APKs bundle' : 'APK';
  console.log(`\n  📱 ${detail.name || pkg}`);
  console.log(`  📋 Package: ${detail.package || pkg}`);
  if (detail.version) console.log(`  🏷  Version: ${detail.version}`);
  if (detail.size > 0) console.log(`  💾 Size: ${(detail.size / 1048576).toFixed(1)} MB`);
  if (detail.category) console.log(`  📂 Category: ${detail.category}`);
  console.log(`  📦 Format: ${fmt}`);
  if (detail.description) console.log(`  📝 ${detail.description.substring(0, 200)}${detail.description.length > 200 ? '...' : ''}`);
  console.log(`  🔗 ${detail.apkUrl.substring(0, 90)}...`);

  let doDownload = 'y';
  if (!autoDownload) doDownload = await prompt('\n  Download? (y/n): ');
  if (doDownload.toLowerCase() !== 'y' && doDownload.toLowerCase() !== 'yes' && doDownload !== '') { console.log('Cancelled.'); process.exit(0); }

  let filename = detail.package || pkg;
  if (detail.version) filename += `_v${detail.version}`;
  if (detail.apkUrl.toLowerCase().includes('torrent') || detail.apkUrl.includes('.xapk')) filename += '.xapk';
  else if (detail.apkUrl.includes('.apks')) filename += '.apks';
  else filename += '.apk';

  console.log(`\n⬇  Downloading ${filename}...`);
  const t0 = Date.now();
  const bytes = await downloadFile(detail.apkUrl, path.join(process.cwd(), filename));
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`✅ ${filename} (${(bytes / 1048576).toFixed(1)} MB) saved in ${elapsed}s`);

  if (!noInstall) {
    const filePath = path.join(process.cwd(), filename);
    const doInstall = autoDownload ? 'y' : await prompt('\n  Install to device? (y/n): ');
    if (doInstall.toLowerCase() === 'y' || doInstall.toLowerCase() === 'yes') {
      await installFile(filePath);
    }
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
