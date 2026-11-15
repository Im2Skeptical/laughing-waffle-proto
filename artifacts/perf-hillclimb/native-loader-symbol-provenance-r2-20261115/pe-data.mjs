import assert from 'node:assert/strict';
export function peData(b){
 assert.ok(Buffer.isBuffer(b)&&b.length>=512&&b.length<=16*1024*1024,'PE byte bound');
 const bound=(o,n)=>assert.ok(Number.isSafeInteger(o)&&o>=0&&n>=0&&o+n<=b.length,'PE range');
 const u16=o=>{bound(o,2);return b.readUInt16LE(o)},u32=o=>{bound(o,4);return b.readUInt32LE(o)};
 assert.equal(u16(0),0x5a4d,'DOS');const p=u32(0x3c);assert.equal(u32(p),0x4550,'PE');assert.equal(u16(p+4),0x8664,'x64');
 const count=u16(p+6),opt=p+24,size=u16(p+20);assert.ok(count>=1&&count<=96&&size>=240,'PE header bounds');bound(opt,size);assert.equal(u16(opt),0x20b,'PE32+');
 const imageSize=u32(opt+56),directories=u32(opt+108);assert.ok(directories>=7&&directories<=16,'directory count');
 const sections=[];for(let i=0;i<count;i++){const s=opt+size+i*40;bound(s,40);const item={index:i+1,name:b.subarray(s,s+8).toString('ascii').replace(/\0.*$/,''),virtualSize:u32(s+8),rva:u32(s+12),rawSize:u32(s+16),raw:u32(s+20),flags:u32(s+36)};bound(item.raw,item.rawSize);assert.ok(item.rva+Math.max(item.virtualSize,item.rawSize)<=imageSize,'section image bound');sections.push(item);}
 const offset=(rva,n)=>{assert.ok(Number.isSafeInteger(rva)&&rva>=0&&n>=0,'RVA type');const matches=sections.filter(s=>rva>=s.rva&&rva+n<=s.rva+s.rawSize);assert.equal(matches.length,1,'unique raw-backed RVA');const o=matches[0].raw+rva-matches[0].rva;bound(o,n);return o;};
 const directory=i=>({rva:u32(opt+112+i*8),size:u32(opt+116+i*8)});
 const debug=directory(6);assert.ok(debug.size>0&&debug.size%28===0&&debug.size/28<=64,'debug directory bound');const d=offset(debug.rva,debug.size),cv=[];
 for(let i=0;i<debug.size/28;i++){const o=d+i*28;if(u32(o+12)!==2)continue;const n=u32(o+16),rva=u32(o+20),raw=u32(o+24);assert.ok(n>=25&&n<=4096,'CodeView size');bound(raw,n);assert.equal(offset(rva,n),raw,'CodeView pointer/RVA');assert.equal(b.subarray(raw,raw+4).toString('ascii'),'RSDS','CodeView RSDS');
  const end=b.indexOf(0,raw+24);assert.ok(end>=raw+24&&end<raw+n,'CodeView name terminator');const originalName=b.subarray(raw+24,end).toString('utf8'),name=originalName.split(/[\\/]/).at(-1);assert.equal(name.toLowerCase(),'ntdll.pdb','expected PDB basename');
  const guidRaw=b.subarray(raw+4,raw+20).toString('hex'),guid=[u32(raw+4).toString(16).padStart(8,'0'),u16(raw+8).toString(16).padStart(4,'0'),u16(raw+10).toString(16).padStart(4,'0'),b.subarray(raw+12,raw+20).toString('hex')].join('').toUpperCase(),age=u32(raw+20);assert.ok(age>0,'PDB age');cv.push({guidRaw,guid,age,name,originalName,recordOffset:raw,recordBytes:n});
 }
 assert.equal(cv.length,1,'one RSDS identity');
 function functionAt(point){const table=directory(3);assert.ok(table.size>0&&table.size%12===0&&table.size/12<=65536,'runtime table bound');const start=offset(table.rva,table.size),matches=[];let previous=-1;
  for(let i=0;i<table.size/12;i++){const o=start+i*12,begin=u32(o),end=u32(o+4),unwind=u32(o+8);assert.ok(begin>previous&&begin<end&&end<=imageSize,'runtime function ordering/range');previous=begin;if(point>=begin&&point<end)matches.push({begin,end,unwind,entryOffset:o});}
  assert.equal(matches.length,1,'one runtime function at point');const f=matches[0];assert.ok(f.end-f.begin<=4096,'selected function byte cap');const bodyOffset=offset(f.begin,f.end-f.begin),section=sections.find(s=>f.begin>=s.rva&&f.end<=s.rva+s.rawSize);assert.ok((section.flags&0x20000000)!==0,'executable section');
  return {...f,sectionIndex:section.index,sectionName:section.name,bodyOffset,bodyHex:b.subarray(bodyOffset,bodyOffset+f.end-f.begin).toString('hex'),pointByte:b[offset(point,1)]};
 }
 return {rsds:cv[0],sections,imageSize,offset,functionAt};
}
