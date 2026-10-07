import { parseReviewDocument, projectReview, applyCardReviews, reviewKey, readReviewValue, writeReviewValue, reviewScheduleEdits, validateReviewValue, validateReviewTarget, exportReviewDocument } from '../model/dev-lab/card-review.js';
import { createAuthoredGamepiecesDraft, validateGamepiecesDraft } from '../model/game-config.js';
import { createNewGameState } from '../model/new-game.js';

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
  const editValues = (kind,id,proposals) => write(doc=>{
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
      validateReviewValue(entry.baseline,path,value);
      writeReviewValue(draft,path,value);
      // Editing a leaf inside a selected collection updates that collection;
      // selecting a collection supersedes old per-index edits without losing them.
      const parent=entry.edits.find(edit=>prefix(edit.path,path));
      const storedPath=parent?.path??path,storedValue=readReviewValue(draft,storedPath)??null;
      entry.edits=entry.edits.filter(edit=>!prefix(storedPath,edit.path)&&!prefix(edit.path,storedPath));
      if(JSON.stringify(readReviewValue(live,storedPath)??(isLock?false:null))!==JSON.stringify(storedValue))entry.edits.push({path:storedPath,value:storedValue});
    }
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
      write(doc => {
        const key = reviewKey(kind, id);
        if (!doc.cards[key]) doc.cards[key] = {kind, id, tier, baseline:JSON.parse(JSON.stringify(definition)), edits:[], notes:'', flaggedAt:new Date().toISOString()};
      });
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
