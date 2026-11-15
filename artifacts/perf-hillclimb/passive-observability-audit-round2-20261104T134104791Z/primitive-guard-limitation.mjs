import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=readFileSync('scripts/timing-observability-test.mjs','utf8');
const fn=source.match(/function primitives\(value\) \{([\s\S]*?)\n\}/)[0];
const check=vm.runInNewContext(`(${fn})`,{assert});
const malformed={nonfinite:NaN,callback:()=>{},missing:undefined};
let rawRejected=false;try{check(malformed);}catch{rawRejected=true;}
assert.equal(rawRejected,true);
const normalized=JSON.parse(JSON.stringify(malformed));check(normalized);
const report={rawRejected,normalizedAccepted:true,normalized,source:'scripts/timing-observability-test.mjs:42',impact:'The current primitive guard inspects JSON-normalized output, so it does not prove raw DTO types. Current production readers were separately source-reviewed; no corresponding production defect was found.'};
writeFileSync(new URL('./primitive-guard-limitation.json',import.meta.url),JSON.stringify(report,null,2));
console.log('[audit-primitive-guard] limitation reproduced: raw malformed value rejected, JSON-normalized value accepted');
