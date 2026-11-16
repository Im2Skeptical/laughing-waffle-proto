// PROTOTYPE: generate a self-contained opening-snapshot link for a local preview.
// Usage: npm run prototype:agent-test-links -- http://<preview-host>:<port>/
import {mkdir, writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {createNewGameState} from '../src/model/new-game.js';
import {serializeGameState} from '../src/model/state.js';
import {getBuildInfo, workspaceId} from './build-info.mjs';

const base = new URL(process.argv[2] ?? 'http://localhost:5197/');
if (!['http:', 'https:'].includes(base.protocol) || base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw Error('Supply only this checkout’s preview origin, such as http://192.168.1.103:5197/');
const response = await fetch(new URL('__preview__/status', base));
if (!response.ok || (await response.json()).workspaceId !== workspaceId) throw Error('That URL does not serve this checkout’s local preview.');
const source = await getBuildInfo('local', base.port);
const state = serializeGameState(createNewGameState(735));
const bytes = new TextEncoder().encode(JSON.stringify(state));
let hash = 0x811c9dc5;
for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193);
const checksum = (hash >>> 0).toString(16).padStart(8, '0');
const payload = {format:'agent-link-transport-v1', source:{version:source.version, build:source.build}, stateBytes:bytes.length, checksum, state};
const encoded = gzipSync(JSON.stringify(payload)).toString('base64url');
if (encoded.length > 512 * 1024) throw Error('Snapshot exceeds the prototype transport limit.');
const link = new URL('src/views/agent-test-link-prototype.html', base);
link.hash = `v1=${encoded}`;
const short = new URL('src/views/agent-test-link-prototype.html', base);
const out = 'artifacts/agent-test-links'; await mkdir(out, {recursive:true});
await writeFile(`${out}/phone-link.txt`, link.href);
await writeFile(`${out}/phone-link.json`, JSON.stringify({url:link.href, source, stateBytes:bytes.length, checksum}, null, 2));
await writeFile(`${out}/phone-link.html`, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>main{font:16px/1.5 var(--font-sans);color:var(--foreground)} a{display:inline-block;margin:6px 12px 6px 0;padding:12px 16px;border:1px solid var(--border);border-radius:var(--radius);color:var(--foreground);background:var(--secondary);text-decoration:none} small{display:block;color:var(--muted-foreground);margin:12px 0} a:focus-visible{outline:2px solid var(--ring)}</style>
<main><p>Use your phone on the same home Wi-Fi as the preview computer.</p>
<a id="long-link" href="${link.href}" target="_blank" rel="noopener">Open self-contained snapshot link</a>
<a id="control-link" href="${short.href}" target="_blank" rel="noopener">Check preview connection</a>
<small>Expected receipt: seed 735 · second 0 · 20 regions · checksum ${checksum}. The connection check intentionally has no snapshot.</small>
<small>Prototype 0.1.0 · v${source.version} · Preview ${source.previewLabel} · ${source.build} · ${link.href.length.toLocaleString()} link characters</small></main>`);
console.log(JSON.stringify({version:source.version, build:source.build, previewLabel:source.previewLabel, stateBytes:bytes.length, checksum, linkCharacters:link.href.length, launchCard:path.resolve(`${out}/phone-link.html`), rawLink:path.resolve(`${out}/phone-link.txt`)}));
