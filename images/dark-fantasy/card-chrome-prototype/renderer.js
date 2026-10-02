// Isolated art prototype. Consumes presentation data; never reads or writes game state.
const ROOT = 'images/dark-fantasy/card-chrome-prototype/';
const ART = 'images/dark-fantasy/';
const textures = {};
const resources = {};
const paintings = {};
export const CARD_SIZE = { width: 300, height: 420, overhang: { top: 104, right: 22, bottom: 36, left: 10 } };

export async function loadCardAssets(ids) {
  const manifests = [];
  for (const file of ['components.json', 'components-v2.json', 'workers-v3.json', 'stock-v4.json']) {
    const response = await fetch(`${ROOT}${file}`);
    if (!response.ok) throw new Error(`Component manifest: ${response.status}`);
    const manifest = await response.json();
    manifests.push(manifest);
    const atlas = await PIXI.Assets.load(`${ROOT}${manifest.image}`);
    for (const [id, r] of Object.entries(manifest.frames)) {
      textures[id] = new PIXI.Texture(atlas.baseTexture, new PIXI.Rectangle(r.x, r.y, r.w, r.h));
    }
  }
  // Split the existing forged Charge artwork at its rail. Its crowns retain
  // their illustrated necks while the reservoir can extend to the right.
  for (let count = 1; count <= 3; count++) {
    const source = textures[`chargeHousing${count}`];
    const r = source.frame;
    textures[`chargeCrown${count}`] = new PIXI.Texture(source.baseTexture,
      new PIXI.Rectangle(r.x, r.y, r.width, 778 - r.y));
  }
  textures.chargeReservoir = new PIXI.Texture(textures.chargeHousing3.baseTexture,
    new PIXI.Rectangle(823, 778, 422, 108));
  // Use only the illuminated enamel inside a cell; the fused housing owns the rim.
  const full = textures.chargeFull.frame;
  textures.chargeEnamel = new PIXI.Texture(textures.chargeFull.baseTexture,
    new PIXI.Rectangle(full.x + 24, full.y + 26, full.width - 48, full.height - 52));
  const sheet = await PIXI.Assets.load('images/sprite-sheets/resource-language.json');
  for (const [name, texture] of Object.entries(sheet.textures)) {
    resources[name.split('/').at(-1).replace(/\.png$/, '')] = texture;
  }
  await Promise.all(ids.map(async id => {
    paintings[id] = await PIXI.Assets.load(`${ART}settlement-pieces-v4/${id}.webp`);
  }));
  return manifests;
}

function sprite(parent, texture, x, y, w, h, contain = false) {
  const s = new PIXI.Sprite(texture);
  if (contain) {
    const ratio = Math.min(w / texture.width, h / texture.height);
    s.width = texture.width * ratio; s.height = texture.height * ratio;
    s.position.set(x + (w - s.width) / 2, y + (h - s.height) / 2);
  } else { s.position.set(x, y); s.width = w; s.height = h; }
  parent.addChild(s);
  return s;
}

// Scale the corners independently from the panel dimensions: the rim remains thin.
function panel(parent, id, x, y, w, h, cornerScale = 0.2, inset = 36) {
  const s = new PIXI.NineSlicePlane(textures[id], inset, inset, inset, inset);
  s.width = w / cornerScale; s.height = h / cornerScale;
  s.scale.set(cornerScale); s.position.set(x, y); parent.addChild(s);
  return s;
}

function number(parent, value, x, y, size = 30, maxWidth = Infinity, color = '#ffe6ab') {
  const t = new PIXI.Text(String(value), {
    fontFamily: 'Georgia, serif', fontWeight: 'bold', fontSize: size,
    fill: color, stroke: '#171511', strokeThickness: 2,
    dropShadow: true, dropShadowDistance: 1, dropShadowBlur: 0,
  });
  t.anchor.set(0.5); t.position.set(x, y);
  if (t.width > maxWidth) t.scale.set(maxWidth / t.width);
  parent.addChild(t); return t;
}

// Fit the complete text bounds (including stroke/shadow) in the actual recess.
// Keeping both limits avoids the previous vertical overflow on the multiplier.
function numberInBox(parent, value, box, size, label, color = '#ffe6ab') {
  const t = number(parent, value, 0, 0, size, Infinity, color);
  const bounds = t.getLocalBounds();
  // Leave a pixel of breathing room for renderer-resolution rounding.
  const scale = Math.min(1, (box.width - 2) / bounds.width, (box.height - 2) / bounds.height);
  t.scale.set(scale);
  t.position.set(box.x + box.width / 2 - (bounds.x + bounds.width / 2) * scale,
    box.y + box.height / 2 - (bounds.y + bounds.height / 2) * scale);
  (parent.numberBoxes ??= []).push({ label, box, text: t });
  return t;
}

