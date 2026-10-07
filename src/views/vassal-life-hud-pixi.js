import { getRetinue } from "../model/detailed-settlements/external-world.js";
import { VASSAL_LIFE_TUNING } from "../defs/gamepieces/vassal-life-map-defs.js";
import {
  getVassalAge,
  getVassalHeirloomInventory,
  getVassalStatsPresentation,
} from "../model/vassal-life-map.js";
import { getRegionReference } from "../model/world-state.js";
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";
import { createVassalPortraitView } from "./vassal-portrait-pixi.js";
import { addResourceAmount } from "./resource-cost-pixi.js";
import { getArtRevision } from "./chronicle-art.js";
import { addHeirloomSlot, addHeirloomArt } from './vassal-heirloom-pixi.js';
import { addInteractionFeedback } from './interaction-feedback.js';

const YEAR_STRIP = Object.freeze({ x: 590, y: 16, width: 1108, height: 54 });
export const LIFE_HUD = Object.freeze({
  x: YEAR_STRIP.x,
  y: YEAR_STRIP.y + YEAR_STRIP.height - 6,
  barHeight: 70,
  portraitSize: 84,
  width: YEAR_STRIP.width,
  chipWidth: 86,
  chipHeight: 54,
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
  layer, getPresentation, getDeltas, getCountUp, isVisible, tooltipView, onOpenHeirlooms,
} = {}) {
  const root = new PIXI.Container();
  root.zIndex = 188;
  root.eventMode = "static";
  layer?.addChild(root);
  let signature = "";
  let buildCount = 0;
  let wasVisible = false;
  let pinnedStatId = null;
  let tween = null;
  let bagControl = null;
  let activeSlots = [];

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

  function render(force = false, preparing = false) {
    const visible = isVisible?.() === true;
    root.visible = visible;
    root.eventMode = visible ? "static" : "none";
    if (!visible && !preparing) {
      if (wasVisible) hideStatTooltip();
      wasVisible = false;
      tween = null;
      return;
    }
    wasVisible = visible;
    const presentation = getPresentation?.() ?? {};
    const vassal = presentation.profileVassal ?? presentation.vassal;
    const deltas = getDeltas?.() ?? null;
    const countUp = getCountUp?.() ?? null;
    if (countUp?.vassalId && countUp.vassalId !== tween?.vassalId) {
      tween = { vassalId: countUp.vassalId, startedAt: performance.now() };
    }
    if (!countUp) tween = null;
    const shown = vassal ? displayedValues(vassal, presentation, countUp) : null;
    const inventory = vassal ? getVassalHeirloomInventory(vassal) : { equipped: [], carry: [] };
    const nextSignature = getArtRevision() + JSON.stringify({
      vassalId: vassal?.vassalId ?? null,
      retinue: getRetinue(presentation.state, vassal),
      prestige: vassal?.prestige ?? null,
      stats: vassal?.stats ?? null,
      exp: vassal?.developmentProgress ?? null,
      location: vassal?.locationRegionId ?? null,
      heirlooms: inventory,
      profileSec: presentation.profileSec ?? null,
      pinnedStatId,
      deltas,
      countUpId: countUp?.vassalId ?? null,
      shown,
    });
    if (!force && nextSignature === signature) return;
    signature = nextSignature;
    buildCount++;
    bagControl = null;
    activeSlots = [];
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
      size: LIFE_HUD.portraitSize, borderColor: PALETTE.accent, shape: "circle", age: shown.age,
    });
    portrait.position.set(hudX, hudY);
    const location = String(
      getRegionReference(presentation.state, vassal.locationRegionId) ?? vassal.locationRegionId ?? ""
    );
    const contentX = barX + 56;
    root.addChild(hud, portrait,
      createText(`AGE ${shown.age}`, {
        ...TEXT_STYLES.chip, fontSize: 24, fill: PALETTE.text,
      }, contentX, barY + 6));
    const prestigePlate = new PIXI.Graphics();
    roundedRect(prestigePlate, hudX - 8, barY + 52, 164, 52, 9, 0x423d2c, PALETTE.accent, 3);
    root.addChild(prestigePlate);
    addResourceAmount(root, "prestige", Math.max(0, shown.prestige + (deltas?.prestige ?? 0)), {
      x: hudX + 4, y: barY + 57, fontSize: 36, iconSize: 40,
      fill: shown.flashing ? PALETTE.green : PALETTE.accent,
    });
    const prestigeDelta = signedDelta(deltas?.prestige);
    if (prestigeDelta) {
      root.addChild(createText(prestigeDelta, {
        ...TEXT_STYLES.chip, fontSize: 13,
        fill: deltas.prestige > 0 ? PALETTE.green : PALETTE.red,
      }, hudX + 146, barY + 67, 1));
    }

    if (vassal.classId === 'warrior') {
      const retinue = getRetinue(presentation.state,vassal);
      root.addChild(createText(`Retinue ${retinue.value}/${retinue.cap} · ${retinue.nextPrestige == null ? 'at cap' : 'next '+retinue.nextPrestige+' Prestige'}`, {...TEXT_STYLES.chip,fontSize:17,fill:PALETTE.accent},hudX+168,barY+76));
    } else if (vassal.commission) root.addChild(createText(`Commission: new ${vassal.commission.objective} (+20 Prestige)`, {...TEXT_STYLES.chip,fontSize:17,fill:PALETTE.accent},hudX+168,barY+76));
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
          ...TEXT_STYLES.chip, fontSize: 12, fill: PALETTE.textMuted,
        }, 8, 4),
        createText(String(stat.value), {
          ...TEXT_STYLES.header, fontSize: 20, fill: PALETTE.text,
        }, 8, 28));
      if (delta) {
        chip.addChild(createText(delta, {
          ...TEXT_STYLES.chip, fontSize: 13,
          fill: deltas.stats[stat.statId] > 0 ? PALETTE.green : PALETTE.red,
        }, LIFE_HUD.chipWidth - 8, 22, 1, 0));
      }
      const heading=chip.children[1];
      if(heading.width>LIFE_HUD.chipWidth-12)heading.scale.x=(LIFE_HUD.chipWidth-12)/heading.width;
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

    /* Active icons live beside the stats; carried items and the lineage vault
       belong in the bag, rather than a second strip over the decision panel. */
    const activeX=chipStart+4*(LIFE_HUD.chipWidth+8)+10;
    activeSlots=Array.from({length:3},(_,index)=>addHeirloomSlot(root,{
      x:activeX+index*64,y:barY+8,width:58,height:54,
    },inventory.equipped[index],{tooltipView,onActivate:()=>{hideStatTooltip();onOpenHeirlooms?.('equipped');}}));
    bagControl=new PIXI.Container();bagControl.position.set(activeX+202,barY+8);
    bagControl.eventMode='static';bagControl.hitArea=new PIXI.Rectangle(0,0,64,54);
    const bagFrame=new PIXI.Graphics();roundedRect(bagFrame,0,0,64,54,6,0x292f2b,PALETTE.accent,1.5);
    bagControl.addChild(bagFrame);addHeirloomArt(bagControl,'bag',{x:7,y:2,width:50,height:50});
    const carried=inventory.carry.filter(Boolean).length;
    if(carried)bagControl.addChild(createText(String(carried),{...TEXT_STYLES.header,fontSize:18,fill:PALETTE.accent,stroke:0x101314,strokeThickness:3},59,34,1));
    bagControl.on('pointerover',event=>{if(event.pointerType!=='touch')tooltipView?.show?.({title:'Heirloom bag',scale:2,lines:[`${carried}/3 carried · ${(presentation.state?.civilization?.heirloomVault??[]).filter(Boolean).length}/6 in the lineage vault`,'Open to inspect active, carried and stored heirlooms.']},bagControl.getBounds());});
    bagControl.on('pointerout',()=>tooltipView?.hide?.());
    addInteractionFeedback(bagControl,{x:0,y:0,width:64,height:54},{onActivate:()=>{hideStatTooltip();onOpenHeirlooms?.('carry');}});
    root.addChild(bagControl);
  }

  return {
    init: () => render(true),
    update: () => render(),
    refresh: () => render(true),
    async prepare(renderer) {
      render(false, true);
      await renderer.prepare.upload(root);
    },
    getPreparationSnapshot: () => ({ visible: root.visible, childCount: root.children.length, buildCount }),
    getSemanticSnapshot: () => {
      const p=getPresentation?.()??{},v=p.profileVassal??p.vassal;
      return {visible:root.visible===true,prestigeDelta:getDeltas?.()?.prestige??0,
        retinue:getRetinue(p.state,v),bagRect:bagControl?.getBounds?.(),
        activeSlotRects:activeSlots.map(slot=>slot.getBounds()),
        equipped:(v?.heirlooms?.equipped??[]).map(item=>item?.definitionId??null)};
    },
  };
}
