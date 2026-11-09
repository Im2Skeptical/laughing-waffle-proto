import { getWorldDefinition, getRegionReference } from '../src/model/world-state.js';
import { compactRegionName } from '../src/views/region-label.js';
// Browser fixture shared by the focused probe and collaborative preview.
import { createNewGameState } from '../src/model/new-game.js';
import { getVassalCandidatePool, selectLifeMapVassal, getCurrentLifeMapVassal } from '../src/model/vassal-life-map.js';
import { serializeGameState } from '../src/model/state.js';
import { createVassalLifeHudView } from '../src/views/vassal-life-hud-pixi.js';
import { createVassalLevelUpModalView } from '../src/views/vassal-level-up-modal-pixi.js';
import { prepareChronicleArt } from '../src/views/chronicle-art.js';

export async function checkVassalStatViews() {
  const app = new PIXI.Application({ width: 2424, height: 1080, backgroundColor: 0x171713 });
  app.view.style.width = '100vw'; app.view.style.height = 'auto';
  document.body.replaceChildren(app.view);
  await prepareChronicleArt(app.renderer);
  const state = createNewGameState(131);
  const pool = getVassalCandidatePool(state);
  selectLifeMapVassal(state, 0, pool.expectedPoolHash);
  const vassal = getCurrentLifeMapVassal(state);
  vassal.stats = { cunning: 4, wisdom: 2, effectiveness: 1, intelligence: 3 };
  vassal.developmentChoiceQueue = [{ choiceId: 'stat-regression', offeredStatIds: ['cunning', 'intelligence', 'wisdom'] }];
  const presentation = () => ({ state, vassal });
  const tips = [];
  const tooltipView = { show: spec => tips.push(spec), hide() {}, pin() {} };
  const level = createVassalLevelUpModalView({ app, layer: app.stage, getPresentation: presentation,
    isLifegraphVisible: () => true, isRecapOpen: () => false, tooltipView });
  const hudLayer = new PIXI.Container(); app.stage.addChild(hudLayer);
  const hud = createVassalLifeHudView({ app, layer: hudLayer, getPresentation: presentation,
    isVisible: () => true, tooltipView, getLevelUp: level.getHudState, getDeltas: level.getHudDeltas });
  const checks = [];
  const expect = (actual, expected, description) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${description}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };
  for (const [classId, founderClassId, labels, icons] of [
    [null, 'scholar', ['Ingenuity', 'Intelligence'], ['stock-knowledge', 'stock-instrument']],
    [null, 'warrior', ['Cunning', 'Prowess'], ['prestige', 'stock-arms']],
    ['scholar', null, ['Ingenuity', 'Intelligence'], ['stock-knowledge', 'stock-instrument']],
    ['warrior', null, ['Cunning', 'Prowess'], ['prestige', 'stock-arms']],
    [null, null, ['Cunning', 'Intelligence'], ['prestige', 'stock-instrument']],
    [null, 'scholar', ['Ingenuity', 'Intelligence'], ['stock-knowledge', 'stock-instrument']],
  ]) {
    // Only identity changes. Same Vassal id, stats, queue, and equipment detect
    // stale render caches that ordinary numeric-stat tests cannot catch.
    Object.assign(vassal, { classId, founderClassId });
    const before = JSON.stringify(serializeGameState(state));
    level.update(); hud.update();
    const hs = hud.getSemanticSnapshot(), ls = level.getSemanticSnapshot();
    for (const [index, slot] of ['cunning', 'intelligence'].entries()) {
      for (const [surface, stats] of [['HUD', hs.stats], ['level-up', ls.stats]]) {
        const stat = stats.find(entry => entry.statId === slot);
        expect([stat?.label, stat?.iconId], [labels[index], icons[index]], `${surface} ${classId ?? founderClassId ?? 'unclassed'} ${slot}`);
      }
      const descendants = node => [node, ...(node.children ?? []).flatMap(descendants)];
      const card = descendants(app.stage.children[0]).find(child => child.statId === slot);
      const headings = card.children.filter(child => child instanceof PIXI.Text).map(child => child.text);
      expect(headings.includes(labels[index].toUpperCase()), true, 'actual painted level-up heading');
      card.emit('pointerover', { pointerType: 'mouse' });
      expect(tips.at(-1)?.title, labels[index], 'level-up floating tooltip');
      card.emit('pointerout', {});
    }
    expect(JSON.stringify(serializeGameState(state)), before, 'rendering leaves simulation state and RNG untouched');
    checks.push(`${classId ?? founderClassId ?? 'unclassed'}: labels, icons, heading, tooltip, cache refresh, unchanged state/RNG`);
  }
  let expanded = false;
  for (const region of getWorldDefinition(state).regions) {
    Object.assign(vassal, {locationRegionId:region.id, classId:'scholar',
      commission:{label:'Install a Practice: Construction',progress:998,amount:999,prestige:60}});
    const before = JSON.stringify(serializeGameState(state));
    hud.refresh();
    const banners = hud.getSemanticSnapshot().banners;
    const location = banners.find(banner => banner.kind === 'location');
    expect(location.text, compactRegionName(getRegionReference(state,region.id)), 'banner abbreviates direction without truncation');
    expect(location.fullText, getRegionReference(state,region.id), 'tooltip retains complete location');
    for (const banner of banners) {
      expect(banner.textWidth <= banner.width - 30 + .01, true, 'banner contains complete measured text');
      expect(banner.x >= banner.pendantRight + 16 - .01, true, 'banners clear Prestige pendant');
      expect(banner.right <= 1690 + .01, true, 'banners stay within crest edge');
      if (banner.width > 190) expanded = true;
    }
    const sorted = [...banners].sort((a,b)=>a.x-b.x);
    expect(sorted[0].right + 8 <= sorted[1].x + .01, true, 'banners do not overlap');
    expect(JSON.stringify(serializeGameState(state)), before, 'banner sizing leaves state and RNG unchanged');
  }
  const destination = getRegionReference(state,vassal.locationRegionId);
  vassal.commission = {label:`Move to ${destination}`,locationLabel:destination,prestige:40};
  const beforeTravelBanner = JSON.stringify(serializeGameState(state));
  hud.refresh();
  expect(hud.getSemanticSnapshot().banners.find(banner=>banner.kind==='task').text, `Move to ${compactRegionName(destination)}`, 'travel commission also abbreviates its destination');
  expect(JSON.stringify(serializeGameState(state)),beforeTravelBanner,'commission display leaves saved labels unchanged');
  expect(expanded,true,'long banners expand past the old width cap');
  checks.push('all regional names: compact compass, growing banners, complete text, clear pendant, unchanged state/RNG');
  level.resize(); hud.refresh();
  app.ticker.add(() => { level.update(); hud.update(); });
  return { checks, hud: hud.getSemanticSnapshot().stats, level: level.getSemanticSnapshot().stats };
}
