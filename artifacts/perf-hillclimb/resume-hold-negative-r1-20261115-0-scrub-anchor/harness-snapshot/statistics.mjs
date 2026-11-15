import assert from 'node:assert/strict';

export function quantile(values,p) {
  assert.ok(p>0&&p<1,'quantile probability must be between zero and one');
  assert.ok(values.length&&values.every(Number.isFinite),'nonempty finite observations required');
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.ceil(p*sorted.length)-1];
}

// Mode-centred binomial weights avoid starting at an underflowed tail PMF.
// X_(L)..X_(U) covers q_p when L <= Binomial(n,p) < U. Null endpoints
// represent the order statistics X_0=-infinity / X_(n+1)=+infinity.
export function quantileInterval(values,p=.95,confidence=.95) {
  assert.ok(p>0&&p<1&&confidence>0&&confidence<1,'valid probabilities required');
  assert.ok(values.every(Number.isFinite),'finite observations required');
  const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;
  if(!n)return {n:0,low:null,high:null,bounded:false};
  const weights=new Float64Array(n+1),mode=Math.min(n,Math.floor((n+1)*p));
  weights[mode]=1;
  for(let k=mode;k>0;k--)weights[k-1]=weights[k]*k/(n-k+1)*(1-p)/p;
  for(let k=mode;k<n;k++)weights[k+1]=weights[k]*(n-k)/(k+1)*p/(1-p);
  const total=weights.reduce((sum,w)=>sum+w,0),alpha=(1-confidence)/2;
  assert.ok(Number.isFinite(total)&&total>0,'binomial numeric failure');
  let cdf=0,lowerRank=0,upperRank=n+1;
  for(let k=0;k<=n;k++) {
    cdf+=weights[k]/total;
    if(cdf<=alpha)lowerRank=k+1;
    if(cdf>=1-alpha){upperRank=k+1;break;}
  }
  return {n,p,confidence,estimate:quantile(sorted,p),
    low:lowerRank>0?sorted[lowerRank-1]:null,high:upperRank<=n?sorted[upperRank-1]:null,
    lowerRank,upperRank,bounded:lowerRank>0&&upperRank<=n,
    method:'iid binomial order statistics, mode-centred weights; null endpoint is unbounded'};
}

// Deterministic analysis resampling only, separate from simulation/fixtures.
function bootstrapStream(seed) {
  let word=seed>>>0;
  assert.ok(word,'nonzero bootstrap seed required');
  return count=>{word^=word<<13;word^=word>>>17;word^=word<<5;return Math.floor((word>>>0)/4294967296*count);};
}

export function clusterBootstrapDiagnostic(rows,p=.95,{confidence=.95,replicates=5000,seed=0x4c434831}={}) {
  assert.ok(rows.length,'nonempty cluster population required');
  assert.ok(rows.every(r=>typeof r.launchId==='string'&&r.launchId&&Number.isFinite(r.elapsedMs)),
    'each cluster observation needs launchId and finite elapsedMs');
  assert.ok(Number.isInteger(replicates)&&replicates>=1000,'at least 1000 bootstrap replicates required');
  const byLaunch=new Map();
  for(const r of rows){if(!byLaunch.has(r.launchId))byLaunch.set(r.launchId,[]);byLaunch.get(r.launchId).push(r.elapsedMs);}
  const clusters=[...byLaunch.values()],draw=bootstrapStream(seed),estimates=[];
  for(let b=0;b<replicates;b++) {
    const resampled=[];
    for(let c=0;c<clusters.length;c++)resampled.push(...clusters[draw(clusters.length)]);
    estimates.push(quantile(resampled,p));
  }
  const alpha=(1-confidence)/2;
  return {n:rows.length,clusters:clusters.length,p,confidence,estimate:quantile(rows.map(r=>r.elapsedMs),p),
    low:quantile(estimates,alpha),high:quantile(estimates,1-alpha),bounded:true,
    method:'percentile bootstrap of whole launch clusters (operation-weighted quantile)',replicates,seed,
    eligibleForInference:false,
    limitation:'diagnostic only: empirical bootstrap cannot discover unobserved tail modes; never used for hard regression gates'};
}

