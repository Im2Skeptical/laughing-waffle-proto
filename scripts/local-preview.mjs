import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import { createReadStream, openSync, closeSync, mkdirSync } from 'node:fs';
import { readFile, writeFile, stat, realpath } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { root, workspaceId, getBuildInfo, stampBuildInfo } from './build-info.mjs';
import { createArtworkSnapshot, stampArtworkManifest } from './artwork-manifest.mjs';
import { requestPreview } from './preview-http.mjs';

// Artwork cache delivery requires a fresh server after upgrading older tooling.
const protocol = 5;
const firstPort = 5184;
const ports = Array.from({ length: 12 }, (_, i) => firstPort + i);
const portRecord = path.join(root, 'artifacts/local-preview.json');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };

function urls(port) {
  const mobile = [...new Set(Object.values(networkInterfaces()).flat()
    .filter(item => item?.family === 'IPv4' && !item.internal && !item.address.startsWith('169.254.'))
    .map(item => `http://${item.address}:${port}/`))];
  return { desktop: `http://localhost:${port}/`, mobile };
}

async function serve(port) {
  const artworkRoot = path.join(root, 'artifacts/artwork-cache');
  let artPending, artCached, artExpires = 0;
  const artwork = () => {
    if (artCached && Date.now() < artExpires) return Promise.resolve(artCached);
    return artPending ??= createArtworkSnapshot(root, artworkRoot).then(value => {
      artCached = value; artExpires = Date.now() + 5_000; return value;
    }).finally(() => { artPending = null; });
  };
  let pending;
  let cached;
  let expiresAt = 0;
  const info = () => {
    if (cached && Date.now() < expiresAt) return Promise.resolve(cached);
    return pending ??= getBuildInfo('local', String(port)).then(value => {
      cached = value;
      expiresAt = Date.now() + 5_000;
      return value;
    }).finally(() => { pending = null; });
  };
  await info();
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (status, type, body) => {
      response.writeHead(status, { 'Content-Type': type });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    try {
      if (!['GET', 'HEAD'].includes(request.method)) return reply(405, 'text/plain', 'Read-only preview');
      const route = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/\\/g, '/');
      if (route === '/__preview__/status') return reply(200, 'application/json', JSON.stringify({
        protocol, workspaceId, pid: process.pid, ...urls(port),
      }));
      if (route === '/build-info.json') return reply(200, 'application/json', JSON.stringify(await info()));
      if (route === '/artwork-manifest.json') return reply(200, 'application/json', JSON.stringify(await artwork()));
      if (route === '/' || route === '/index.html') {
        const build = await info();
        return reply(200, 'text/html', stampArtworkManifest(stampBuildInfo(await readFile(path.join(root, 'index.html'), 'utf8'), build), await artwork()));
      }
      const relative = route.replace(/^\/+/, '');
      if (/^artwork\/[a-f0-9]{64}\/[\w.-]+$/.test(relative)) {
        const full = path.join(artworkRoot, relative);
        const details = await stat(full);
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        response.setHeader('ETag', `"${relative}"`);
        if (request.headers['if-none-match'] === `"${relative}"`) { response.writeHead(304); return response.end(); }
        response.writeHead(200, { 'Content-Type': mime[path.extname(full)] ?? 'application/octet-stream', 'Content-Length': details.size });
        if (request.method === 'HEAD') return response.end();
        const stream = createReadStream(full);
        stream.on('error', () => response.destroy()); stream.pipe(response); return;
      }
      if ((!/^(?:src|images)\//.test(relative) && relative !== 'styles.css')
          || relative.split('/').some(part => part.startsWith('.'))) return reply(404, 'text/plain', 'Not found');
      const full = await realpath(path.resolve(root, relative));
      if (!full.startsWith(`${root}${path.sep}`)) return reply(404, 'text/plain', 'Not found');
      const details = await stat(full);
      if (!details.isFile()) return reply(404, 'text/plain', 'Not found');
      response.writeHead(200, { 'Content-Type': mime[path.extname(full)] ?? 'application/octet-stream', 'Content-Length': details.size });
      if (request.method === 'HEAD') return response.end();
      const stream = createReadStream(full);
      stream.on('error', () => response.destroy());
      stream.pipe(response);
    } catch (error) {
      if (response.headersSent) return response.destroy();
      const missing = error.code === 'ENOENT' || error.code === 'ENOTDIR';
      if (!missing) console.error(error);
      reply(missing ? 404 : 500, 'text/plain', missing ? 'Not found' : 'Preview failed; see local preview log');
    }
  });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ workspaceId, ...urls(port) })));
}

async function status(port) {
  try {
    const response = await requestPreview(`http://127.0.0.1:${port}/__preview__/status`, { maxBytes: 65_536 });
    if (!response.ok) return { occupied: true };
    const value = await response.json();
    return value.protocol === protocol && value.workspaceId === workspaceId ? value : { occupied: true };
  } catch (error) {
    return error.code === 'ECONNREFUSED' ? null : { occupied: true };
  }
}

function report(value) {
  console.log(`Local preview: ${value.desktop}`);
  for (const url of value.mobile) console.log(`Mobile (same network): ${url}`);
}

async function ensure() {
  // The record is only a discovery hint. Revalidate checkout and protocol over
  // HTTP before reusing it; never trust a stale PID or stop its current owner.
  const candidates = [...ports];
  try {
    const saved = JSON.parse(await readFile(portRecord, 'utf8'));
    if (saved?.workspaceId === workspaceId && saved.protocol === protocol
        && Number.isInteger(saved.port) && saved.port > 0 && saved.port <= 65535
        && !candidates.includes(saved.port)) candidates.push(saved.port);
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }
  const existing = await Promise.all(candidates.map(status));
  const match = existing.find(value => value?.workspaceId === workspaceId);
  if (match) return report(match);
  let port = candidates.find((_, index) => !existing[index]);
  if (!port) {
    const probe = createServer();
    await new Promise((resolve, reject) => {
      probe.once('error', reject); probe.listen(0, '0.0.0.0', resolve);
    });
    port = probe.address().port;
    await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  }
  mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  const log = openSync(path.join(root, 'artifacts/local-preview.log'), 'a');
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--serve', String(port)], {
    cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log, log],
  });
  let failure;
  child.on('error', error => { failure = error; });
  child.on('exit', (code, signal) => { failure = new Error(`Local preview exited before readiness (${signal ?? code}); see artifacts/local-preview.log`); });
  child.unref();
  closeSync(log);
  try {
    for (let attempt = 0; attempt < 120; attempt++) {
      await delay(250);
      if (failure) throw failure;
      const value = await status(port);
      if (value?.workspaceId === workspaceId && value.pid === child.pid) {
        await writeFile(portRecord, JSON.stringify({ protocol, workspaceId, port }));
        return report(value);
      }
    }
    throw new Error('Local preview did not start; see artifacts/local-preview.log');
  } catch (error) {
    // Only a child launched by this invocation can be cleaned up on failure.
    if (child.pid && child.exitCode === null && !child.signalCode) child.kill();
    throw error;
  }
}

try {
  if (process.argv[2] === '--serve') {
    const port = Number(process.argv[3]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
    await serve(port);
  } else await ensure();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
