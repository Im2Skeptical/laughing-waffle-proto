import { parseReviewDocument, projectReview, applyCardReviews, reviewKey, readReviewValue, writeReviewValue, reviewScheduleEdits, validateReviewValue, validateReviewTarget, exportReviewDocument, planReviewBulkEdit, reviewBulkFields } from '../model/dev-lab/card-review.js';
import { createAuthoredGamepiecesDraft, validateGamepiecesDraft } from '../model/game-config.js';
import { createNewGameState } from '../model/new-game.js';
import { importReviewDocument } from '../model/dev-lab/card-review.js';

// Stable across builds; never attach this key to player save reset/cleanup.
export const CARD_REVIEW_STORAGE_KEY = 'civsurvivor.card-review.v1';
export const CARD_REVIEW_GAME_MODE_KEY = 'civsurvivor.card-review.use-in-new-games';
function browserStorage() {
  try{return globalThis.localStorage;}catch{return {getItem:()=>null,setItem:()=>{throw new Error('Browser storage is unavailable.');}};}
}
export function createCardReviewController({storage = browserStorage(), resolveLive} = {}) {
  const read = () => parseReviewDocument(storage.getItem(CARD_REVIEW_STORAGE_KEY));
  const enabled = () => {try{return storage.getItem(CARD_REVIEW_GAME_MODE_KEY)==='true';}catch{return false;}};
  const launch = () => {
    const result=applyCardReviews(createAuthoredGamepiecesDraft(),Object.values(read().cards));
    result.issues.push(...validateGamepiecesDraft(result.gamepieces).errors);
    return result;
  };
  const write = action => {
    const doc = read(); action(doc); storage.setItem(CARD_REVIEW_STORAGE_KEY, JSON.stringify(doc)); return doc;
  };
  const prefix = (a,b) => a.length<=b.length&&a.every((part,index)=>part===b[index]);
  const applyEdits = (doc,kind,id,proposals) => {
    const entry=doc.cards[reviewKey(kind,id)];
    if(!entry)throw new Error('Flag this card before editing.');
    const live=resolveLive?.(kind,id)??entry.baseline;
    const draft=projectReview(entry,live).definition;
    const edits=typeof proposals==='function'?proposals(draft):proposals;
    for(const {path,value} of edits) {
      validateReviewValue(draft,path,value);validateReviewTarget(entry.baseline,live,path);
      // Missing lock flags mean unlocked, including reviews from older builds.
      const isLock=path.length===1&&path[0]==='locked';
      if(isLock)entry.baseline.locked??=false;
      // Newly introduced fields establish their original value on first edit.
      let baseline=entry.baseline;
      for(let depth=0;depth<path.length;depth++) {
        const part=path[depth],original=readReviewValue(live,path.slice(0,depth+1));
        if(baseline[part]===undefined&&original!==undefined)baseline[part]=JSON.parse(JSON.stringify(original));
        if(baseline[part]===undefined)break;
        baseline=baseline[part];
      }
      // Editing a leaf inside a selected collection updates that collection;
      // selecting a collection supersedes old per-index edits without losing them.
      const parent=entry.edits.find(edit=>prefix(edit.path,path));
      writeReviewValue(draft,path,value);
      // A leaf inside a reviewed collection (an added output, say) may not exist
      // in the original, so the whole collection is checked against it instead.
      if(parent&&parent.path.length<path.length)validateReviewValue(entry.baseline,parent.path,readReviewValue(draft,parent.path));
      else validateReviewValue(entry.baseline,path,value);
      const storedPath=parent?.path??path,storedValue=readReviewValue(draft,storedPath)??null;
      entry.edits=entry.edits.filter(edit=>!prefix(storedPath,edit.path)&&!prefix(edit.path,storedPath));
      if(JSON.stringify(readReviewValue(live,storedPath)??(isLock?false:null))!==JSON.stringify(storedValue))entry.edits.push({path:storedPath,value:storedValue});
    }
  };
  const editValues = (kind,id,proposals) => write(doc=>applyEdits(doc,kind,id,proposals));
  const clone = value => JSON.parse(JSON.stringify(value));
  const addFlag = (doc,kind,id,definition,tier='bronze') => {
    if (!['practice','structure'].includes(kind) || !definition) throw new Error('Only Practice and Structure cards can be reviewed.');
    const key = reviewKey(kind, id);
    if (doc.cards[key]) return false;
    doc.cards[key] = {kind, id, tier, baseline:clone(definition), edits:[], notes:'', flaggedAt:new Date().toISOString()};
    return true;
  };
  // Bulk targets carry the projected draft so plans match what single edits see.
  const bulkTargets = (doc,keys) => [...new Set(keys)].map(key=>{
    const entry=doc.cards[key];
    if(!entry)return {key,label:key,absent:true};
    const live=resolveLive?.(entry.kind,entry.id);
    const definition=projectReview(entry,live??entry.baseline).definition;
    return {key,label:definition.label??entry.id,definition,locked:definition.locked===true,absent:Boolean(resolveLive)&&!live};
  });
  return {
    useInNewGames:enabled,
    setUseInNewGames:value=>storage.setItem(CARD_REVIEW_GAME_MODE_KEY,String(Boolean(value))),
    getLaunchKey:()=>enabled()?`edited:${storage.getItem(CARD_REVIEW_STORAGE_KEY)}`:'live',
    getLaunchStatus:()=>{const result=launch();return {enabled:enabled(),count:result.applied.length,issues:result.issues};},
    createNewGame(seed = globalThis.crypto.getRandomValues(new Uint32Array(1))[0]) {
      if(!enabled())return createNewGameState(seed);
      const result=launch();
      if(result.issues.length)throw new Error(`Edited cards need attention: ${result.issues.slice(0,3).join('; ')}`);
      return createNewGameState(seed,{gamepieces:result.gamepieces});
    },
    applyTo:gamepieces=>applyCardReviews(gamepieces,Object.values(read().cards)),
    list:() => Object.values(read().cards),
    get:(kind, id) => read().cards[reviewKey(kind, id)] ?? null,
    flag(kind, id, definition, tier = 'bronze') {
      if (!['practice','structure'].includes(kind) || !definition) throw new Error('Only Practice and Structure cards can be reviewed.');
      write(doc => {addFlag(doc,kind,id,definition,tier);});
    },
    // One storage write; existing reviews keep their edits and notes.
    flagMany(items) {
      let added=0;
      write(doc=>{for(const {kind,id,definition,tier} of items)if(addFlag(doc,kind,id,definition,tier))added++;});
      return added;
    },
    bulkFields:keys=>reviewBulkFields(bulkTargets(read(),keys).filter(target=>!target.absent).map(target=>target.definition)),
    planBulk:(keys,path,value,options)=>planReviewBulkEdit(bulkTargets(read(),keys),path,value,options),
    // Applies one top-level value to many cards in a single storage write.
    // Returns the plan rows plus an undo snapshot of each changed card's
    // baseline and edits from before the change.
    bulkEdit(keys,path,value,options) {
      let result;
      write(doc=>{
        const rows=[], entries={};
        for(const row of planReviewBulkEdit(bulkTargets(doc,keys),path,value,options)) {
          if(row.status!=='change'){rows.push(row);continue;}
          const entry=doc.cards[row.key], before={baseline:clone(entry.baseline),edits:clone(entry.edits)};
          try{applyEdits(doc,entry.kind,entry.id,[{path,value}]);entries[row.key]=before;rows.push(row);}
          catch(error){Object.assign(entry,before);rows.push({...row,status:'skipped',reason:'invalid',message:error.message});}
        }
        result={rows,changed:Object.keys(entries),skipped:rows.filter(row=>row.status==='skipped'),undo:{path:[...path],value,entries}};
      });
      return result;
    },
    // Restores each card's pre-bulk baseline and edits; notes written since
    // stay, and cards deleted since stay deleted.
    undoBulk(undo) {
      let restored=0;
      write(doc=>{for(const [key,before] of Object.entries(undo?.entries??{}))if(doc.cards[key]){Object.assign(doc.cards[key],clone(before));restored++;}});
      return restored;
    },
    edit(kind, id, path, value) {
      editValues(kind,id,[{path,value}]);
    },
    setLocked:(kind,id,value)=>editValues(kind,id,[{path:['locked'],value}]),
    schedule:(kind,id,triggers)=>editValues(kind,id,draft=>reviewScheduleEdits(draft,triggers)),
    notes:(kind, id, notes) => write(doc => {doc.cards[reviewKey(kind, id)].notes = notes;}),
    reset:(kind, id) => write(doc => {
      const entry=doc.cards[reviewKey(kind,id)];entry.edits=[];
      const live=resolveLive?.(kind,id);if(live)entry.baseline=JSON.parse(JSON.stringify(live));
    }),
    remove:(kind, id) => write(doc => {delete doc.cards[reviewKey(kind, id)];}),
    preview:(entry, live) => projectReview(entry, live ?? resolveLive?.(entry.kind, entry.id)),
    export:() => JSON.stringify(exportReviewDocument(read(), resolveLive), null, 2),
    previewImport(raw) {
      const incoming=importReviewDocument(raw),local=read();
      const keys=Object.keys(incoming.cards),existing=keys.filter(key=>Object.hasOwn(local.cards,key));
      return {total:keys.length,added:keys.length-existing.length,existing:existing.length};
    },
    import(raw,{overwrite=false}={}) {
      const incoming=importReviewDocument(raw);
      const result={added:0,replaced:0,skipped:0};
      write(doc=>{
        for(const [key,entry] of Object.entries(incoming.cards)) {
          const exists=Object.hasOwn(doc.cards,key);
          if(exists&&!overwrite){result.skipped++;continue;}
          doc.cards[key]=entry;result[exists?'replaced':'added']++;
        }
      });
      return result;
    },
  };
}

export function openCardReviewer(state, face) {
  const registry = face.kind === 'practice' ? 'practices' : 'structures';
  const definition = state?.gameConfig?.gamepieces?.[registry]?.[face.definitionId];
  const review = createCardReviewController();
  review.flag(face.kind, face.definitionId, definition, face.tier);
  const url = new URL(location.href);
  url.hash = `/dev/reviewer?card=${encodeURIComponent(`${face.kind}:${face.definitionId}`)}`;
  // Synchronous with the tap so phone browsers allow the new tab.
  const opened = window.open(url.href, '_blank');
  if (opened) opened.opener = null;
  else {location.assign(url.href);location.reload();}
}