export function inspectNumberBounds(card) {
  return (card.numberBoxes ?? []).map(({ label, box, text }) => {
    const local = text.getLocalBounds();
    const actual = { x: text.x + local.x * text.scale.x, y: text.y + local.y * text.scale.y,
      width: local.width * text.scale.x, height: local.height * text.scale.y };
    const epsilon = 0.01;
    return { label, box, actual, fontSize: text.style.fontSize * text.scale.x,
      fits: actual.x >= box.x - epsilon && actual.y >= box.y - epsilon
        && actual.x + actual.width <= box.x + box.width + epsilon
        && actual.y + actual.height <= box.y + box.height + epsilon };
  });
}

function icon(parent, id, x, y, size) {
  const aliases = { research: 'stock-knowledge', support: 'stock-arms', knowledge: 'stock-knowledge', housingCapacity: 'housing', population: 'birth' };
  const tex = id === 'spring' ? textures.springLeaf : id === 'autumn' ? textures.autumnLeaf
    : id === 'summer' ? textures.sun : id === 'winter' ? textures.winter
    : resources[aliases[id] ?? id] ?? resources[`stock-${String(id).toLowerCase()}`] ?? resources.stock;
  const s = sprite(parent, tex, x, y, size, size, true);
  return s;
}

function workerDock(parent, face, x) {
  const capacity = Math.max(0, Math.min(4, face.workerCapacity));
  const housing = new PIXI.NineSlicePlane(textures.workerMultiplier, 200, 235, 200, 60);
  housing.width = 780; housing.height = 880;
  housing.scale.set(0.1); housing.position.set(x, 368); parent.addChild(housing);
  for (let i = capacity - 1; i >= 0; i--) {
    const texture = textures[i < face.workers ? 'workerBustFull' : 'workerBustEmpty'];
    sprite(parent, texture, x + 20, 386 - (i + 1) * 48, 38, 52);
  }
  numberInBox(parent, `×${face.workerMultiplier}`, { x: x + 9, y: 393, width: 60, height: 50 }, 42, 'multiplier', '#eee9da');
}

function stockTray(parent, face) {
  if (!face.stockTraits.length && !face.stockCapacity) return;
  const tags = face.stockTraits.slice(0, 3);
  const width = tags.length * 50 + 158;
  const x = 318 - width;
  panel(parent, 'panel', x, -22, width - 32, 57, 0.23);
  tags.forEach((tag, i) => {
    panel(parent, 'socket', x + 6 + i * 50, -17, 45, 46, 0.11);
    icon(parent, tag, x + 7 + i * 50, -17, 44);
  });
  sprite(parent, textures.stockCrateSquare, 170, -104, 148, 156);
  numberInBox(parent, face.stock, { x: 185, y: -58, width: 94, height: 56 }, 62, 'stock-count');
  numberInBox(parent, `/${face.stockCapacity}`, { x: 185, y: 0, width: 94, height: 34 }, 38, 'stock-capacity');
}

function scheduled(parent, face) {
  const rows = face.production.slice(0, 3);
  const multi = rows.length > 1;
  const rowHeight = multi ? 56 : 84;
  const rowWidth = multi ? 104 : 74;
  const rowX = 244 - rowWidth;
  const height = rows.length * rowHeight;
  const rowY = 456 - height;
  panel(parent, 'stockOutputSquare', rowX, rowY, rowWidth + 10, height, 0.12, 85);
  const innerHeight = height - 24, slotHeight = innerHeight / rows.length;
  rows.forEach((row, i) => {
    const y = rowY + 12 + i * slotHeight, cy = y + slotHeight / 2;
    if (i) parent.addChild(new PIXI.Graphics().lineStyle(1, 0xb29862, 0.5).moveTo(rowX + 12, y).lineTo(rowX + rowWidth - 2, y));
    if (multi) icon(parent, row.season ?? row.icon, rowX + 13, cy - 17, 34);
    numberInBox(parent, row.value,
      multi ? { x: rowX + 51, y: y + 3, width: 51, height: slotHeight - 6 }
        : { x: rowX + 13, y: rowY + 13, width: 58, height: 58 },
      multi ? 52 : 60, `scheduled-output-${i}`);
  });
  const medX = rowX - 62;
  if (face.inputs.length) {
    const w = Math.min(medX + 16, face.inputs.length * 51 + 12);
    panel(parent, 'panel', medX + 18 - w, 396, w, 47, 0.2);
    face.inputs.slice(0, 2).forEach((input, i) => {
      const x = medX + 20 - w + i * 47;
      icon(parent, input.traits[0], x, 398, 40);
      number(parent, input.amount, x + 32, 432, 17, 22);
    });
  }
  // Preserve the calendar's existing solar / lunar material and phase divisions.
  const wheel = face.source?.icon === 'season' ? 'solar-wheel' : 'moon-wheel';
  parent.addChild(new PIXI.Graphics().beginFill(0x101c1b).drawCircle(medX + 34.5, 421.5, 25).endFill());
  sprite(parent, resources[wheel], medX, 387, 69, 69, true);
  const next = face.nextTrigger?.season ?? face.source?.icon ?? rows[0]?.season ?? 'spring';
  icon(parent, next, medX + 20, 407, 29);
  workerDock(parent, face, 244);
}

