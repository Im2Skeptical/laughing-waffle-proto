import fs from'node:fs';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{decodeFunction}from'./decode.mjs';
const root='artifacts/perf-hillclimb/native-loader-instruction-proof-r1-20261115';assert.ok(!fs.existsSync(root+'/controls.json'));const cases=[];
function check(name,hex,expected,errorPart){let error=null,result;try{result=decodeFunction(Buffer.from(hex,'hex'));if(expected!==null)assert.deepEqual(result.reachableInt3Offsets,expected);}catch(e){error=e.message;}cases.push({name,hex,expected,errorPart:errorPart??null,error,asExpected:errorPart?!!error?.includes(errorPart):!error});}
check('reachable INT3 excludes post-return padding','ccc3cc',[0]);
check('CC immediate is not an instruction','b8cc000000ccc3',[5]);
check('SIB displacement and immediate boundaries','c6442400ccccc3',[5]);
check('conditional skip preserves both reachable paths','7501ccc3',[2]);
check('direct jump skips padding trap','eb01ccc3',[]);
check('CALL rel32 falls through in local graph','e800000000ccc3',[5]);
check('branch into operand rejected','ebffccc3',null,'control target outside instruction boundary');
check('truncated CALL rejected','e8ffff',null,'truncated instruction');
check('truncated immediate rejected','4883ec',null,'truncated instruction');
check('unsupported legacy prefix rejected','66ccc3',null,'unsupported opcode');
check('invalid LEA register encoding rejected','488dcc',null,'LEA register form invalid');
check('invalid MOV group rejected','c7c801000000ccc3',null,'unsupported MOV group');
check('fallthrough outside function rejected','cc',null,'control target outside instruction boundary');
check('local cycle rejected','ebfec3',null,'control cycle unsupported');
const sha=f=>createHash('sha256').update(fs.readFileSync(root+'/'+f)).digest('hex'),r={at:new Date().toISOString(),cases,allExpected:cases.every(c=>c.asExpected),sourcePins:{'decode.mjs':sha('decode.mjs'),'controls.mjs':sha('controls.mjs')},scope:'Builder pure subset controls, no real function input or native/API/helper/target. Not independent proof of decoder or continuation policy.'};fs.writeFileSync(root+'/controls.json',JSON.stringify(r,null,2),{flag:'wx'});console.log(JSON.stringify({cases:cases.length,allExpected:r.allExpected,failed:cases.filter(c=>!c.asExpected).map(c=>c.name)}));if(!r.allExpected)process.exitCode=1;
