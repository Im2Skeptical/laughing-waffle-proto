import assert from 'node:assert/strict';
import {quantile,quantileInterval,clusterQuantileInterval,clusterBootstrapDiagnostic,summarize} from './statistics.mjs';

const sequence=n=>Array.from({length:n},(_,i)=>i+1);
assert.equal(quantile(sequence(1000),.95),950);
assert.equal(quantileInterval(sequence(60)).high,null,'n60 P95 upper bound genuinely unbounded');
assert.ok(quantileInterval(sequence(120)).bounded,'n120 P95 interval has finite endpoints');
// Independently obtained with Python Decimal(60 digits) and exact math.comb,
// summing C(n,k)*(.95**k)*(.05**(n-k)); see PROOF_RUN.md.
for(const [n,low,high] of [[60,53,null],[120,109,119],[1000,936,964]]) {
  const actual=quantileInterval(sequence(n));
  assert.deepEqual([actual.low,actual.high],[low,high],`independent binomial oracle n=${n}`);
}
for(const n of [120,1000,10000,100000]) {
  const result=quantileInterval(sequence(n));
  assert.ok(Number.isFinite(result.low)&&Number.isFinite(result.high)&&result.low<result.estimate&&result.high>result.estimate);
}
let observation=0;
const row=(launchId,elapsedMs,extra={})=>({job:'control',step:'completion',population:{cpu:1},launchId,elapsedMs,ok:true,
  buildId:'statistics-control-build',fixture:'fixed-control',harnessId:'control-mechanism-v1',measurementContractId:'A2',
  fixtureManifestId:'1'.repeat(64),oracleSdkSha256:'2'.repeat(64),comparisonEligible:true,observationId:`control-${observation++}`,...extra});
const sixty=Array.from({length:60},(_,i)=>row(`launch-${i}`,100));
const failed=summarize([...sixty,...Array.from({length:10},(_,i)=>row(`timeout-${i}`,180000,{ok:false,timeout:true}))])[0];
assert.equal(failed.p95,null,'conditional tail cannot appear as unconditional P95');
assert.equal(failed.successOnly.p95,100);
assert.deepEqual(failed.latencyBounds.p95,{low:180000,high:null});
assert.equal(failed.correctnessGate,false);
assert.equal(failed.eligibleForTailInference,false);
assert.equal(failed.failed,10);
const invalid=summarize([row('invalid',NaN),row('negative',-1),row('ok-timeout',500,{timeout:true})])[0];
assert.equal(invalid.passed,0);
assert.equal(invalid.failed,3);
assert.equal(invalid.invalid,2);
assert.throws(()=>summarize([row('',100)]),/identity/);
assert.throws(()=>quantile([NaN],.95),/finite/);
const clustered=Array.from({length:40},(_,i)=>Array.from({length:3},()=>row(`cluster-${i}`,i===39?500:20))).flat();
const options={replicates:1000,seed:123};
const clusterResult=summarize(clustered,options)[0];
assert.equal(clusterResult.p95Interval.clusters,40);
assert.equal(clusterResult.p95Interval.high,null,'40 perfectly correlated clusters cannot give bounded P95 upper');
assert.equal(clusterResult.eligibleForTailInference,false);
assert.deepEqual(clusterBootstrapDiagnostic(clustered,.95,options),clusterBootstrapDiagnostic(clustered,.95,options),'diagnostic resampling reproducible');
assert.equal(clusterBootstrapDiagnostic(clustered,.95,options).eligibleForInference,false);
assert.equal(summarize(clustered.slice(0,60),options)[0].eligibleForTailInference,false,'repeated operations cannot fake independent launch quota');
const enoughClusters=Array.from({length:120},(_,i)=>[row(`launch-${i}`,i+1),row(`launch-${i}`,i+101)]).flat();
const conservative=clusterQuantileInterval(enoughClusters);
assert.deepEqual([conservative.low,conservative.high],[109,219],'conservative envelope uses exact independent launch extrema');
assert.equal(summarize(enoughClusters,options)[0].eligibleForTailInference,true);
assert.equal(summarize([...enoughClusters,row('launch-0',10000)],options)[0].eligibleForTailInference,false,'unequal operation counts cannot pass hard tail inference');
assert.equal(summarize(sequence(120).map(i=>row(`independent-${i}`,i)))[0].eligibleForTailInference,true);
const mixedOrder=summarize([row('a',10,{population:{cpu:1,art:'off'}}),row('b',20,{population:{art:'off',cpu:1}})]);
assert.equal(mixedOrder.length,1,'population grouping does not depend on object insertion order');
assert.equal(summarize([row('a',10,{buildId:'build-a'}),row('b',20,{buildId:'build-b'})]).length,2,'unlike builds never pool');
assert.equal(summarize([row('a',10,{fixture:'fixture-a'}),row('b',20,{fixture:'fixture-b'})]).length,2,'unlike fixtures never pool');
assert.throws(()=>summarize([row('a',10,{buildId:null})]),/build identity/);
const duplicate=row('a',10);assert.throws(()=>summarize([duplicate,duplicate]),/duplicate/);
assert.equal(summarize(sequence(120).map(i=>row(`independent-${i}`,i)))[0].p95Interval.confidence,.99);
assert.throws(()=>summarize([row('a',10,{fixture:undefined})]),/fixture identity/);
assert.throws(()=>summarize([row('a',10,{population:undefined})]),/population configuration/);
assert.throws(()=>summarize([row('a',10,{population:{cpu:undefined}})]),/explicit JSON/);
assert.equal(summarize([row('a',10,{harnessId:'timer-v1'}),row('b',20,{harnessId:'timer-v2'})]).length,2,'different measurement mechanisms cannot pool');
assert.equal(summarize([row('a',10,{measurementContractId:'A1'}),row('b',20,{measurementContractId:'A2'})]).length,2,'changed contracts cannot pool');
for(const extra of [
  {comparisonEligible:false}, {comparisonEligible:undefined},
  {fixtureManifestId:undefined}, {fixtureManifestId:'none-construction-only'},
  {oracleSdkSha256:null}, {oracleSdkSha256:'not-a-frozen-sdk'},
]) {
  const diagnostic=summarize(sequence(120).map(i=>row(`construction-${i}`,i,extra)))[0];
  assert.equal(diagnostic.tailSampleQuotaMet,true,'construction data may meet the numerical sample quota');
  assert.equal(diagnostic.eligibleForTailInference,false,'raw construction or unpinned oracle data cannot regain inferential eligibility');
  assert.equal(diagnostic.comparisonEligible,false);
  assert.match(diagnostic.inference,/construction|frozen/i);
}
assert.equal(summarize([row('a',10),row('b',20,{comparisonEligible:false})]).length,2,'construction and comparison rows never pool');
assert.equal(summarize([row('a',10),row('b',20,{fixtureManifestId:'3'.repeat(64)})]).length,2,'different frozen corpora never pool');
assert.equal(summarize([row('a',10),row('b',20,{oracleSdkSha256:'4'.repeat(64)})]).length,2,'different oracle SDKs never pool');
console.log('[hillclimb-statistics] controls passed: stable intervals, honest unbounded/censored tails, invalid timing, launch quotas and clustered inference');