function charged(parent, face) {
  const rows = face.production.slice(0, 3);
  const multi = rows.length > 1;
  const outputX = multi ? 218 : 238;
  const barX = 52, barWidth = outputX - barX + 8;
  const count = Math.max(1, Math.min(12, face.chargeThreshold));
  const triggers = face.chargeTriggers.slice(0, 3);
  // Compact crowns stay left-offset at a constant 42px circle diameter.
  // Their cast necks overlap the matching rail; only the reservoir stretches.
  const layout = [null,
    { centers: [110], cy: 81, diameter: 130, outerDiameter: 170 },
    { centers: [101, 252], cy: 79, diameter: 128, outerDiameter: 158 },
    { centers: [78, 211, 341], cy: 77, diameter: 113, outerDiameter: 140 },
  ][Math.max(1, triggers.length)];
  const texture = textures[`chargeCrown${Math.max(1, triggers.length)}`];
  const scale = 42 / layout.outerDiameter;
  const housingY = 401 - texture.height * scale;
  sprite(parent, texture, barX, housingY, texture.width * scale, texture.height * scale);
  panel(parent, 'chargeReservoir', barX, 397, barWidth, 47, 0.35, 40);
  triggers.forEach((trigger, i) => {
    const size = layout.diameter * scale * 0.86;
    icon(parent, trigger.trait ?? trigger.icon, barX + layout.centers[i] * scale - size / 2, housingY + layout.cy * scale - size / 2, size);
  });
  const meter = { x: barX + 10, y: 405, width: barWidth - 20, height: 29 };
  const cellWidth = meter.width / count;
  for (let i = 0; i < count; i++) {
    if (i < face.charge) sprite(parent, textures.chargeEnamel, meter.x + i * cellWidth + 1, meter.y, cellWidth - 2, meter.height);
    if (i) sprite(parent, textures.divider, meter.x + i * cellWidth - 2, meter.y - 4, 4, meter.height + 8);
  }
  const outputWidth = multi ? 98 : 78;
  const outputHeight = multi ? rows.length * 62 : 78;
  const rowY = 456 - outputHeight;
  panel(parent, 'stockOutputSquare', outputX, rowY, outputWidth, outputHeight, 0.105, 85);
  const slotHeight = (outputHeight - 20) / rows.length;
  rows.forEach((row, i) => {
    const y = rowY + 10 + i * slotHeight;
    if (multi) icon(parent, row.icon, outputX + 10, y + slotHeight / 2 - 15, 30);
    numberInBox(parent, row.value,
      multi ? { x: outputX + 43, y: y + 3, width: 44, height: slotHeight - 6 }
        : { x: outputX + 10, y: rowY + 10, width: 58, height: 58 },
      multi ? 54 : 60, `charge-output-${i}`);
  });
  workerDock(parent, face, -10);
}

/** Returns an independent Pixi container, in 300×420 logical card coordinates.
 * Stock extends 104px above; docks extend 36px below. Shared textures stay owned
 * by the loader. Destroy containers with children:true, never texture:true.
 */
export function assembleCard(face) {
  const card = new PIXI.Container();
  const painting = paintings[face.definitionId];
  if (!painting) throw new Error(`Missing painting: ${face.definitionId}`);
  const art = sprite(card, painting, 5, 5, 290, 410);
  // Crop the illustration to cover the aperture without stretching its figures.
  const scale = Math.max(290 / painting.width, 410 / painting.height);
  art.width = painting.width * scale; art.height = painting.height * scale;
  art.position.set(150 - art.width / 2, 210 - art.height / 2);
  const mask = new PIXI.Graphics().beginFill(0xffffff).drawRect(5, 5, 290, 410).endFill();
  card.addChild(mask); art.mask = mask;
  panel(card, 'rim', 0, 0, 300, 420, 0.22, 40);
  stockTray(card, face);
  if (face.mode === 'charge') charged(card, face); else scheduled(card, face);
  return card;
}
