import { serializeGameState, deserializeGameState } from '../../../src/model/state.js';
import { advanceReplayStateOneSecond } from '../../../src/model/replay-second-runner.js';
import { undoVassalShopPurchase, reorderVassalShopPurchase, moveVassalShopStructure, rerollVassalShop } from '../../../src/model/vassal-life-map.js';
import { createOpeningExperiment, validateOpeningExperiment } from './experiment.js';
import { getWorldDefinition, getWorldConnectionCandidates, getRegionState, addWorldConnection } from '../../../src/model/world-state.js';
import { seedCampaignExample, selectCampaignTarget, resolveCampaignAttempt } from './campaign-experiment.js';
import { createOpeningSession, createTravelRewardExampleSession, cloneOpeningSession, openingSummary, openingVassal, enterOpeningEncounter,
  getOpeningDecision, selectOpeningOption, selectOpeningLegacyDestination, stageOpeningOffer, commitOpeningEncounter, finishOpeningEncounter, chooseOpeningDevelopment, finishOpeningNote, finishOpeningLegacyMock, resolveOpeningOptionOutcome } from './model.js';

function createFoundedPreview(document) {
  const next=createOpeningSession(document);next.availableIds=['founding'];enterOpeningEncounter(next,'founding');
  const before=openingSummary(next), option=getOpeningDecision(next).options.find(option=>!option.blocked);
  commitOpeningEncounter(next,option.id);
  const vassal=openingVassal(next), target=vassal.lifeMap.pendingResolution?.resolveSec??next.state.tSec;
  next.state.paused=false;
  while(next.state.tSec<target) {const result=advanceReplayStateOneSecond(next.state);if(!result.ok)throw new Error(result.reason);}
  finishOpeningEncounter(next,before);return next;
}

