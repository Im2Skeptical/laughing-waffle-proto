import assert from'node:assert/strict';
// Conservative x64 subset used by the frozen routine. Unknown encodings reject.
export function decodeFunction(b){
 assert.ok(Buffer.isBuffer(b)&&b.length>0&&b.length<=4096,'function byte bound');let at=0;const nodes=[];
 const take=n=>{assert.ok(at+n<=b.length,'truncated instruction');const p=at;at+=n;return p;};
 const modrm=()=>{const m=b[take(1)],mod=m>>>6,rm=m&7,group=(m>>>3)&7;let base=rm;if(mod!==3&&rm===4)base=b[take(1)]&7;if(mod===0&&base===5)take(4);else if(mod===1)take(1);else if(mod===2)take(4);return {mod,group};};
 while(at<b.length){const offset=at;let rex=0;if(b[at]>=0x40&&b[at]<=0x4f)rex=b[take(1)];const opcode=b[take(1)];let kind='fall',relative=null;
  if([0x83,0x80,0xc6,0xc7,0x8d,0x85].includes(opcode)){const m=modrm();if(opcode===0xc6||opcode===0xc7)assert.equal(m.group,0,'unsupported MOV group');if(opcode===0x8d)assert.notEqual(m.mod,3,'LEA register form invalid');if([0x83,0x80,0xc6].includes(opcode))take(1);if(opcode===0xc7)take(4);}
  else if(opcode>=0xb8&&opcode<=0xbf)take((rex&8)!==0?8:4);
  else {assert.equal(rex,0,'REX on control opcode unsupported');if(opcode===0xe8){const p=take(4);relative=b.readInt32LE(p);kind='call';}else if(opcode===0xeb||(opcode>=0x70&&opcode<=0x7f)){relative=b.readInt8(take(1));kind=opcode===0xeb?'jump':'conditional';}else if(opcode===0xcc)kind='int3';else if(opcode===0xc3)kind='return';else assert.fail('unsupported opcode:'+opcode.toString(16));}
  assert.ok(at-offset<=15,'instruction length');nodes.push({offset,size:at-offset,hex:b.subarray(offset,at).toString('hex'),kind,relative,target:relative===null?null:at+relative});
 }
 const byOffset=new Map(nodes.map(n=>[n.offset,n])),reachable=new Set(),active=new Set(),calls=[];
 function visit(offset){assert.ok(byOffset.has(offset),'control target outside instruction boundary');assert.ok(!active.has(offset),'control cycle unsupported');if(reachable.has(offset))return;active.add(offset);reachable.add(offset);const n=byOffset.get(offset);if(n.kind==='call')calls.push({offset:n.offset,target:n.target});if(n.kind!=='return'){if(n.kind==='jump')visit(n.target);else{if(n.kind==='conditional')visit(n.target);visit(n.offset+n.size);}}active.delete(offset);}
 visit(0);const traps=nodes.filter(n=>reachable.has(n.offset)&&n.kind==='int3').map(n=>n.offset),returns=nodes.filter(n=>reachable.has(n.offset)&&n.kind==='return').map(n=>n.offset);assert.ok(returns.length>0,'reachable return missing');return {nodes,reachableOffsets:[...reachable].sort((a,b)=>a-b),reachableInt3Offsets:traps,unreachableInt3Offsets:nodes.filter(n=>!reachable.has(n.offset)&&n.kind==='int3').map(n=>n.offset),returnOffsets:returns,calls,scope:'Subset instruction boundaries and direct intrafunction flow only. Calls assumed to return for this graph; no execution or general x64/OS behavior proof.'};
}
