import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import { createReadStream, openSync, closeSync, mkdirSync } from 'node:fs';
import { readFile, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { root, workspaceId, getBuildInfo, stampBuildInfo } from './build-info.mjs';

const protocol = 1;
const firstPort = 5184;
const ports = Array.from({ length: 12 }, (_, i) => firstPort + i);
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
  let pending;
  let cached;
  let expiresAt = 0;
  const info = () => {
    if (cached && Date.now() < expiresAt) return Promise.resolve(cached);
    return pending ??= getBuildInfo('local').then(value => {
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
      if (route === '/' || route === '/index.html') {
        const build = await info();
        return reply(200, 'text/html', stampBuildInfo(await readFile(path.join(root, 'index.html'), 'utf8'), build));
      }
      const relative = route.replace(/^\/+/, '');
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
  server.on('error', error => { console.error(error.message); process.exit(1); });
  server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ workspaceId, ...urls(port) })));
}

async function status(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/__preview__/status`, { signal: AbortSignal.timeout(800) });
    if (!response.ok) return { occupied: true };
    const value = await response.json();
    return value.protocol === protocol && value.workspaceId === workspaceId ? value : { occupied: true };
  } catch (error) {
    return error.cause?.code === 'ECONNREFUSED' ? null : { occupied: true };
  }
}

function report(value) {
  console.log(`Local preview: ${value.desktop}`);
  for (const url of value.mobile) console.log(`Mobile (same network): ${url}`);
}

async function ensure() {
  const existing = await Promise.all(ports.map(status));
  const match = existing.find(value => value?.workspaceId === workspaceId);
  if (match) return report(match);
  const port = ports.find((_, index) => !existing[index]);
  if (!port) throw new Error(`Preview ports ${ports[0]}–${ports.at(-1)} are occupied; no existing preview serves this checkout`);
  mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  const log = openSync(path.join(root, 'artifacts/local-preview.log'), 'a');
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--serve', String(port)], {
    cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log, log],
  });
  child.on('error', error => { console.error(error); process.exitCode = 1; });
  child.unref();
  closeSync(log);
  for (let attempt = 0; attempt < 120; attempt++) {
    await delay(250);
    const value = await status(port);
    if (value?.workspaceId === workspaceId) return report(value);
  }
  throw new Error('Local preview did not start; see artifacts/local-preview.log');
}

if (process.argv[2] === '--serve') {
  const port = Number(process.argv[3]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  await serve(port);
} else await ensure();
