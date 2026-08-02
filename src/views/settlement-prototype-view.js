import {
  getDetailedSettlementViewModel,
  getDetailedVassalPrestige,
  getElderMortalityRate,
} from "../model/detailed-settlements.js";
import { getRegionDefinition } from "../model/world-state.js";
import { getGameSetting } from "../model/game-config.js";
import {
  addCivilizationSurvivalStrip,
  getCivilizationSurvivalViewModel,
} from "./civilization-survival-hud.js";
import { clearChildren, createText, createWrappedText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";

const BODY = Object.freeze({ x: 48, y: 78, width: 2328, height: 756 });
export const SETTLEMENT_HEADER_LAYOUT = Object.freeze({
  survival: Object.freeze({ x: 590, y: 9, width: 850, height: 54 }),
  overview: Object.freeze({ x: 1460, y: 14, width: 150, height: 44 }),
  demographics: Object.freeze({ x: 1620, y: 14, width: 190, height: 44 }),
  map: Object.freeze({ x: 1820, y: 14, width: 126, height: 44 }),
  utilityReserve: Object.freeze({ x: 1960, y: 0, width: 464, height: 70 }),
});

function addButton(parent, rect, label, selected, onPress) {
  const root = new PIXI.Container();
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, 0, 0, rect.width, rect.height, 7,
    selected ? PALETTE.accent : PALETTE.panel, PALETTE.stroke, 2);
  root.addChild(gfx, createText(label, {
    ...TEXT_STYLES.title,
    fill: selected ? 0x2b2825 : PALETTE.text,
  }, rect.width / 2, rect.height / 2, 0.5, 0.5));
  root.position.set(rect.x, rect.y);
  root.eventMode = "static";
  root.cursor = "pointer";
  root.on("pointerdown", onPress);
  parent.addChild(root);
}

function panel(parent, rect, title) {
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, rect.x, rect.y, rect.width, rect.height, 8, PALETTE.panelSoft, PALETTE.stroke, 2);
  parent.addChild(gfx, createText(title, TEXT_STYLES.title, rect.x + 18, rect.y + 15));
}

function formatPracticeNumber(value) {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return Number.isInteger(safe) ? String(safe) : String(Math.round(safe * 100) / 100);
}

function getPracticeTimingLabel(activation) {
  if (activation?.type === "season") {
    const season = activation.seasonKeys?.[0];
    return season ? `Each ${season.replace(/^./, (letter) => letter.toUpperCase())}` : "Each season";
  }
  if (activation?.type === "newMoon") return "Each Moon";
  return "Passive";
}

function getPracticeResultLabel(practiceId, value) {
  const formatted = formatPracticeNumber(value);
  if (practiceId === "cultivate") return `Effect  +${formatted} food`;
  if (practiceId === "administrate") return `Cap  ${formatted} food`;
  if (practiceId === "preserve") return `Effect  ${formatted}% less rot`;
  return `Effect  ${formatted}`;
}

