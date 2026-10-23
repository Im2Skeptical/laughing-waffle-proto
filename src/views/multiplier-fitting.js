// Shared symbol-only fitting for installed and prospective Practices.
import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES } from './settlement-theme.js';
import { getStoneTexture } from './chronicle-skin.js';
import { getChronicleTexture } from './chronicle-art.js';
import { addResourceIcon } from './resource-cost-pixi.js';
import { addInteractionFeedback } from './interaction-feedback.js';

// Attached future-effect marker, using the game's existing time symbol.
export function addMultiplierCompletionBadge(parent, x, y, size = 32) {
  const badge = new PIXI.Container(); badge.position.set(x, y); badge.eventMode = 'none';
  const r = size / 2;
  badge.addChild(new PIXI.Graphics().lineStyle(2, 0xb5d3b8).beginFill(0x17211f, .98).drawCircle(0, 0, r).endFill());
  addResourceIcon(badge, 'hourglass', 0, 0, size * .75);
  parent.addChild(badge); return badge;
}

function addSealEmblem(parent, kind, boosted, cx, cy, size) {
  const output = kind === 'output';
  const texName = `chronicle-hud-frames-v1/mult-seal-${output ? 'output' : 'capacity'}-${boosted ? 'active' : 'dormant'}.png`;
  const tex = getChronicleTexture(texName);
  const wrap = new PIXI.Container();
  wrap.position.set(cx, cy);
  wrap.eventMode = 'none';
  if (tex?.baseTexture?.valid) {
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5, 0.5);
    sp.scale.set(size / Math.max(tex.width, tex.height));
    sp.alpha = boosted ? 1 : 0.78;
    wrap.addChild(sp);
  } else {
    addResourceIcon(wrap, 'stock', 0, 0, size * 0.7).alpha = boosted ? 1 : 0.65;
  }
  parent.addChild(wrap);
  return wrap;
}

export function addMultiplierFitting(parent, box, { kind, multiplier, label = null, tooltipView, spec }) {
  const plate = new PIXI.Container(); plate.position.set(box.x, box.y);
  const output = kind === 'output', boosted = multiplier !== 1, w = box.width, h = box.height;
  const textLabel = label ?? `×${multiplier}`;
  const halfName = `chronicle-hud-frames-v1/mult-twin-${output ? 'left' : 'right'}-${boosted ? 'active' : 'dormant'}.png`;
  const halfTex = getChronicleTexture(halfName);

  if (halfTex?.baseTexture?.valid) {
    const bg = new PIXI.Sprite(halfTex);
    bg.width = w;
    bg.height = h;
    bg.alpha = boosted ? 1 : 0.88;
    bg.eventMode = 'none';
    plate.addChild(bg);
  } else {
    const metal = output ? 0xc7a262 : 0xa5b5b2;
    const g = new PIXI.Graphics();
    g.lineStyle(2, boosted ? metal : 0x62675c).beginTextureFill({ texture: getStoneTexture(), color: output ? 0x423824 : 0x303d3a });
    g.drawRoundedRect(0, 0, w, h, 4).endFill();
    g.eventMode = 'none';
    plate.addChild(g);
  }

  const iconSize = Math.min(h * 0.80, w * 0.36);
  const iconCx = Math.round(14 + iconSize * 0.5);
  addSealEmblem(plate, kind, boosted, iconCx, h / 2, iconSize);

  const ink = boosted ? (output ? 0xffe494 : 0xf2e9d0) : 0x787f74;
  const textZoneLeft = iconCx + iconSize * 0.46;
  const textZoneRight = w - 10;
  const number = createText(textLabel, {
    ...TEXT_STYLES.chip,
    fontSize: boosted ? 31 : 26,
    fill: ink,
    stroke: 0x0d110c,
    strokeThickness: 3,
    trim: true,
  }, (textZoneLeft + textZoneRight) / 2, h / 2, 0.5, 0.5);
  const availW = Math.max(18, textZoneRight - textZoneLeft);
  number.scale.set(Math.min(1, availW / Math.max(1, number.width)));
  number.eventMode = 'none';
  plate.addChild(number);

  plate.eventMode = 'static'; plate.cursor = 'pointer'; plate.hitArea = new PIXI.Rectangle(0, 0, w, h);
  plate.accessibleTitle = spec?.title ?? `${output ? 'Output' : 'Capacity'} Multiplier ${multiplier}`;
  addInteractionFeedback(plate, { x: 0, y: 0, width: w, height: h }, {
    onActivate: () => { if (spec) tooltipView?.pin?.(spec, () => plate.getBounds(), spec.poolKey ?? `output-fitting:${spec.title}:${kind}`); }
  });
  if (spec) {
    plate.on('pointerover', event => { if (event.pointerType !== 'touch') tooltipView?.show?.(spec, plate.getBounds(), { dismissOnExit: true }); });
    plate.on('pointerout', () => tooltipView?.hide?.());
  }
  parent.addChild(plate);
  if (spec) tooltipView?.refreshMultiplier?.(spec, () => plate.getBounds());
  return plate;
}

// Fits the same carved twin-socket pair to regional, detailed and shop Practice slots.
export function addPracticeMultiplierPair(parent, box, entry, index, tooltipView) {
  const face = entry?.face;
  if (!face?.outputMultiplierBreakdown) return [];
  const row = {
    index,
    practiceId: entry.practiceId ?? face.definitionId,
    name: face.label,
    baseOutput: face.baseStockProduction,
    output: face.outputMultiplierBreakdown,
    capacity: face.stockCapacityBreakdown,
  };
  return ['output', 'capacity'].map((kind, i) => {
    const scale = box.height / 50, width = box.width / 2;
    const plate = addMultiplierFitting(parent, { x: box.x + i * width, y: box.y, width: width / scale, height: 50 },
      { kind, multiplier: row[kind].multiplier, tooltipView, spec: multiplierTooltip(row, kind) });
    plate.scale.set(scale); return plate;
  });
}

export function multiplierTooltip(row, kind, { afterCompletion = false } = {}) {
  const pool = row[kind], before = row.before?.[kind]?.multiplier;
  const pending = afterCompletion && (pool.sources.some(source => source.pending) || before !== undefined && before !== pool.multiplier);
  return {
    title: `${row.name} \u00b7 ${kind === 'output' ? 'Output' : 'Capacity'} Multiplier \u00d7${row[kind].multiplier}`,
    poolKey: `pool:${row.practiceId ?? row.index ?? row.name}:${kind}`,
    poolBreakdown: { name: row.name, kind, pool, before, baseOutput: row.baseOutput, afterCompletion: pending },
    scale: 1,
  };
}
