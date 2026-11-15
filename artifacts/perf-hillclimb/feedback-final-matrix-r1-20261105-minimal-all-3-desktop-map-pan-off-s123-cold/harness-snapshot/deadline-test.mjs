import assert from 'node:assert/strict';
import {withDeadline} from './deadline.mjs';
assert.equal(await withDeadline(Promise.resolve('observed'),60000),'observed');
const failure=new Error('real request failed');
await assert.rejects(withDeadline(Promise.reject(failure),60000),error=>error===failure);
await assert.rejects(withDeadline(new Promise(()=>{}),10,'missing atlas request'),/missing atlas request timeout/);
await assert.rejects(withDeadline(Promise.resolve(true),Infinity),/positive finite/);
console.log('[hillclimb-deadline] resolved/failed/missing request and finite-deadline controls passed; long timers cleared');
