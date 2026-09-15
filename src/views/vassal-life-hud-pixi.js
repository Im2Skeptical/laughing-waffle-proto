import { VASSAL_LIFE_TUNING } from "../defs/gamepieces/vassal-life-map-defs.js";
import {
  getVassalAge,
  getVassalStatsPresentation,
} from "../model/vassal-life-map.js";
import { getRegionReference } from "../model/world-state.js";
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";
import { createVassalPortraitView } from "./vassal-portrait-pixi.js";
import { addResourceAmount } from "./resource-cost-pixi.js";
import { getArtRevision } from "./chronicle-art.js";

const YEAR_STRIP = Object.freeze({ x: 590, y: 16, width: 1108, height: 54 });
export const LIFE_HUD = Object.freeze({
  x: YEAR_STRIP.x - 8,
  y: YEAR_STRIP.y + YEAR_STRIP.height - 6,
  barHeight: 58,
  portraitSize: 84,
  width: 952,
  chipWidth: 126,
  chipHeight: 42,
});

const TWEEN_MS = 700;

function signedDelta(value) {
  if (!Number.isFinite(value) || value === 0) return null;
  return `${value > 0 ? "+" : ""}${value}`;
}

function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}

function lerp(from, to, t) {
  return from + (to - from) * t;
}

