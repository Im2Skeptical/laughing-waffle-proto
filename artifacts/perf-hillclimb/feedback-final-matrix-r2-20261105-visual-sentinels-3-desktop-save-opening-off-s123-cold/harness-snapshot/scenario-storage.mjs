// Harness-only, opt-in snapshots of the isolated browser context's logical
// scenario storage. HTTP/resource caches are deliberately outside this scope.
// These functions are serialized into a setup document with page.evaluate.
export function readScenarioResources(){
  return {available:true,timeOrigin:performance.timeOrigin,readAtMs:performance.now(),
    entries:performance.getEntriesByType('resource').map(entry=>({name:entry.name,initiatorType:entry.initiatorType,
      startTime:entry.startTime,responseStart:entry.responseStart,responseEnd:entry.responseEnd,duration:entry.duration,
      transferSize:entry.transferSize,encodedBodySize:entry.encodedBodySize,decodedBodySize:entry.decodedBodySize,
      nextHopProtocol:entry.nextHopProtocol})),
    scope:'returned document ResourceTiming buffer only, not a complete network trace; retain raw bytes/times; zero transfer for positive same-origin body corroborates cache use; no latency subtraction'};
}
export async function captureScenarioStorage({database}){
  const storagePairs=storage=>Array.from({length:storage.length},(_,i)=>{
    const key=storage.key(i);return [key,storage.getItem(key)];
  }).sort(([a],[b])=>a.localeCompare(b));
  const names=['saves','settings','slots'];
  const db=await new Promise((resolve,reject)=>{
    const request=indexedDB.open(database,1);
    request.onupgradeneeded=()=>{
      request.transaction.abort();reject(new Error('warm baseline must already have the actual initialized save database'));
    };
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('warm storage capture is blocked'));
  });
  try{
    if(JSON.stringify([...db.objectStoreNames].sort())!==JSON.stringify(names))throw new Error('unexpected actual save stores');
    const stores=await new Promise((resolve,reject)=>{
      const transaction=db.transaction(names,'readonly'),values={};
      for(const name of names){
        const store=transaction.objectStore(name),keys=store.getAllKeys(),rows=store.getAll();
        values[name]={keyPath:store.keyPath,keys:null,values:null};
        keys.onsuccess=()=>{values[name].keys=keys.result;};
        rows.onsuccess=()=>{values[name].values=rows.result;};
      }
      transaction.oncomplete=()=>resolve(values);transaction.onabort=()=>reject(transaction.error);
    });
    for(const name of names)if(stores[name].keys.length!==stores[name].values.length)throw new Error('unaligned storage records');
    return {version:1,database,local:storagePairs(localStorage),session:storagePairs(sessionStorage),stores};
  }finally{db.close();}
}

export async function restoreScenarioStorage(snapshot){
  const names=['saves','settings','slots'];
  if(snapshot?.version!==1||typeof snapshot.database!=='string'
    ||JSON.stringify(Object.keys(snapshot.stores??{}).sort())!==JSON.stringify(names))throw new Error('invalid warm storage baseline');
  for(const pairs of [snapshot.local,snapshot.session]){
    if(!Array.isArray(pairs)||pairs.some(pair=>!Array.isArray(pair)||pair.length!==2||pair.some(value=>typeof value!=='string'))
      ||new Set(pairs.map(([key])=>key)).size!==pairs.length)throw new Error('invalid warm preference baseline');
  }
  for(const name of names){
    const rows=snapshot.stores[name];
    if(!Array.isArray(rows?.keys)||!Array.isArray(rows.values)||rows.keys.length!==rows.values.length
      ||rows.keyPath!==(name==='settings'?null:'slot'))throw new Error('invalid warm save-store baseline');
    if(rows.keys.some((key,i)=>!['string','number'].includes(typeof key)
      ||name!=='settings'&&rows.values[i]?.slot!==key))throw new Error('invalid warm save-store key correspondence');
  }
  const db=await new Promise((resolve,reject)=>{
    const request=indexedDB.open(snapshot.database,1);
    request.onupgradeneeded=()=>{request.transaction.abort();reject(new Error('warm database disappeared'));};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('warm storage restore is blocked'));
  });
  try{
    if(JSON.stringify([...db.objectStoreNames].sort())!==JSON.stringify(names))throw new Error('unexpected warm save stores');
    await new Promise((resolve,reject)=>{
      const transaction=db.transaction(names,'readwrite');
      transaction.oncomplete=resolve;transaction.onabort=()=>reject(transaction.error);
      try{
        for(const name of names){
          const store=transaction.objectStore(name),rows=snapshot.stores[name];
          if(store.keyPath!==rows.keyPath)throw new Error('warm store key path changed');
          store.clear();
          for(let i=0;i<rows.keys.length;i++){
            if(store.keyPath===null)store.put(rows.values[i],rows.keys[i]);
            else store.put(rows.values[i]);
          }
        }
      }catch(error){transaction.abort();reject(error);}
    });
  }finally{db.close();}
  for(const [storage,pairs]of [[localStorage,snapshot.local],[sessionStorage,snapshot.session]]){
    storage.clear();for(const [key,value]of pairs)storage.setItem(key,value);
  }
  return {committed:true,scope:'actual save stores and local/session preferences restored; HTTP caches retained'};
}
