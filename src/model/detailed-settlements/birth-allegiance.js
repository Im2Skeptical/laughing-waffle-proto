// Prototype: carried entitlement (smooth weighted round robin), not independent
// rounding. One ledger per residency/specialty avoids class-order bias.
export function allocateBirthAllegiances(settlement,shares,births,{classId,specialty}) {
  if(!births)return [];
  const ids=Object.keys(shares).filter(id=>shares[id]>0).sort();
  const total=ids.reduce((n,id)=>n+shares[id],0);
  if(!total)return [];
  const key=classId+':'+specialty,ledgers=settlement.birthAllegianceCredits;
  let credit=ledgers[key];
  // A vanished faction cannot receive a ghost birth. A changed eligible set
  // starts a new quota epoch; ordinary changes in proportions retain credit.
  if(!credit||Object.keys(credit).sort().join('|')!==ids.join('|'))credit=ledgers[key]=Object.fromEntries(ids.map(id=>[id,0]));
  const counts=Object.fromEntries(ids.map(id=>[id,0]));
  for(let i=0;i<births;i++) {
    let winner=ids[0];
    for(const id of ids) {
      credit[id]+=shares[id]/total;
      if(credit[id]>credit[winner]+1e-12)winner=id;
    }
    credit[winner]-=1;counts[winner]++;
    // Remove floating-point sum drift; this is not a quota reset.
    const remainder=ids.slice(0,-1).reduce((n,id)=>n+credit[id],0);
    credit[ids.at(-1)]=remainder===0?0:-remainder;
  }
  return ids.filter(id=>counts[id]).map(allegiance=>({classId,specialty,kind:'children',age:null,allegiance,count:counts[allegiance]}));
}

export function validateBirthAllegianceCredits(settlement) {
  const ledgers=settlement.birthAllegianceCredits;
  if(!ledgers||typeof ledgers!=='object'||Array.isArray(ledgers))return ['missing birth allegiance credits'];
  for(const [key,credits] of Object.entries(ledgers)) {
    if(!/^(villager|stranger):(ordinary|warrior|scholar)$/.test(key)||!credits||typeof credits!=='object'||Array.isArray(credits))return ['invalid birth allegiance credits'];
    const entries=Object.entries(credits);
    if(!entries.length||entries.some(([id,n])=>!['player','external-a','neutral'].includes(id)||!Number.isFinite(n)||n<=-1-1e-8||n>=2+1e-8)
       ||Math.abs(entries.reduce((n,[,c])=>n+c,0))>1e-8)return ['invalid birth allegiance credit balance'];
  }
  return [];
}