export function createVassalLifeHudView({
  layer, getPresentation, getDeltas, getCountUp, isVisible, tooltipView,
} = {}) {
  const root = new PIXI.Container();
  root.zIndex = 188;
  root.eventMode = "static";
  layer?.addChild(root);
  let signature = "";
  let pinnedStatId = null;
  let tween = null;

  function hideStatTooltip() {
    pinnedStatId = null;
    tooltipView?.hide?.();
  }

  function showStatTooltip(stat, target) {
    tooltipView?.show?.({
      title: `${stat.label} ${stat.value}`,
      scale: 2,
      lines: [
        stat.powerLabel,
        stat.formula,
        Number.isFinite(stat.pointsToCap)
          ? stat.pointsToCap > 0
            ? `${stat.pointsToCap} ${stat.pointsToCap === 1 ? "point" : "points"} to the discount cap.`
            : "Discount cap reached."
          : "This income has no cap.",
      ],
    }, target.getBounds());
  }

  function displayedValues(vassal, presentation, countUp) {
    const liveAge = getVassalAge(presentation.state, vassal, presentation.profileSec);
    const livePrestige = vassal.prestige ?? 0;
    const liveExp = Math.max(0, Math.floor(vassal.developmentProgress ?? 0));
    if (!countUp || tween == null) {
      return { age: liveAge, prestige: livePrestige, exp: liveExp, flashing: false };
    }
    const t = easeOut(Math.min(1, (performance.now() - tween.startedAt) / TWEEN_MS));
    return {
      age: Math.round(lerp(countUp.ageBefore ?? liveAge, countUp.ageAfter ?? liveAge, t)),
      prestige: Math.round(lerp(countUp.prestigeBefore ?? livePrestige, countUp.prestigeAfter ?? livePrestige, t)),
      exp: Math.round(lerp(countUp.expBefore ?? liveExp, countUp.expAfter ?? liveExp, t)),
      flashing: t < 1,
    };
  }

  function render(force = false) {
    const visible = isVisible?.() === true;
    root.visible = visible;
    root.eventMode = visible ? "static" : "none";
    if (!visible) {
      if (root.children.length > 0) {
        clearChildren(root);
        hideStatTooltip();
      }
      signature = "";
      tween = null;
      return;
    }
    const presentation = getPresentation?.() ?? {};
    const vassal = presentation.profileVassal ?? presentation.vassal;
    const deltas = getDeltas?.() ?? null;
    const countUp = getCountUp?.() ?? null;
    if (countUp?.vassalId && countUp.vassalId !== tween?.vassalId) {
      tween = { vassalId: countUp.vassalId, startedAt: performance.now() };
    }
    if (!countUp) tween = null;
    const shown = vassal ? displayedValues(vassal, presentation, countUp) : null;
    const nextSignature = getArtRevision() + JSON.stringify({
      vassalId: vassal?.vassalId ?? null,
      prestige: vassal?.prestige ?? null,
      stats: vassal?.stats ?? null,
      exp: vassal?.developmentProgress ?? null,
      location: vassal?.locationRegionId ?? null,
      profileSec: presentation.profileSec ?? null,
      pinnedStatId,
      deltas,
      countUpId: countUp?.vassalId ?? null,
      shown,
    });
    if (!force && nextSignature === signature) return;
    signature = nextSignature;
    clearChildren(root);
    if (!vassal || !shown) return;

    const hudWidth = LIFE_HUD.width;
    const hudX = LIFE_HUD.x;
    const hudY = LIFE_HUD.y;
    const barX = hudX + 38;
    const barY = hudY + (LIFE_HUD.portraitSize - LIFE_HUD.barHeight) / 2;
    const barWidth = hudWidth - 38;
    const hud = new PIXI.Graphics();
    roundedRect(hud, barX, barY, barWidth, LIFE_HUD.barHeight, 10, 0x2b332e, PALETTE.accent, 1.5);
    const portrait = createVassalPortraitView(vassal.portrait, {
      size: LIFE_HUD.portraitSize, borderColor: PALETTE.accent, shape: "circle",
    });
    portrait.position.set(hudX, hudY);
    const location = String(
      getRegionReference(presentation.state, vassal.locationRegionId) ?? vassal.locationRegionId ?? ""
    );
    const contentX = barX + 56;
    root.addChild(hud, portrait,
      createText(`AGE ${shown.age}`, {
        ...TEXT_STYLES.chip, fontSize: 13, fill: PALETTE.textMuted,
      }, contentX, barY + 6));
    addResourceAmount(root, "prestige", shown.prestige, {
      x: contentX, y: barY + 26, fontSize: 22, iconSize: 24,
      fill: shown.flashing ? PALETTE.green : PALETTE.accent,
    });
    const prestigeDelta = signedDelta(deltas?.prestige);
    if (prestigeDelta) {
      root.addChild(createText(prestigeDelta, {
        ...TEXT_STYLES.chip, fontSize: 13,
        fill: deltas.prestige > 0 ? PALETTE.green : PALETTE.red,
      }, contentX + 92, barY + 30));
    }

    const expX = contentX + 118;
    root.addChild(
      createText("EXP", {
        ...TEXT_STYLES.chip, fontSize: 13, fill: PALETTE.textMuted,
      }, expX, barY + 6),
      createText(`${shown.exp} / ${VASSAL_LIFE_TUNING.developmentThreshold}`, {
        ...TEXT_STYLES.header, fontSize: 20,
        fill: shown.flashing ? PALETTE.green : PALETTE.text,
      }, expX, barY + 26)
    );
    const expDelta = signedDelta(deltas?.development);
    if (expDelta) {
      root.addChild(createText(expDelta, {
        ...TEXT_STYLES.chip, fontSize: 13, fill: PALETTE.green,
      }, expX + 78, barY + 30));
    }

    const chipStart = contentX + 214;
    getVassalStatsPresentation(vassal).forEach((stat, index) => {
      const chip = new PIXI.Container();
      chip.position.set(chipStart + index * (LIFE_HUD.chipWidth + 8), barY + 8);
      chip.eventMode = "static";
      chip.cursor = "help";
      chip.hitArea = new PIXI.Rectangle(0, 0, LIFE_HUD.chipWidth, LIFE_HUD.chipHeight);
      chip.on("pointerdown", (event) => event?.stopPropagation?.());
      chip.on("pointerover", () => {
        if (!pinnedStatId) showStatTooltip(stat, chip);
      });
      chip.on("pointerout", () => {
        if (!pinnedStatId) tooltipView?.hide?.();
      });
      chip.on("pointertap", (event) => {
        event?.stopPropagation?.();
        if (pinnedStatId === stat.statId) hideStatTooltip();
        else {
          pinnedStatId = stat.statId;
          showStatTooltip(stat, chip);
        }
      });
      const chipBg = new PIXI.Graphics();
      roundedRect(chipBg, 0, 0, LIFE_HUD.chipWidth, LIFE_HUD.chipHeight, 6, 0x39413b,
        pinnedStatId === stat.statId ? PALETTE.accent : PALETTE.stroke,
        pinnedStatId === stat.statId ? 2 : 1);
      const delta = signedDelta(deltas?.stats?.[stat.statId]);
      chip.addChild(chipBg,
        createText(stat.label.toUpperCase(), {
          ...TEXT_STYLES.chip, fontSize: 11, fill: PALETTE.textMuted,
        }, 8, 4),
        createText(String(stat.value), {
          ...TEXT_STYLES.header, fontSize: 20, fill: PALETTE.text,
        }, 8, 20));
      if (delta) {
        chip.addChild(createText(delta, {
          ...TEXT_STYLES.chip, fontSize: 13,
          fill: deltas.stats[stat.statId] > 0 ? PALETTE.green : PALETTE.red,
        }, LIFE_HUD.chipWidth - 8, 22, 1, 0));
      }
      root.addChild(chip);
    });

    const locationRight = barX + barWidth - 18;
    root.addChild(
      createText("LOCATION", {
        ...TEXT_STYLES.chip, fontSize: 12, fill: PALETTE.textMuted,
      }, locationRight, barY + 8, 1, 0),
      createText(location, {
        ...TEXT_STYLES.header, fontSize: 20, fill: PALETTE.text,
      }, locationRight, barY + 26, 1, 0)
    );
  }

  return {
    init: () => render(true),
    update: () => render(),
    refresh: () => render(true),
    getSemanticSnapshot: () => ({
      visible: root.visible === true,
      prestigeDelta: getDeltas?.()?.prestige ?? 0,
    }),
  };
}
