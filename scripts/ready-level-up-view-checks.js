import { createNewGameState } from '../src/model/new-game.js';
import { getVassalCandidatePool, selectLifeMapVassal, getCurrentLifeMapVassal } from '../src/model/vassal-life-map.js';
import { serializeGameState } from '../src/model/state.js';
import { createVassalLevelUpModalView } from '../src/views/vassal-level-up-modal-pixi.js';
import { createTooltipView } from '../src/views/tooltip-pixi.js';
import { prepareChronicleArt } from '../src/views/chronicle-art.js';

// Uses the shipped views and input handlers; also callable in the shared preview.
export async function readyLevelUpFixture() {
  const app = new PIXI.Application({ width: 2424, height: 1080, backgroundColor: 0x171713 });
  app.view.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:auto;display:block;z-index:2147483647';
  document.body.replaceChildren(app.view);
  await prepareChronicleArt(app.renderer);
  const state = createNewGameState(131);
  selectLifeMapVassal(state, 0, getVassalCandidatePool(state).expectedPoolHash);
  const vassal = getCurrentLifeMapVassal(state);
  vassal.stats = { cunning: 0, wisdom: 0, effectiveness: 0, intelligence: 0 };
  vassal.developmentChoiceQueue = [{ choiceId: 'ready-level-up', offeredStatIds: ['intelligence', 'wisdom', 'effectiveness'] }];
  const before = JSON.stringify(serializeGameState(state));
  const layer = new PIXI.Container(), tips = new PIXI.Container();
  app.stage.addChild(layer, tips);
  const tooltip = createTooltipView({ app, layer: tips });
  let chosen = null;
  const view = createVassalLevelUpModalView({ app, layer, tooltipView: tooltip,
    getPresentation: () => ({ state, vassal }), isLifegraphVisible: () => true,
    isRecapOpen: () => false, onChoose: (choice, stat) => { chosen = [choice, stat]; } });
  view.init();
  app.ticker.add(() => { view.update(); tooltip.update(); });
  const descendants = node => [node, ...(node.children ?? []).flatMap(descendants)];
  const cards = () => descendants(layer).filter(node => node.statId && node.statPresentation);
  const rect = node => { const b = node.getBounds(); return { x:b.x,y:b.y,width:b.width,height:b.height }; };
  const overlaps = (a,b) => a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y;
  function inspect(index, touch = false) {
    const card = cards()[index];
    if (touch) { card.emit('pointerdown', {}); card.emit('pointerup', {}); }
    card.emit(touch ? 'pointertap' : 'pointerover', { pointerType: touch ? 'touch' : 'mouse', stopPropagation() {} });
    view.update(); app.renderer.render(app.stage);
    const detail = tooltip.getDebugState().visible ? rect(tooltip.getContainer()) : null;
    return { detail, overlap: detail ? cards().some(c => overlaps(detail, rect(c))) : false,
      coversConfirm:detail?overlaps(detail,view.getSemanticSnapshot().confirmBounds):false,
      snapshot: view.getSemanticSnapshot(), unchanged: JSON.stringify(serializeGameState(state)) === before };
  }
  globalThis.readyLevelUp = { app, view, inspect, cards, getChosen: () => chosen };
  return inspect(0);
}

export async function checkReadyLevelUp() {
  await readyLevelUpFixture();
  for (const touch of [false, true]) for (let index = 0; index < 3; index++) {
    const result = readyLevelUp.inspect(index, touch);
    if (result.overlap) throw new Error(`attribute ${index}: details cover another choice`);
    if(result.coversConfirm)throw new Error(`attribute ${index}: details cover confirmation`);
    if (!result.unchanged) throw new Error('inspection changes serialized state / RNG');
    if (!result.detail || result.detail.x + result.detail.width > 2424) throw new Error('details leave the stage');
    if (touch && result.snapshot.selectedStatId !== result.snapshot.stats[index].statId) throw new Error('touch cannot select another choice');
    if (result.snapshot.confirmCssHeight < 44) throw new Error('confirmation too small for touch');
  }
  return { checks: ['all attribute details clear choices', 'mouse and touch comparison', 'touch selection', 'unchanged state/RNG'] };
}
