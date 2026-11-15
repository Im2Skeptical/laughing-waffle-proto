// Separate implementation: decode original bytes and reconstruct policy; never
// accept builder classification/containment/loader flags as proof. RAW TREE ONLY.
import path from 'node:path';

const CONT = 0x10002, NOT_HANDLED = 0x80010001;
const requireThat = (ok, message) => { if (!ok) throw new Error(message); };
const uint = (v, label, positive = false) => {
  requireThat(Number.isSafeInteger(v) && v >= (positive ? 1 : 0) && v <= 0xffffffff, label); return v;
};
const integer = (v, label) => requireThat(Number.isSafeInteger(v), label);
const hex = v => `0x${v.toString(16).padStart(16, '0')}`;
const pointer = (v, label, positive = true) => {
  requireThat(typeof v === 'string' && /^0x[0-9a-f]{16}$/.test(v), label);
  const n = BigInt(v); requireThat(n !== 0xffffffffffffffffn && (!positive || n > 0n), label); return n;
};
const canonical = v => {
  requireThat(typeof v === 'string' && /^[A-Za-z]:[\\/]/.test(v), 'absolute image/root path');
  return path.win32.normalize(v.replace(/^\\\\\?\\/, '')).toLowerCase();
};
function boolCall(c, label) {
  requireThat(c && c.Result === true && c.ErrorValid === false && c.Error === null, `${label}: successful raw BOOL`);
  integer(c.RawLastError, `${label}: raw last-error unavailable`); // stale on success
}
function decode(raw) {
  requireThat(typeof raw === 'string' && /^[0-9a-f]{352}$/.test(raw), 'exact176 raw bytes');
  const b = Buffer.from(raw, 'hex'), tag = b.readUInt32LE(0), pid = b.readUInt32LE(4), tid = b.readUInt32LE(8);
  requireThat(tag >= 1 && tag <= 9 && pid > 0 && tid > 0, 'raw header tag/PID/TID');
  const d = { eventCode: tag, pid, tid };
  const u = n => b.readUInt32LE(n), q = n => hex(b.readBigUInt64LE(n));
  if (tag === 3) Object.assign(d, { fileHandle: q(16), processHandle: q(24), threadHandle: q(32), imageBase: q(40) });
  if (tag === 2) d.threadHandle = q(16);
  if (tag === 6) Object.assign(d, { fileHandle: q(16), imageBase: q(24) });
  if (tag === 7) d.imageBase = q(16);
  if (tag === 5) d.exitCode = u(16);
  if (tag === 9) Object.assign(d, { error: u(16), type: u(20) });
  if (tag === 1) {
    const count = u(40), chance = u(168); requireThat(count <= 15 && chance <= 1, 'raw exception bounds');
    Object.assign(d, { exceptionCode: u(16), exceptionFlags: u(20), nestedRecord: q(24), exceptionAddress: q(32), parameterCount: count, firstChance: chance,
      parameters: Array.from({ length: count }, (_, n) => q(48 + 8 * n)) });
  }
  return d;
}
function probe(p, identity, tid, contract, jobHandle) {
  requireThat(p && p.Pid === identity.Pid && p.Tid === tid && p.ThreadPid === identity.Pid && p.CreatedFileTime === identity.CreatedFileTime, 'native probe PID/thread/generation');
  requireThat(canonical(p.Image) === canonical(contract.imagePath) && p.ImageSha256 === contract.imageSha256 && p.ImageBytes === String(contract.imageBytes), 'native probe image/hash/bytes');
  requireThat(p.ProcessMachine === 0 && p.NativeMachine === 0x8664, 'native probe unsupported architecture');
  for (const name of ['Times', 'ImageQuery', 'Architecture']) boolCall(p[name], `native probe ${name}`);
  for (const name of ['PidRawError', 'TidRawError', 'ThreadPidRawError']) integer(p[name], `native probe ${name}`);
  requireThat(p.Membership && p.Membership.Member === true && p.Membership.OwnerHeld === true && p.Membership.OwnerHandle === jobHandle, 'retained trial job membership');
  pointer(p.Membership.OwnerHandle, 'job owner handle'); boolCall(p.Membership.Call, 'job membership');
}
export function inspectRawTree(report, contract) {
  requireThat(contract && contract.boundary === 'CALLER_MUST_VERIFY_OWNER_RUNTIME_AND_FILES', 'explicit unverified boundary required');
  uint(contract.rootPid, 'contract root PID', true); uint(contract.imageBytes, 'contract executable bytes', true);
  requireThat(/^[a-f0-9]{64}$/.test(contract.imageSha256) && /^[a-f0-9]{64}$/.test(contract.loaderSha256), 'frozen image hashes');
  canonical(contract.rootDir); canonical(contract.imagePath); canonical(contract.loaderPath);
  const trap = pointer(contract.trapRva, 'derived loader RVA'), jobHandle = contract.jobHandle;
  requireThat(trap<=16777216n,'derived loader RVA outside frozen PE bound');
  pointer(jobHandle, 'frozen caller-derived job handle');
  requireThat(Array.isArray(contract.rootCreationOwned) && contract.rootCreationOwned.length === 2, 'two root creation duplicates required');
  pointer(contract.rootEventWait, 'additional root event wait');
  const live = new Map(), add = (h, label) => { pointer(h, `${label}: valid handle`); requireThat(!live.has(h), `${label}: live alias`); live.set(h, label); };
  for (const h of contract.rootCreationOwned) add(h, 'root creation duplicate');
  requireThat(Array.isArray(report.events) && report.events.length > 0 && report.events.length <= 4096, 'event ledger count');
  requireThat(Array.isArray(report.processes) && report.processes.length > 0 && report.processes.length <= 16, 'process table count');
  requireThat(Array.isArray(report.debugWaits) && report.debugWaits.length > 0 && report.debugWaits.length <= 8192, 'debug wait count');
  const table = new Map();
  for (const p of report.processes) {
    const id = p.identity; requireThat(id && id.Pid === p.pid && !table.has(p.pid), 'unique native identity');
    uint(id.Pid, 'identity PID', true); uint(id.PrimaryTid, 'identity primary TID', true); pointer(id.CreatedFileTime, 'identity FILETIME');
    requireThat(canonical(id.Image) === canonical(contract.imagePath) && id.ImageSha256 === contract.imageSha256, 'native identity frozen image');
    // IdentityVerified/JobMember/closed/loader flags are deliberately not used.
    table.set(p.pid, p);
  }
  const received = [];
  for (const w of report.debugWaits) {
    requireThat(w && Number.isInteger(w.requestedMs) && w.requestedMs > 0 && w.requestedMs <= 25 && w.call, 'bounded native poll');
    if (w.call.Result === true) { boolCall(w.call, 'debug wait'); requireThat(w.rawByteLength === 176, 'debug wait bytes length');decode(w.rawHex);received.push(w.rawHex); }
    else { requireThat(w.call.Result === false && w.call.ErrorValid === true && w.call.Error === 121 && Number.isSafeInteger(w.call.RawLastError) && w.call.RawLastError === 121 && w.rawHex === null && w.rawByteLength === 0, 'failed poll is not declared timeout'); }
  }
  requireThat(received.length === report.events.length, 'successful waits/events one-to-one');
  const states = new Map();let totalExceptions = 0, totalThreads = 0;
  for (let index = 0; index < report.events.length; index++) {
    const e = report.events[index];requireThat(e && e.index === index && e.rawHex === received[index], 'event index/raw wait linkage');
    const d = decode(e.rawHex);for (const [key, value] of Object.entries(d)) requireThat(JSON.stringify(e[key]) === JSON.stringify(value), `raw payload mismatch:${key}`);
    const { eventCode: tag, pid, tid } = d;
    requireThat(tag !== 9 && !e.dispatchError && !e.untrustedHeader, 'RIP/failed/untrusted event not sound');
    requireThat(table.has(pid), 'event PID absent from validated process table');const p = table.get(pid), id = p.identity;
    if (index === 0) requireThat(tag === 3 && pid === contract.rootPid, 'root CREATE first');
    let s = states.get(pid);
    if (tag === 3) {
      requireThat(!s && tid === id.PrimaryTid && ++totalThreads <= 256, 'unique primary CREATE/thread cap');
      s = { pid, create: index, exit: null, threads: new Map(), process: d.processHandle, loaderBase: 0n, address: 0n, exceptions: 0, loaderEvent: null };
      // hFile must not alias either current system handle, even before CREATE
      // validation registers those handles in the live ownership table.
      requireThat(d.fileHandle !== d.processHandle && d.fileHandle !== d.threadHandle, 'CREATE image hFile aliases current process/thread');
      add(d.processHandle, 'system process');add(d.threadHandle, 'system primary thread');s.threads.set(tid, { handle: d.threadHandle, primary: true, exited: false });
      probe(p.originalProbe, id, tid, contract, jobHandle);probe(p.duplicateProbe, id, tid, contract, jobHandle);
      requireThat(p.systemProcess === d.processHandle && p.systemPrimaryThread === d.threadHandle, 'system handles raw crosslink');
      const dup = p.duplication;requireThat(dup && dup.Source === d.processHandle && dup.Inherit === false && dup.SameAccess === true && dup.Alias === false, 'independent duplicate origin/options');
      boolCall(dup.Call, 'process duplication');states.set(pid, s);
    } else requireThat(s && s.exit === null, 'event outside native CREATE/EXIT lifetime');
    if (tag === 2) {
      requireThat(++totalThreads <= 256 && !s.threads.has(tid), 'created thread cap/generation');
      probe(e.threadIdentity, id, tid, contract, jobHandle);add(d.threadHandle, 'system secondary thread');s.threads.set(tid, { handle: d.threadHandle, primary: false, exited: false });
    }
    if (d.fileHandle && d.fileHandle !== hex(0n) && d.fileHandle !== hex(0xffffffffffffffffn)) {
      pointer(d.fileHandle, 'image hFile');requireThat(!live.has(d.fileHandle), 'image hFile aliases live ownership');const m = e.image;
      requireThat(m && m.Handle === d.fileHandle && m.Error === null, 'image receipt missing/error');boolCall(m.Close, 'image CloseHandle');
      uint(m.PathResult, 'image path return');integer(m.PathRawLastError, 'image path raw error');requireThat(m.PathErrorValid === (m.PathResult === 0) && m.PathAvailable === (m.PathResult > 0 && m.PathResult < 32768), 'image path status interpretation');
      if (m.PathAvailable && canonical(m.Path) === canonical(contract.loaderPath)) {
        requireThat(m.Sha256 === contract.loaderSha256, 'NTDLL image hash');s.loaderBase = pointer(d.imageBase, 'NTDLL module base');s.address = s.loaderBase + trap;requireThat(s.address <= 0xffffffffffffffffn && e.loaderAddress === hex(s.address), 'independently derived remote loader address');
      }
    }
    // Source closes CREATE hFile BEFORE making the root/event wait duplicates.
    // A closed numeric value may legally be returned for a later duplicate.
    if (tag === 3) { if(pid === contract.rootPid)add(contract.rootEventWait, 'additional root event wait');add(p.duplication.Produced, 'owned event wait duplicate'); }
    if (tag === 7 && pointer(d.imageBase, 'unload base') === s.loaderBase) { s.loaderBase = 0n;s.address = 0n; }
    let expected = CONT;
    if (tag === 1) {
      const first = s.exceptions++ === 0;requireThat(s.exceptions <= 128 && ++totalExceptions <= 256, 'exception caps');
      const phase = e.startupPhase;
      const eligible = d.exceptionCode === 0x80000003 && d.firstChance === 1 && first && s.loaderEvent === null && tid === id.PrimaryTid && s.address !== 0n && d.exceptionAddress === hex(s.address);
      // Raw eligibility is reconstructed. A matching absent-marker receipt is
      // additionally required to consume the sole loader trap.
      let marker = false;
      requireThat(phase,'missing per-process exception phase receipt');
      if (phase) {
        const markerPath = path.win32.join(contract.rootDir, `identity-${pid}.json`);
        requireThat(phase.Pid === pid && canonical(phase.Path) === canonical(markerPath) && phase.Phase === 'OWNED_INITIAL_STARTUP' && phase.CreateSeen === true && phase.ModuleSeen === (s.address !== 0n) && phase.FirstException === first, 'startup phase does not match reconstructed native history');
        requireThat(phase.MarkerProbed === (first && s.address !== 0n), 'startup marker probe order');
        if(!phase.MarkerProbed)requireThat(phase.EntryMarkerAbsent===false&&phase.ProbeCertain===false&&phase.ProbeException===null&&phase.ProbeError===null&&phase.ProbeHResult===null,'unprobed phase fabricates marker observation');
        marker = phase.Pid === pid && canonical(phase.Path) === canonical(markerPath) && phase.Phase === 'OWNED_INITIAL_STARTUP' && phase.CreateSeen === true && phase.ModuleSeen === true && phase.FirstException === true && phase.MarkerProbed === true && phase.EntryMarkerAbsent === true && phase.ProbeCertain === true && phase.ProbeException === 'FileNotFoundException' && phase.ProbeError === 2 && phase.ProbeHResult === -2147024894;
      }
      expected = eligible && marker ? CONT : NOT_HANDLED;if(expected === CONT)s.loaderEvent = index;
    }
    requireThat(e.continuation === expected && e.continued === true, 'continuation policy/raw lifecycle mismatch');boolCall(e.continueCall, 'ContinueDebugEvent');
    if (tag === 4) { const t = s.threads.get(tid);requireThat(t && !t.exited, 'unknown/repeated EXIT_THREAD');t.exited = true;if(!t.primary){live.delete(t.handle);s.threads.delete(tid);} }
    if (tag === 5) { s.exit = index;s.exitCode = d.exitCode;live.delete(s.process);for(const t of s.threads.values())live.delete(t.handle); }
  }
  requireThat(states.size === table.size, 'extra native identity without original CREATE');
  for (const s of states.values()) { requireThat(s.exit !== null && s.loaderEvent !== null, 'missing continued EXIT/verified initial loader trap');requireThat(table.get(s.pid).exceptionCount===s.exceptions,'exception count differs from original bytes'); }
  return { scope: 'RAW_TREE_ONLY', completeCellAcceptance: false, processes: [...states.values()].map(s => ({ pid:s.pid, createIndex:s.create, loaderIndex:s.loaderEvent, exitIndex:s.exit, exitCode:s.exitCode })), remainingOwnedHandles:[...live.keys()], eventCount:report.events.length, waitCount:report.debugWaits.length };
}
