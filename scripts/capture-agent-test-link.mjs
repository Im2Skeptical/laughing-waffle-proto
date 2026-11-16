// Convert a capture downloaded by __AGENT_TEST_LINKS__.download() into a
// compact launch card. Snapshot and panels stay inside the URL, not on disk at
// the receiving browser. Diagnostics are a separate optional download.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {deserializeGameState} from '../src/model/state.js';
import {createTestCapture,parseTestCaptureFile} from '../src/controllers/agent-test-links.js';

const [input,origin]=process.argv.slice(2);
if(!input||!origin)throw Error('Usage: npm run capture:test-link -- <test-capture.json> <game-preview-URL>');
const base=new URL(origin);
const response=await fetch(new URL('build-info.json',base));
if(!response.ok)throw Error('Could not read the target game build.');
const source=await response.json();
const packet=parseTestCaptureFile(await readFile(input,'utf8'),source);
const capture=await createTestCapture({state:deserializeGameState(packet.state),view:packet.view,source,baseUrl:base.href});
const out='artifacts/agent-test-links';await mkdir(out,{recursive:true});
await writeFile(`${out}/integrated-capture.json`,capture.text);
if(capture.url)await writeFile(`${out}/integrated-link.txt`,capture.url);
await writeFile(`${out}/integrated-link.html`,`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>main{font:16px/1.5 var(--font-sans);color:var(--foreground)}a{display:inline-block;padding:12px 16px;margin:8px 0;border:1px solid var(--border);border-radius:var(--radius);background:var(--secondary);color:var(--foreground);text-decoration:none}small{display:block;color:var(--muted-foreground);overflow-wrap:anywhere}</style>
<main><p>Use the same Wi-Fi as the preview computer. On your phone, choose Performance graphics or Full graphics. Both request fullscreen landscape. If it cannot rotate automatically, turn your phone sideways.</p>
${capture.url?`<a href="${capture.url.replace(/&/g,'&amp;')}" target="_blank" rel="noopener">Open captured game situation</a>`:'<p>This capture exceeds the URL limit. Import integrated-capture.json using the test-capture file command.</p>'}
<small>v${source.version} · Preview ${source.previewLabel??'—'} · ${source.build} · ${capture.packet.state.tSec}s · ${capture.encodedCharacters?.toLocaleString()??'file only'} encoded characters</small></main>`);
console.log(JSON.stringify({version:source.version,build:source.build,encodedCharacters:capture.encodedCharacters,needsFile:capture.needsFile,
  launchCard:path.resolve(`${out}/integrated-link.html`),captureFile:path.resolve(`${out}/integrated-capture.json`)}));