export function clusterQuantileInterval(rows,p=.95,{confidence=.95}={}) {
  assert.ok(rows.length&&rows.every(r=>typeof r.launchId==='string'&&r.launchId&&Number.isFinite(r.elapsedMs)),
    'nonempty finite observations with launch identities required');
  const byLaunch=new Map();
  for(const r of rows){if(!byLaunch.has(r.launchId))byLaunch.set(r.launchId,[]);byLaunch.get(r.launchId).push(r.elapsedMs);}
  const clusters=[...byLaunch.values()],equalSize=clusters.every(c=>c.length===clusters[0].length);
  // For equal operation counts, q_p(session minima) <= q_p(operations) <=
  // q_p(session maxima). Each exact interval has <=alpha/2 error on its
  // selected side; union bound gives >=confidence for this conservative
  // envelope even under arbitrary within-session dependence.
  const minima=quantileInterval(clusters.map(c=>Math.min(...c)),p,confidence);
  const maxima=quantileInterval(clusters.map(c=>Math.max(...c)),p,confidence);
  const low=equalSize?minima.low:null,high=equalSize?maxima.high:null;
  return {n:rows.length,clusters:clusters.length,p,confidence,estimate:quantile(rows.map(r=>r.elapsedMs),p),
    low,high,bounded:equalSize&&minima.low!==null&&maxima.high!==null,equalClusterSize:equalSize,
    operationsPerLaunch:equalSize?clusters[0].length:null,minimaInterval:minima,maximaInterval:maxima,
    eligibleForInference:equalSize&&clusters.length>=120&&minima.bounded&&maxima.bounded,
    method:'conservative exact binomial envelope of independent-session minima/maxima; null endpoint unbounded',
    assumptions:'independent identically distributed sessions, fixed equal offered operation counts; no workload-dependent sample loss'};
}

const finiteElapsed=r=>Number.isFinite(r.elapsedMs)&&r.elapsedMs>=0;
const completed=r=>r.ok===true&&!r.timeout&&finiteElapsed(r);
const pinnedDigest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const frozenWorkload=r=>r.comparisonEligible===true&&pinnedDigest(r.fixtureManifestId)&&pinnedDigest(r.oracleSdkSha256);
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
function boundQuantile(values,p){const sorted=[...values].sort((a,b)=>a-b);const q=sorted[Math.ceil(p*sorted.length)-1];return Number.isFinite(q)?q:null;}

