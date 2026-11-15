import { serializeGameState, deserializeGameState } from '../model/state.js';

// Separate from GameState and save schemas. Provisional transport limits.
export const TEST_LINK_FORMAT = 'agent-test-link-v1';
export const TEST_LINK_MAX_ENCODED = 512 * 1024;
export const TEST_LINK_MAX_DECODED = 8 * 1024 * 1024;
export const cloneCaptureData = value => JSON.parse(JSON.stringify(value));

export function validateTestCapture(raw, source) {
  if (raw?.format !== TEST_LINK_FORMAT) throw Error('Unsupported test capture format.');
  if (!source?.build || raw.source?.build !== source.build || raw.source?.version !== source.version) {
    throw Error('This test link belongs to a different build. Regenerate it from the current preview.');
  }
  if (!raw.view || raw.view.format !== 1) throw Error('Missing or unsupported panel state.');
  const state = deserializeGameState(raw.state);
  if (!Number.isInteger(state.tSec) || state.simStepIndex % 60 !== 0) throw Error('Test captures require an integer-second boundary.');
  return { ...raw, state: serializeGameState(state) };
}

export async function createTestCapture({state, view, source, baseUrl}) {
  const packet = validateTestCapture({format:TEST_LINK_FORMAT, source:{version:source.version,build:source.build},
    state:serializeGameState(state), view:cloneCaptureData(view)}, source);
  const text = JSON.stringify(packet);
  if (new TextEncoder().encode(text).length > TEST_LINK_MAX_DECODED) throw Error('This capture exceeds the prototype file limit.');
  if(typeof CompressionStream!=='function')return {packet,text,url:null,encodedCharacters:null,needsFile:true};
  const compressed = new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let binary = '';
  for (let i=0; i<compressed.length; i+=8192) binary += String.fromCharCode(...compressed.subarray(i,i+8192));
  const encoded = btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const url = new URL(baseUrl);
  for(const key of ['perf','launch','seed','prototype'])url.searchParams.delete(key);
  url.hash = `/dev/play?test=${encoded}`;
  return {packet, text, url:encoded.length <= TEST_LINK_MAX_ENCODED ? url.href : null,
    encodedCharacters:encoded.length, needsFile:encoded.length > TEST_LINK_MAX_ENCODED};
}

export async function readTestCapture(hash, source) {
  const params = new URLSearchParams(hash.split('?')[1] ?? '');
  if (params.has('testFile')) {
    const id=params.get('testFile');
    if (!/^[a-f0-9]{32}$/.test(id)) throw Error('Invalid test file token.');
    const text=await fileRecord(id);
    if (!text) throw Error('Test file unavailable. Import the capture file again.');
    return parseTestCaptureFile(text,source);
  }
  if (!params.has('test')) return null;
  const encoded=params.get('test');
  if (!encoded || encoded.length > TEST_LINK_MAX_ENCODED || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw Error('Invalid or oversized test link.');
  if(typeof DecompressionStream!=='function')throw Error('This browser cannot open compressed test links. Use the JSON capture file.');
  const binary=atob(encoded.replace(/-/g,'+').replace(/_/g,'/'));
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const decoder=new TextDecoder('utf-8',{fatal:true}); let size=0,text='';
  try {
    while (true) {
      const {value,done}=await reader.read(); if(done)break;
      size+=value.length;
      if(size>TEST_LINK_MAX_DECODED){await reader.cancel();throw Error('Decoded test capture exceeds the size limit.');}
      text+=decoder.decode(value,{stream:true});
    }
    text+=decoder.decode();
  } finally {reader.releaseLock();}
  return parseTestCaptureFile(text,source);
}

export function parseTestCaptureFile(text,source) {
  if(typeof text!=='string'||text.length>TEST_LINK_MAX_DECODED||new TextEncoder().encode(text).length>TEST_LINK_MAX_DECODED)throw Error('Test capture file exceeds the size limit.');
  return validateTestCapture(JSON.parse(text),source);
}

// IndexedDB handoffs avoid the much smaller localStorage quota for precisely
// the large captures that need a file. This database contains no player slots.
async function fileRecord(id,text) {
  const db=await new Promise((resolve,reject)=>{
    const request=indexedDB.open('full-map-agent-test-captures',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('files');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  try {
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction('files',text===undefined?'readonly':'readwrite');
      const request=text===undefined?tx.objectStore('files').get(id):tx.objectStore('files').put(text,id);
      let value;request.onsuccess=()=>{value=request.result;};
      tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error??Error('Test capture storage failed.'));
      tx.onerror=()=>reject(tx.error);
    });
  } finally {db.close();}
}

export async function openTestCaptureFile(text,source,baseUrl) {
  const packet=parseTestCaptureFile(text,source);
  const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
  const url=new URL(baseUrl);for(const key of ['perf','launch','seed','prototype'])url.searchParams.delete(key);url.hash=`/dev/play?testFile=${id}`;
  const opened=window.open('about:blank','_blank');
  if(!opened)throw Error('Allow a new tab to open the disposable test capture.');
  opened.opener=null;
  try {await fileRecord(id,JSON.stringify(packet));opened.location.href=url.href;}
  catch(error){opened.close();throw error;}
}