function drawPracticeSlotCard(parent, rect, entry, slotIndex) {
  const filled = Boolean(entry?.practiceId);
  const evaluation = entry?.evaluation ?? null;
  const scaled = evaluation?.effects?.find((effect) => effect.scaledValue)?.scaledValue ?? null;
  const card = new PIXI.Container();
  card.position.set(rect.x, rect.y);
  const gfx = new PIXI.Graphics();
  roundedRect(
    gfx,
    0,
    0,
    rect.width,
    rect.height,
    14,
    filled ? PALETTE.card : PALETTE.slot,
    evaluation?.activation?.type === "passive" ? PALETTE.passiveBorder : PALETTE.stroke,
    filled ? 3 : 2
  );
  card.addChild(gfx);
  card.addChild(createText(
    `${slotIndex + 1}. ${filled ? entry.label : "Empty"}`,
    { ...TEXT_STYLES.title, fontSize: 16, wordWrap: true, wordWrapWidth: rect.width - 20 },
    10,
    12
  ));
  if (!filled) {
    card.addChild(createText(
      "Available practice slot",
      { ...TEXT_STYLES.body, fontSize: 12, fill: PALETTE.textMuted },
      10,
      54
    ));
    parent.addChild(card);
    return;
  }

  const badge = new PIXI.Graphics();
  roundedRect(
    badge,
    10,
    48,
    rect.width - 20,
    24,
    12,
    PALETTE.chip,
    evaluation.activation?.type === "passive" ? PALETTE.passiveBorder : PALETTE.accent,
    1
  );
  card.addChild(
    badge,
    createText(
      getPracticeTimingLabel(evaluation.activation),
      { ...TEXT_STYLES.chip, fontSize: 11 },
      rect.width / 2,
      60,
      0.5,
      0.5
    ),
    createText(
      `Workers ${entry.workers.tokens.length}/${evaluation.workerCapacity}`,
      { ...TEXT_STYLES.body, fontSize: 12 },
      10,
      86
    ),
    createText(
      `${formatPracticeNumber(entry.workers.effectiveWorkers)} effective`,
      { ...TEXT_STYLES.body, fontSize: 11, fill: PALETTE.textMuted },
      10,
      106
    ),
    createWrappedText(
      evaluation.rule,
      { ...TEXT_STYLES.body, fontSize: 11, lineHeight: 14, fill: PALETTE.textMuted },
      10,
      132,
      rect.width - 20
    )
  );
  if (scaled) {
    const mathY = rect.height - 82;
    card.addChild(
      createText(
        `Base  ${formatPracticeNumber(scaled.baseAmount)} × ${formatPracticeNumber(scaled.evaluatorScore)} = ${formatPracticeNumber(scaled.baseValue)}`,
        { ...TEXT_STYLES.body, fontSize: 11 },
        10,
        mathY
      ),
      createText(
        `Workers  ×${formatPracticeNumber(scaled.workerMultiplier)}`,
        { ...TEXT_STYLES.body, fontSize: 11 },
        10,
        mathY + 21
      ),
      createText(
        getPracticeResultLabel(entry.practiceId, scaled.effectiveValue),
        { ...TEXT_STYLES.title, fontSize: 12, fill: PALETTE.accent },
        10,
        mathY + 45
      )
    );
  } else if (entry.work) {
    card.addChild(createText(
      `Work  ${formatPracticeNumber(entry.work)}`,
      { ...TEXT_STYLES.title, fontSize: 12, fill: PALETTE.accent },
      10,
      rect.height - 36
    ));
  }
  parent.addChild(card);
}

function faithRates(state, classState) {
  const faith = String(classState?.faith?.tier ?? "gold")
    .replace(/^./, (letter) => letter.toUpperCase());
  const birth = getGameSetting(state, `birthRate${faith}`) * 100;
  return `Birth ${birth}% · child→adult ${getGameSetting(
    state,
    "childToAdultRate"
  ) * 100}% · adult→elder ${getGameSetting(state, "adultToElderRate") * 100}%`;
}