export const OPENING_STORAGE_KEY = 'civsurvivor.prototype.warriorOpening.v1';
export function createOpeningController(storage = null) {
  let draft = createOpeningExperiment(), saved = null, message = '', busy = false, progress = 0;
  try {
    const raw = storage?.getItem(OPENING_STORAGE_KEY);
    if (raw) { draft = validateOpeningExperiment(JSON.parse(raw)); saved = structuredClone(draft); message = 'Loaded your saved experiment.'; }
  } catch { message = 'Saved draft could not be read. The built-in experiment is open.'; }
  let session = createOpeningSession(draft), checkpoints = [], listeners = new Set();
  let draftIssue = '', draftUndo = [], draftRedo = [];
  function checkDraft() {
    try { validateOpeningExperiment(draft); draftIssue = ''; }
    catch (error) { draftIssue = error.message; }
  }
  function editDraft(doc) {
    idle(); if (JSON.stringify(doc) === JSON.stringify(draft)) return;
    draftUndo.push(structuredClone(draft)); if (draftUndo.length > 80) draftUndo.shift();
    draftRedo = []; draft = structuredClone(doc); checkDraft();
    message = draftIssue ? 'Graph edits kept. Fix the highlighted issue before playing or saving.' : 'Draft updated. Restart to play these changes.';
    notify();
  }
  const notify = () => listeners.forEach(listener => listener());
  function idle() { if (busy) throw new Error('Wait for the current outcome to resolve.'); }
  function transact(operation) {
    idle(); const next = cloneOpeningSession(session); operation(next);
    deserializeGameState(serializeGameState(next.state)); session = next; notify();
  }
  const controller = {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot() { return { draft: structuredClone(draft), experiment: session.experiment, summary: openingSummary(session),
      session, decision: getOpeningDecision(session), busy, progress, message, canRewind: checkpoints.length > 0,
      saved: !!saved, draftIssue, canUndoDraft: draftUndo.length > 0, canRedoDraft: draftRedo.length > 0,
      draftChanged: JSON.stringify(draft) !== JSON.stringify(session.experiment),
      development: openingVassal(session).developmentChoiceQueue[0] ?? null }; },
    getDecision(preview) { return getOpeningDecision(session, preview); },
    replaceDraft(doc) { idle(); editDraft(validateOpeningExperiment(doc)); },
    editDraft,
    undoDraft() { idle(); if (!draftUndo.length) return; draftRedo.push(structuredClone(draft)); draft = draftUndo.pop(); checkDraft(); message = 'Undid the draft edit.'; notify(); },
    redoDraft() { idle(); if (!draftRedo.length) return; draftUndo.push(structuredClone(draft)); draft = draftRedo.pop(); checkDraft(); message = 'Redid the draft edit.'; notify(); },
    save() { idle(); if (!storage) throw new Error('Browser storage is unavailable. Export the experiment instead.');
      validateOpeningExperiment(draft); storage.setItem(OPENING_STORAGE_KEY, JSON.stringify(draft)); saved = structuredClone(draft); message = 'Experiment saved in this browser.'; notify(); },
    load() { idle(); if (!saved) throw new Error('Save an experiment first.'); editDraft(saved); },
    resetDraft() { editDraft(createOpeningExperiment()); },
    restart() { idle(); const next = createOpeningSession(draft); session = next; checkpoints = []; message = 'Fresh opening, same seed. Choose an entry.'; notify(); },
    previewEncounter(id) {
      idle(); const next = createOpeningSession(draft);
      if (!draft.nodes.some(n => n.id === id)) throw new Error('Select a node to preview.');
      next.availableIds = [id]; const before = cloneOpeningSession(next); enterOpeningEncounter(next, id);
      session = next; checkpoints = [before]; message = 'Previewing this node in a fresh disposable opening.'; notify();
    },
    previewTravelRewards() {
      idle(); const next = createTravelRewardExampleSession();
      next.availableIds = ['explore']; const before = cloneOpeningSession(next); enterOpeningEncounter(next, 'explore');
      session = next; checkpoints = [before];
      message = 'Travel reward example: three destinations offer +3, +6 and +9 Prestige. Restart returns to your draft.'; notify();
    },
    previewShop(kind = 'shop', zeroPrestige = false) {
      idle(); if (!['shop','structureShop'].includes(kind)) throw new Error('Choose a shop.');
      const document = createOpeningExperiment(), shop = document.nodes.find(node=>node.id==='shop');
      shop.kind=kind;shop.title=kind==='shop'?'Practice shop':'Structure shop';shop.description='';
      const next=createFoundedPreview(document),vassal=openingVassal(next);
      if(zeroPrestige)vassal.prestige=0;
      const before=cloneOpeningSession(next);enterOpeningEncounter(next,'shop');session=next;checkpoints=[before];
      message=shop.title;notify();
    },
    previewLegacy(zeroPrestige=false,id=null) {
      idle();const document=createOpeningExperiment(),recipe=draft.nodes.find(node=>id?node.id===id:node.kind==='legacy');
      if(recipe?.kind==='legacy')document.nodes[document.nodes.findIndex(node=>node.id==='legacy')]={...structuredClone(recipe),id:'legacy',next:[]};
      const next=createFoundedPreview(document),vassal=openingVassal(next);
      vassal.prestige=zeroPrestige?0:60;Object.assign(vassal.stats,{intelligence:6,effectiveness:3,wisdom:2,cunning:1});
      const targets=getWorldConnectionCandidates(getWorldDefinition(next.state)).flatMap(edge=>edge.regionAId===vassal.locationRegionId?[edge.regionBId]:edge.regionBId===vassal.locationRegionId?[edge.regionAId]:[])
        .filter(id=>getRegionState(next.state,id)?.controller==='frontier'&&(getRegionState(next.state,id)?.structureCapacity??0)>=1).sort().slice(0,3);
      for(const regionId of targets)addWorldConnection(next.state,vassal.locationRegionId,regionId);
      next.availableIds=['legacy'];const before=cloneOpeningSession(next);enterOpeningEncounter(next,'legacy');
      session=next;checkpoints=[before];message='Legacy mockup: Confirm records your choice and its future Vassal bonus.';notify();
    },
    previewCampaign(inputs={},id=null) {
      idle();const document=createOpeningExperiment(),recipe=draft.nodes.find(node=>id?node.id===id:node.kind==='martial');
      if(recipe?.kind==='martial')document.nodes[document.nodes.findIndex(node=>node.id==='martial')]={...structuredClone(recipe),id:'martial',next:['supply']};
      const next=createFoundedPreview(document);next.availableIds=['martial'];enterOpeningEncounter(next,'martial');seedCampaignExample(next,inputs);
      session=next;checkpoints=[];message='Campaign mockup: sample forces and supplies. Outcomes change this experiment only.';notify();
    },
    nextSeed() { idle(); validateOpeningExperiment(draft); editDraft({ ...draft, seed: (draft.seed + 1) >>> 0 }); controller.restart(); },
    enter(id) { idle(); const checkpoint = cloneOpeningSession(session), next = cloneOpeningSession(session);
      enterOpeningEncounter(next, id); deserializeGameState(serializeGameState(next.state));
      checkpoints.push(checkpoint); session = next; message = 'Choose an action or stage purchases.'; notify(); },
    rewind() { idle(); if (!checkpoints.length) return;
      session = cloneOpeningSession(checkpoints.pop()); message = 'Returned to the previous decision, including its RNG state.'; notify(); },
    select(id) { transact(next => selectOpeningOption(next, id)); },
    selectLegacyDestination(regionId) { transact(next=>selectOpeningLegacyDestination(next,regionId)); },
    selectCampaignTarget(regionId) { transact(next=>selectCampaignTarget(next,regionId)); },
    leaveCampaign() {
      idle();if(!session.campaign||!session.activeId)throw new Error('Enter Campaign first.');
      const next=cloneOpeningSession(session),history=structuredClone(next.campaign.history);checkpoints.push(cloneOpeningSession(session));
      finishOpeningEncounter(next,openingSummary(next));next.outcomes.at(-1).campaign=history;next.outcomes.at(-1).mock=true;
      session=next;message='Campaign recorded. Continue to the next node.';notify();
    },
    stage(id, origin, toIndex, replacePracticeId) { transact(next => stageOpeningOffer(next, id, origin, toIndex, replacePracticeId)); },
    undo(id) { transact(next => { const result = undoVassalShopPurchase(next.state, next.runtimeNodeId, id); if (!result.ok) throw new Error(result.reason); }); },
    reorder(id, toIndex) { transact(next => { const result = reorderVassalShopPurchase(next.state, next.runtimeNodeId, id, toIndex); if (!result.ok) throw new Error(result.reason); }); },
    move(id, origin) { transact(next => { const result = moveVassalShopStructure(next.state, next.runtimeNodeId, id, origin); if (!result.ok) throw new Error(result.reason); }); },
    reroll() { transact(next => {
      const spec = next.experiment.nodes.find(n => n.id === next.activeId);
      if (next.shopSelection?.tags.length) throw new Error('Shop offers follow the selected tag.');
      if (spec.cards) throw new Error('Edit curated offers in the draft, then Restart.');
      const result = rerollVassalShop(next.state, next.runtimeNodeId); if (!result.ok) throw new Error(result.reason);
    }); },
    develop(statId) { transact(next => chooseOpeningDevelopment(next, statId)); },
    async commit(optionId, destination, pass) {
      idle(); const next = cloneOpeningSession(session), before = openingSummary(next);
      if(next.campaign) {
        const checkpoint=cloneOpeningSession(session),result=resolveCampaignAttempt(next);checkpoints.push(checkpoint);
        session=next;message=result.text;notify();return;
      }
      if (next.experiment.nodes.find(n => n.id === next.activeId)?.kind === 'customNote') {
        finishOpeningNote(next); session = next; message = 'Note read. Continue to the next node.'; notify(); return;
      }
      if(next.experiment.nodes.find(node=>node.id===next.activeId)?.kind==='legacy') {
        finishOpeningLegacyMock(next,optionId);session=next;message='Legacy choice recorded for this mockup. No settlement, reward or retirement effects applied.';notify();return;
      }
      const outcome = resolveOpeningOptionOutcome(next, optionId);
      if (outcome?.needsAcquisition) {
        session = next; message = `${next.randomOutcome.label}. Choose where to put the relic, then Confirm.`; notify(); return;
      }
      commitOpeningEncounter(next, outcome?.optionId ?? optionId, destination, pass);
      busy = true; progress = 0; message = 'Resolving the world through simulation ticks…'; notify();
      try {
        const vassal = openingVassal(next), target = vassal.lifeMap.pendingResolution?.resolveSec ?? next.state.tSec;
        const start = next.state.tSec; next.state.paused = false;
        while (next.state.tSec < target && !next.state.runStatus?.complete) {
          for (let step = 0; step < 8 && next.state.tSec < target && !next.state.runStatus?.complete; step++) {
            const result = advanceReplayStateOneSecond(next.state);
            if (!result.ok && !next.state.runStatus?.complete) throw new Error(result.reason);
          }
          progress = Math.round(100 * (next.state.tSec - start) / Math.max(1, target - start)); notify();
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        finishOpeningEncounter(next, before);
        deserializeGameState(serializeGameState(next.state)); session = next;
        message = 'Outcome resolved. Compare the result, continue or rewind.';
      } finally { busy = false; progress = 0; notify(); }
    },
    exportDraft() { return JSON.stringify(draft, null, 2); },
  };
  return controller;
}
