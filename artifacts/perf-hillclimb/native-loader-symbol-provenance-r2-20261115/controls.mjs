import fs from'node:fs';import assert from'node:assert/strict';import {createHash}from'node:crypto';import {resolveData}from'./resolve.mjs';
const root='artifacts/perf-hillclimb/native-loader-symbol-provenance-r2-20261115',sha=b=>createHash('sha256').update(b).digest('hex');assert.ok(!fs.existsSync(root+'/controls.json'));
function fixture(){
 const pe=Buffer.alloc(0xc00),u16=(o,n)=>pe.writeUInt16LE(n,o),u32=(o,n)=>pe.writeUInt32LE(n,o),opt=0x98,s=opt+240;
 u16(0,0x5a4d);u32(0x3c,0x80);u32(0x80,0x4550);u16(0x84,0x8664);u16(0x86,1);u16(0x94,240);u16(opt,0x20b);u32(opt+56,0x2000);u32(opt+108,16);pe.write('.text',s,'ascii');u32(s+8,0x800);u32(s+12,0x1000);u32(s+16,0x800);u32(s+20,0x400);u32(s+36,0x60000020);
 u32(opt+112+6*8,0x1100);u32(opt+116+6*8,28);u32(0x50c,2);u32(0x510,34);u32(0x514,0x1140);u32(0x518,0x540);pe.write('RSDS',0x540,'ascii');const guid=Buffer.from(Array.from({length:16},(_,i)=>i));guid.copy(pe,0x544);u32(0x554,1);pe.write('ntdll.pdb\0',0x558,'ascii');
 u32(opt+112+3*8,0x1180);u32(opt+116+3*8,12);u32(0x580,0x1020);u32(0x584,0x1040);u32(0x588,0x1200);pe[0x430]=0xcc;
 const pdb=Buffer.alloc(8*4096);Buffer.from('Microsoft C/C++ MSF 7.00\r\n\x1aDS\0\0\0','binary').copy(pdb);const p32=(o,n)=>pdb.writeUInt32LE(n,o);p32(32,4096);p32(36,1);p32(40,8);p32(44,40);p32(52,3);p32(3*4096,4);
 const name='FixtureBreak',record=Buffer.alloc(Math.ceil((14+name.length+1)/4)*4);record.writeUInt16LE(record.length-2,0);record.writeUInt16LE(0x110e,2);record.writeUInt32LE(3,4);record.writeUInt32LE(0x20,8);record.writeUInt16LE(1,12);record.write(name,14,'ascii');
 const d=4*4096;p32(d,6);[0xffffffff,28,0,64,0,record.length].forEach((n,i)=>p32(d+4+i*4,n));[5,6,7].forEach((n,i)=>p32(d+28+i*4,n));p32(5*4096,20000404);p32(5*4096+8,1);guid.copy(pdb,5*4096+12);p32(6*4096,0xffffffff);p32(6*4096+4,19990903);p32(6*4096+8,1);pdb.writeUInt16LE(5,6*4096+20);pdb.writeUInt16LE(0x8664,6*4096+58);record.copy(pdb,7*4096);
 return {pe,pdb};
}
const cases=[];function check(name,mutation,expectedError){const f=fixture();if(mutation)mutation(f);let error=null,result=null;try{result=resolveData(f.pe,f.pdb,0x1030);}catch(e){error=e.message;}const pass=expectedError?error?.includes(expectedError):!error&&result.pdb.matchedStartSymbols[0].name==='FixtureBreak';cases.push({name,expectedError:error?expectedError??null:expectedError??null,error,asExpected:!!pass});}
check('matched PE RSDS/PDB/runtime/public/INT3 byte',null,null);
check('wrong DOS',f=>f.pe[0]=0,'DOS');check('wrong machine',f=>f.pe.writeUInt16LE(0x14c,0x84),'x64');
check('raw section out of file',f=>f.pe.writeUInt32LE(0xffff,0x98+240+16),'PE range');
check('CodeView identity too short',f=>f.pe.writeUInt32LE(24,0x510),'CodeView size');
check('CodeView pointer mismatch',f=>f.pe.writeUInt32LE(0x544,0x518),'CodeView pointer/RVA');
check('wrong PDB GUID',f=>f.pdb[5*4096+12]^=1,'PDB/PE GUID mismatch');
// Exact retained r1 mutation; expectation corrected by Microsoft OpenValidate4,
// not removed or silently renamed. Later info age with exact DBI binding is valid.
check('wrong PDB age',f=>f.pdb.writeUInt32LE(2,5*4096+8),null);
check('directory outside file',f=>f.pdb.writeUInt32LE(8,3*4096),'data block index');
check('stream outside file',f=>f.pdb.writeUInt32LE(8,4*4096+28),'data block index');
check('zero-length symbol',f=>f.pdb.writeUInt16LE(0,7*4096),'symbol record length');
check('unmapped public segment',f=>f.pdb.writeUInt16LE(99,7*4096+12),'exact runtime-function start public symbol unavailable');
check('point not INT3 byte',f=>f.pe[0x430]=0x90,'observed point is not an INT3 byte');
check('DBI age differs',f=>f.pdb.writeUInt32LE(2,6*4096+8),'DBI/image age mismatch');
check('PDB info age4 with exact image1 DBI1',f=>f.pdb.writeUInt32LE(4,5*4096+8),null);
check('PDB info age below image',f=>{f.pe.writeUInt32LE(2,0x554);f.pdb.writeUInt32LE(2,6*4096+8);},'PDB info age older than image');
check('DBI zero is not exact modern binding',f=>f.pdb.writeUInt32LE(0,6*4096+8),'DBI/image age mismatch');
check('later info age cannot hide wrong DBI',f=>{f.pdb.writeUInt32LE(4,5*4096+8);f.pdb.writeUInt32LE(2,6*4096+8);},'DBI/image age mismatch');
const files={};for(const n of ['pe-data.mjs','pdb-data.mjs','resolve.mjs','controls.mjs'])files[n]=sha(fs.readFileSync(root+'/'+n));const receipt={at:new Date().toISOString(),cases,allExpected:cases.every(c=>c.asExpected),sourcePins:files,correctedPriorExpectation:{name:'wrong PDB age',prior:'reject info2/image1/DBI1',current:'accept',reason:'Microsoft OpenValidate4: matching GUID, infoAge>=imageAge, DBIAge==imageAge. Legacy DBI0 remains unsupported here.',source:'https://github.com/microsoft/microsoft-pdb/blob/master/PDB/dbi/pdb.cpp'},scope:'Builder static fixture controls only; exact14 retained mutations, one explicitly corrected expectation plus4 affected age controls. No native API/helper/target/capture, no real symbol data or safe-continuation acceptance.'};fs.writeFileSync(root+'/controls.json',JSON.stringify(receipt,null,2),{flag:'wx'});console.log(JSON.stringify({cases:cases.length,allExpected:receipt.allExpected,failures:cases.filter(c=>!c.asExpected).map(c=>c.name)}));if(!receipt.allExpected)process.exitCode=1;