export function createSettlementPrototypeView({
  layer,
  getState,
  getSelectedRegionId,
  getCivilizationLossInfo,
  onReturnToMap,
}) {
  const root = new PIXI.Container();
  layer.addChild(root);
  let activeTab = "overview";
  let lastSignature = "";
  let semanticSnapshot = null;

  function render(force = false) {
    if (!root.visible) return;
    const state = getState?.();
    const regionId = getSelectedRegionId?.() ?? state?.civilization?.capitalRegionId;
    const vm = getDetailedSettlementViewModel(state, regionId);
    if (!vm) return;
    const civilizationLossInfo = getCivilizationLossInfo?.() ?? null;
    const survivalTracker = getCivilizationSurvivalViewModel(
      state,
      civilizationLossInfo
    );
    const signature = JSON.stringify({ tSec: state.tSec, regionId, activeTab, vm,
      lineage: state.civilization.vassalLineage, chaos: state.civilization.chaos,
      gameConfig: state.gameConfig, survivalTracker });
    if (!force && signature === lastSignature) return;
    lastSignature = signature;
    clearChildren(root);

    const bg = new PIXI.Graphics();
    bg.beginFill(0x6f756b).drawRect(0, 0, 2424, 860).endFill();
    root.addChild(bg);
    const regionDef = getRegionDefinition(state, regionId);
    root.addChild(createText(`${vm.name} · ${regionDef?.name ?? regionId}`,
      { ...TEXT_STYLES.header, fontSize: 28 }, 48, 35, 0, 0.5));
    addCivilizationSurvivalStrip(root, {
      state,
      civilizationLossInfo,
      rect: SETTLEMENT_HEADER_LAYOUT.survival,
    });
    addButton(root, SETTLEMENT_HEADER_LAYOUT.overview, "Overview",
      activeTab === "overview", () => { activeTab = "overview"; lastSignature = ""; });
    addButton(root, SETTLEMENT_HEADER_LAYOUT.demographics, "Demographics",
      activeTab === "demographics", () => { activeTab = "demographics"; lastSignature = ""; });
    addButton(root, SETTLEMENT_HEADER_LAYOUT.map, "Map", false, onReturnToMap);

    if (activeTab === "overview") {
      const foodRect = { x: BODY.x, y: BODY.y, width: 540, height: 260 };
      const practiceRect = { x: 606, y: BODY.y, width: 920, height: 430 };
      const orderRect = { x: 1544, y: BODY.y, width: 832, height: 430 };
      const structureRect = { x: BODY.x, y: 356, width: 540, height: 410 };
      panel(root, foodRect, "Local food and population");
      panel(root, practiceRect, "Five practice slots");
      panel(root, orderRect, "Elder Order");
      panel(root, structureRect, "Regional structure space");
      root.addChild(
        createText(`Stored food  ${vm.storedFood} / ${vm.storedFoodCapacity}`, TEXT_STYLES.body,
          foodRect.x + 18, foodRect.y + 64),
        createText(`Loose food  ${vm.looseFood}`, TEXT_STYLES.body, foodRect.x + 18, foodRect.y + 100),
        createText(`Meal demand  ${vm.population.mealDemand}`, TEXT_STYLES.body, foodRect.x + 18, foodRect.y + 136),
        createText(`Population  ${vm.population.total} / ${vm.population.housingCapacity} housing`,
          TEXT_STYLES.body, foodRect.x + 18, foodRect.y + 172),
        createText(`Last meal  ${vm.lastMeal ? `${vm.lastMeal.consumed}/${vm.lastMeal.demand}` : "none"}`,
          TEXT_STYLES.body, foodRect.x + 18, foodRect.y + 208)
      );
      const practiceGap = 10;
      const practiceCardWidth = Math.floor(
        (practiceRect.width - 36 - practiceGap * 4) / 5
      );
      vm.practices.forEach((entry, index) => drawPracticeSlotCard(root, {
        x: practiceRect.x + 18 + index * (practiceCardWidth + practiceGap),
        y: practiceRect.y + 56,
        width: practiceCardWidth,
        height: practiceRect.height - 70,
      }, entry, index));
      const order = vm.elderOrder;
      root.addChild(
        createText(`Worker policy: one token per ${getGameSetting(
          state,
          "populationPerToken"
        )} adults + elders, per class`,
          TEXT_STYLES.body, orderRect.x + 18, orderRect.y + 60),
        createText(`Elders: ${order.count} · Ages ${order.ages.join(", ") || "none"}`,
          TEXT_STYLES.body, orderRect.x + 18, orderRect.y + 102),
        createText(`Prestige: ${order.totalPrestige} total / ${order.count || 0}`,
          TEXT_STYLES.body, orderRect.x + 18, orderRect.y + 144),
        createText(`Resistance = ${order.averagePrestige} average + ${order.coordinationResistance} coordination`,
          TEXT_STYLES.body, orderRect.x + 18, orderRect.y + 186),
        createText(`Local resistance: ${order.resistance}`,
          { ...TEXT_STYLES.header, fill: PALETTE.accent }, orderRect.x + 18, orderRect.y + 232)
      );
      const vassal = state.civilization.vassalLineage.currentVassal;
      if (vassal?.targetRegionId === regionId) {
        root.addChild(createText(
          `Vassal prestige ${getDetailedVassalPrestige(state, vassal)} · target here`,
          TEXT_STYLES.title, orderRect.x + 18, orderRect.y + 286));
        vassal.interventions.forEach((entry, index) => {
          root.addChild(createText(
            `${index + 1}. ${entry.practiceId} · ${entry.requiredPrestige} · ${entry.status}`,
            TEXT_STYLES.body, orderRect.x + 18, orderRect.y + 326 + index * 28));
        });
      } else {
        root.addChild(createText("No current vassal targets this Order.",
          { ...TEXT_STYLES.body, fill: PALETTE.textMuted }, orderRect.x + 18, orderRect.y + 286));
      }
      root.addChild(createText(
        `${vm.usedStructureCapacity} used / ${vm.structureCapacity} available`,
        TEXT_STYLES.header, structureRect.x + 18, structureRect.y + 60));
      vm.structures.forEach((slot, index) => root.addChild(createText(
        `${index + 1}. ${slot?.structureId ?? "Empty"}`,
        TEXT_STYLES.body, structureRect.x + 18, structureRect.y + 112 + index * 42)));
    } else {
      const villager = vm.population.byClass.villager;
      const stranger = vm.population.byClass.stranger;
      const site = state.world.sites.find((entry) => entry.regionId === regionId).detailedState;
      const left = { x: BODY.x, y: BODY.y, width: 1128, height: 688 };
      const right = { x: 1194, y: BODY.y, width: 1182, height: 688 };
      panel(root, left, "Cohorts, housing, and meals");
      panel(root, right, "Annual probabilities and previous result");
      const lines = [
        `Villagers: ${villager.children} children · ${villager.adults} adults · ${villager.elders} elders`,
        `Villager elder ages: ${vm.elderOrder.ages.join(", ") || "none"}`,
        `Strangers: ${stranger.children} children · ${stranger.adults} adults · ${stranger.elders} elders`,
        `Housing: ${vm.population.total} / ${vm.population.housingCapacity}${vm.population.total > vm.population.housingCapacity ? " · OVER-HOUSED" : ""}`,
        `Meal: ${vm.lastMeal ? `${vm.lastMeal.consumed}/${vm.lastMeal.demand} (${Math.round(vm.lastMeal.ratio * 100)}%)` : "not yet resolved"}`,
        `Loose food is eaten first; remote food requires Administration.`,
      ];
      lines.forEach((line, index) => root.addChild(createText(line, TEXT_STYLES.body,
        left.x + 18, left.y + 64 + index * 44)));
      let y = right.y + 64;
      for (const classId of ["villager", "stranger"]) {
        const classState = site.populationByClass[classId];
        const faith = String(classState.faith.tier)
          .replace(/^./, (letter) => letter.toUpperCase());
        const birthRate = getGameSetting(state, `birthRate${faith}`);
        const expectedElderDeaths = (classState.eldersByAge ?? []).reduce(
          (sum, cohort) =>
            sum + cohort.count * getElderMortalityRate(cohort.age + 1, state),
          0
        );
        root.addChild(
          createText(classId.toUpperCase(), TEXT_STYLES.title, right.x + 18, y),
          createText(`${faithRates(state, classState)} · Faith ${classState.faith.tier}`,
            TEXT_STYLES.body, right.x + 18, y + 34),
          createText(`Happiness ${classState.happiness.status} · full ${classState.happiness.fullFeedStreak}/${getGameSetting(
            state,
            "fullFeedStreakForIncrease"
          )} · missed ${classState.happiness.missedFeedStreak}/${getGameSetting(
            state,
            "missedFeedStreakForStarvation"
          )}`,
            TEXT_STYLES.body, right.x + 18, y + 66),
          createText(
            `Expected: ${(
              classState.adults * birthRate
            ).toFixed(1)} births · ${(classState.children * getGameSetting(
              state,
              "childToAdultRate"
            )).toFixed(1)} adults · ${(classState.adults * getGameSetting(
              state,
              "adultToElderRate"
            )).toFixed(1)} elders · ${expectedElderDeaths.toFixed(2)} elder deaths`,
            { ...TEXT_STYLES.body, fontSize: 14, fill: PALETTE.textMuted },
            right.x + 18,
            y + 94
          )
        );
        y += 150;
      }
      root.addChild(createWrappedText(
        `Elder mortality after aging: ${getGameSetting(state, "elderMortalityThrough49") * 100}% through 49; ${getGameSetting(state, "elderMortality50To54") * 100}% at 50–54; ${getGameSetting(state, "elderMortality55To59") * 100}% at 55–59; ${getGameSetting(state, "elderMortality60To64") * 100}% at 60–64; ${getGameSetting(state, "elderMortality65To69") * 100}% at 65–69; ${getGameSetting(state, "elderMortality70To74") * 100}% at 70–74; ${getGameSetting(state, "elderMortality75Plus") * 100}% at 75+.`,
        TEXT_STYLES.body, right.x + 18, y, right.width - 36));
      y += 90;
      root.addChild(createWrappedText(
        site.lastAnnualResult
          ? `Previous annual result (Year ${site.lastAnnualResult.year}): ${JSON.stringify(site.lastAnnualResult.byClass)}`
          : "Previous annual result: none.",
        { ...TEXT_STYLES.body, fill: PALETTE.textMuted }, right.x + 18, y, right.width - 36));
    }

    semanticSnapshot = {
      visible: root.visible === true,
      activeTab,
      regionId,
      calendar: {
        seasonKey: survivalTracker.seasonKey,
        year: survivalTracker.year,
        label: survivalTracker.calendarLabel,
      },
      survivalTracker,
      headerControls: SETTLEMENT_HEADER_LAYOUT,
      overview: vm,
      demographics: {
        population: vm.population,
        lastMeal: vm.lastMeal,
        lastAnnualResult: vm.lastAnnualResult,
      },
      elderOrder: vm.elderOrder,
    };
  }

  return {
    init: () => render(true),
    refresh: () => { lastSignature = ""; render(true); },
    update: () => render(),
    setVisible: (visible) => { root.visible = visible === true; if (root.visible) render(true); },
    getScreenRect: () => root.visible ? root.getBounds?.() ?? null : null,
    getSemanticSnapshot: () => semanticSnapshot,
    destroy: () => {
      clearChildren(root);
      root.removeFromParent();
      root.destroy({ children: true });
    },
  };
}
