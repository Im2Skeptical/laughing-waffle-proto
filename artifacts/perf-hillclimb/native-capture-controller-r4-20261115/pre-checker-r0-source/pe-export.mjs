// Read-only bounded PE32+ export parser; no DLL loading or invocation.
export function exportRva(bytes,wanted){
  const need=(v,m)=>{if(!v)throw Error('PE export:'+m);};
  need(Buffer.isBuffer(bytes)&&bytes.length>=256&&bytes.length<=16777216,'bounded bytes');
  const u16=o=>{need(o>=0&&o+2<=bytes.length,'u16 bounds');return bytes.readUInt16LE(o);};
  const u32=o=>{need(o>=0&&o+4<=bytes.length,'u32 bounds');return bytes.readUInt32LE(o);};
  need(u16(0)===0x5a4d,'DOS magic');const pe=u32(0x3c);need(u32(pe)===0x4550&&u16(pe+4)===0x8664,'x64 PE');
  const sections=u16(pe+6),optional=pe+24,size=u16(pe+20);need(sections>0&&sections<=96&&u16(optional)===0x20b&&size>=120,'optional header');
  const exportBase=u32(optional+112),exportSize=u32(optional+116),sectionTable=optional+size;
  const at=rva=>{
    for(let i=0;i<sections;i++){const s=sectionTable+i*40,virtualSize=u32(s+8),va=u32(s+12),rawSize=u32(s+16),raw=u32(s+20);
      if(rva>=va&&rva<va+Math.max(virtualSize,rawSize)){need(rva-va<rawSize,'RVA outside raw data');const offset=raw+rva-va;need(offset<bytes.length,'mapped bounds');return offset;}}
    throw Error('PE export:RVA unmapped');
  };
  const table=at(exportBase),functionCount=u32(table+20),nameCount=u32(table+24),functions=at(u32(table+28)),names=at(u32(table+32)),ordinals=at(u32(table+36));
  need(functionCount>0&&functionCount<=1000000&&nameCount<=1000000,'table count');
  for(let i=0;i<nameCount;i++){
    const start=at(u32(names+i*4));let end=start;while(end<bytes.length&&end-start<4096&&bytes[end]!==0)end++;
    need(end<bytes.length&&end-start<4096,'name bound');if(bytes.toString('ascii',start,end)!==wanted)continue;
    const ordinal=u16(ordinals+i*2);need(ordinal<functionCount,'ordinal');const rva=u32(functions+ordinal*4);
    need(rva>0&&rva<16777216&&!(rva>=exportBase&&rva<exportBase+exportSize),'forwarded/invalid function');return rva;
  }throw Error('PE export:symbol missing');
}