export function summarize(records,bootstrapOptions={}) {
  const groups=new Map(),seen=new Set(),confidence=bootstrapOptions.confidence??.99;
  assert.ok(confidence>=.99&&confidence<1,'hard-tail per-build/per-look confidence must be at least 99%');
  for(const record of records) {
    assert.ok(typeof record.launchId==='string'&&record.launchId,'every observation needs actual launch/session identity');
    assert.ok(typeof record.buildId==='string'&&record.buildId,'every observation needs exact build identity');
    for(const name of ['fixture','harnessId','measurementContractId','job','step'])
      assert.ok(typeof record[name]==='string'&&record[name].trim(),`every observation needs explicit ${name} identity`);
    assert.ok(record.population&&typeof record.population==='object'&&!Array.isArray(record.population)
      &&Object.keys(record.population).length,'every observation needs explicit nonempty population configuration');
    // Missing/invalid JSON leaves can collapse distinct configurations during
    // grouping. The runner/independent audit still must validate their meaning.
    JSON.stringify(record.population,(_key,value)=>{
      assert.ok(value!==undefined&&typeof value!=='function'&&typeof value!=='symbol'
        &&(typeof value!=='number'||Number.isFinite(value)),'population must contain explicit JSON values');return value;
    });
    assert.ok(typeof record.observationId==='string'&&record.observationId,'every observation needs unique observation identity');
    assert.ok(!seen.has(record.observationId),'duplicate observation identity');seen.add(record.observationId);
    // Preserve provenance in the central raw-row summarizer. A caller cannot
    // regain inference merely by omitting the runner's construction-only label.
    // The loader/auditor must still establish that these pinned bytes are sound.
    const key=JSON.stringify(stable([record.buildId,record.harnessId,record.measurementContractId,record.fixture,record.job,record.step,record.population,
      record.fixtureManifestId??null,record.oracleSdkSha256??null,record.comparisonEligible===true]));
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(record);
  }
  return [...groups].map(([key,rows])=>{
    const successful=rows.filter(completed),times=successful.map(r=>r.elapsedMs);
    const launches=new Set(rows.map(r=>r.launchId)).size,independent=launches===rows.length;
    const allComplete=successful.length===rows.length;
    const comparisonEligible=rows.every(frozenWorkload);
    const successOnly=times.length?{count:times.length,p50:quantile(times,.5),p95:quantile(times,.95),
      min:Math.min(...times),max:Math.max(...times),population:'conditional on valid successful completion'}:null;
    // An unsuccessful operation has no correct completion; its duration is a
    // lower bound, never a fast completed sample.
    const lower=rows.map(r=>finiteElapsed(r)?r.elapsedMs:0),upper=rows.map(r=>completed(r)?r.elapsedMs:Infinity);
    const interval=allComplete?(independent?quantileInterval(times,.95,confidence):clusterQuantileInterval(successful,.95,{confidence})):null;
    return {key:JSON.parse(key),attempted:rows.length,passed:successful.length,failed:rows.length-successful.length,
      fixtureManifestId:rows[0].fixtureManifestId??null,oracleSdkSha256:rows[0].oracleSdkSha256??null,comparisonEligible,
      invalid:rows.filter(r=>r.ok===true&&!r.timeout&&!finiteElapsed(r)).length,
      timeouts:rows.filter(r=>r.timeout).length,independentLaunches:launches,
      p50:allComplete?successOnly.p50:null,p95:allComplete?successOnly.p95:null,
      min:allComplete?successOnly.min:null,max:allComplete?successOnly.max:null,
      successOnly,p95Interval:interval,
      p95BootstrapDiagnostic:allComplete&&!independent?clusterBootstrapDiagnostic(successful,.95,bootstrapOptions):null,
      decisionCoverage:'99% per build/per look; at most two predeclared looks across baseline/candidate gives >=96% metricwise joint coverage by union bound, not across all jobs',
      latencyBounds:{p50:{low:boundQuantile(lower,.5),high:boundQuantile(upper,.5)},
        p95:{low:boundQuantile(lower,.95),high:boundQuantile(upper,.95)},
        method:'observed completion or right-censored time-to-correct-completion; null high is unbounded'},
      correctnessGate:allComplete,
      tailSampleQuotaMet:allComplete&&rows.length>=120&&launches>=120,
      eligibleForTailInference:comparisonEligible&&allComplete&&rows.length>=120&&launches>=120&&interval.bounded,
      censored:rows.filter(r=>!completed(r)).map(r=>({lowerBoundMs:finiteElapsed(r)?r.elapsedMs:0,
        launchId:r.launchId,timeout:!!r.timeout,invalidTiming:r.ok===true&&!finiteElapsed(r)})),
      inference:!comparisonEligible?'CONSTRUCTION OR UNPINNED ORACLE: diagnostic only; explicit frozen corpus and SDK identities required'
        :allComplete?(independent?'iid interval only if manifest proves separate independent launches':'conservative exact envelope of independent launch extrema; bootstrap diagnostic only')
        :'failed correctness gate; unconditional latency unresolved, successful-only values diagnostic'};
  });
}
