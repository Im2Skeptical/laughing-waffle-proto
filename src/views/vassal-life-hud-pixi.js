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

const MAP_RECT = Object.freeze({ x: 58, y: 88, width: 2318, height: 720 });
const HUD_WIDTH = 1040;

function signedDelta(value) {
  if (!Number.isFinite(value) || value === 0) return null;
  return `${value > 0 ? "+" : ""}${value}`;
}

export function createVassalLifeHudView({
  layer, getPresentation, getDeltas, isVisible, tooltipView,
} = {}) {
  const root = new PIXI.Container();
  root.zIndex = 175;
  root.eventMode = "static";
  layer?.addChild(root);
  let signature = "";
  let pinnedStatId = null;

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
      return;
    }
    const presentation = getPresentation?.() ?? {};
    const vassal = presentation.profileVassal ?? presentation.vassal;
    const deltas = getDeltas?.() ?? null;
    const nextSignature = getArtRevision() + JSON.stringify({
      vassalId: vassal?.vassalId ?? null,
      prestige: vassal?.prestige ?? null,
      stats: vassal?.stats ?? null,
      location: vassal?.locationRegionId ?? null,
      profileSec: presentation.profileSec ?? null,
      pinnedStatId,
      deltas,
    });
    if (!force && nextSignature === signature) return;
    signature = nextSignature;
    clearChildren(root);
    if (!vassal) return;

    const hudX = MAP_RECT.x + MAP_RECT.width - HUD_WIDTH - 28;
    const hud = new PIXI.Graphics();
    roundedRect(hud, hudX, MAP_RECT.y + 18, HUD_WIDTH, 78, 10, 0x303833, PALETTE.accent, 1);
    const portrait = createVassalPortraitView(vassal.portrait, { size: 84, borderColor: PALETTE.accent });
    portrait.position.set(hudX - 98, MAP_RECT.y + 15);
    const location = getRegionReference(presentation.state, vassal.locationRegionId) ?? vassal.locationRegionId;
    root.addChild(portrait, hud,
      createText(`VASSAL · AGE ${getVassalAge(presentation.state, vassal, presentation.profileSec)} · ${location}`, {
        ...TEXT_STYLES.chip, fontSize: 18, fill: PALETTE.textMuted,
        wordWrap: true, wordWrapWidth: 235,
      }, hudX + 16, MAP_RECT.y + 31));
    addResourceAmount(root, 'prestige', vassal.prestige, {
      x: hudX + 16, y: MAP_RECT.y + 56, fontSize: 26, iconSize: 32, fill: PALETTE.accent,
    });
    const prestigeDelta = signedDelta(deltas?.prestige);
    if (prestigeDelta) {
      root.addChild(createText(prestigeDelta, {
        ...TEXT_STYLES.chip, fontSize: 16,
        fill: deltas.prestige > 0 ? PALETTE.green : PALETTE.red,
      }, hudX + 118, MAP_RECT.y + 62));
    }
    getVassalStatsPresentation(vassal).forEach((stat, index) => {
      const chip = new PIXI.Container();
      chip.position.set(hudX + 258 + index * 180, MAP_RECT.y + 31);
      chip.eventMode = "static";
      chip.cursor = "help";
      chip.hitArea = new PIXI.Rectangle(0, 0, 164, 50);
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
      roundedRect(chipBg, 0, 0, 164, 50, 7, 0x39413b,
        pinnedStatId === stat.statId ? PALETTE.accent : PALETTE.stroke,
        pinnedStatId === stat.statId ? 2 : 1);
      const delta = signedDelta(deltas?.stats?.[stat.statId]);
      chip.addChild(chipBg,
        createText(stat.label.toUpperCase(), {
          ...TEXT_STYLES.chip, fontSize: 16, fill: PALETTE.textMuted,
        }, 9, 7),
        createText(String(stat.value), {
          ...TEXT_STYLES.header, fontSize: 24, fill: PALETTE.text,
        }, 9, 24));
      if (delta) {
        chip.addChild(createText(delta, {
          ...TEXT_STYLES.chip, fontSize: 15,
          fill: deltas.stats[stat.statId] > 0 ? PALETTE.green : PALETTE.red,
        }, 88, 26));
      }
      root.addChild(chip);
    });
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
