import assert from 'node:assert/strict';
import {digest} from './fixtures.mjs';

export const controlToken='preview-isolation-response-only-v1';
// This helper rewrites only an isolated browser response. The application has
// no mutation API, control global, pointer publication, or test branch.
export function previewControlBundle(original){
  const start='    inspectRetainedStates: () => {',end='    rememberCivilizationSurvivalYear,';
  const from=original.indexOf(start),to=original.indexOf(end,from);
  assert.ok(from>=0&&to>from&&original.indexOf(start,from+1)===-1,'unique installed-state inspector');
  const before=original.slice(from,to);
  assert.ok(before.endsWith('    },\n'),'exact inspector boundary');
  const prefix=`
      const c = globalThis.__HC_PREVIEW_STATE_CONTROL__;
      if (!c || c.token !== '${controlToken}') throw new Error('isolated preview control scope required');
      if (c.armed) {
        if (!dragPreviewState || dragPreviewState.tSec !== c.target) throw new Error('wrong real installed control target');
        c.armed = false;
        c.originalRaw = JSON.stringify(dragPreviewState);
        dragPreviewState.persistentKnowledge.droppedItemKindsByPoolId.__previewFault = ['isolated-real-preview'];
        dragPreviewState.rng.vassalSeed += 1;
        c.mutantRaw = JSON.stringify(dragPreviewState);
        c.mutations++;
      }
      const rawBefore = JSON.stringify({cursorState, dragPreviewState, timeline});
`;
  let replacement=before.replace(start,start+prefix).replace('      return {\n','      const inspected = {\n');
  replacement=replacement.slice(0,-7)+`      const rawAfter = JSON.stringify({cursorState, dragPreviewState, timeline});
      if (rawBefore !== rawAfter) throw new Error('inspection mutated raw retained state');
      c.purity.push({before: rawBefore, after: rawAfter});
      return inspected;
    },
`;
  let mutant=original.slice(0,from)+replacement+original.slice(to);
  const restoreStart='  function restore(stateData, baseSec, targetSec = baseSec) {';
  assert.equal(mutant.split(restoreStart).length,2,'unique real restorer');
  const restoreReplacement=restoreStart+`
    const c = globalThis.__HC_PREVIEW_STATE_CONTROL__;
    if (c?.token === '${controlToken}' && baseSec === 16 && (targetSec === 16 || targetSec === 17)) {
      c.sources.push({baseSec, targetSec, raw: JSON.stringify(stateData)});
    }
`;
  mutant=mutant.replace(restoreStart,restoreReplacement);
  return {mutant,identity:{comparisonEligible:false,scope:'one isolated app response + disposable Chromium context; real installed preview body/RNG only; config untouched',
    originalSha256:digest(original),mutantSha256:digest(mutant),inspector:{original:before,replacement},restore:{original:restoreStart,replacement:restoreReplacement}}};
}
