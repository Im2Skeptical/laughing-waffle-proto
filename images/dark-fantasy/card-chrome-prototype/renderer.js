// Isolated art prototype. Consumes presentation data; never reads or writes game state.
const ROOT = 'images/dark-fantasy/card-chrome-prototype/';
const ART = 'images/dark-fantasy/';
const textures = {};
const resources = {};
const paintings = {};
export const CARD_SIZE = { width: 300, height: 420, overhang: 24 };

export async function loadCardAssets(ids) {
  const response = await fetch(`${ROOT}components.json`);
  if (!response.ok) throw new Error(`Component manifest: ${response.status}`);
  const manifest = await response.json();
  const atlas = await PIXI.Assets.load(`${ROOT}${manifest.image}`);
  for (const [id, r] of Object.entries(manifest.frames)) {
    textures[id] = new PIXI.Texture(atlas.baseTexture, new PIXI.Rectangle(r.x, r.y, r.w, r.h));
  }
  const sheet = await PIXI.Assets.load('images/sprite-sheets/resource-language.json');
  for (const [name, texture] of Object.entries(sheet.textures)) {
    resources[name.split('/').at(-1).replace(/\.png$/, '')] = texture;
  }
  await Promise.all(ids.map(async id => {
    paintings[id] = await PIXI.Assets.load(`${ART}settlement-pieces-v4/${id}.webp`);
  }));
  return manifest;
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
    fill: color, stroke: '#261b10', strokeThickness: 3,
    dropShadow: true, dropShadowDistance: 1, dropShadowBlur: 2,
  });
  t.anchor.set(0.5); t.position.set(x, y);
  if (t.width > maxWidth) t.scale.set(maxWidth / t.width);
  parent.addChild(t); return t;
}

function icon(parent, id, x, y, size) {
  const aliases = { spring: 'stock-plant', autumn: 'stock-wild', research: 'stock-knowledge', support: 'stock-arms', knowledge: 'stock-knowledge', housingCapacity: 'housing', population: 'birth' };
  const tex = id === 'summer' ? textures.sun : id === 'winter' ? textures.winter
    : resources[aliases[id] ?? id] ?? resources[`stock-${String(id).toLowerCase()}`] ?? resources.stock;
  const s = sprite(parent, tex, x, y, size, size, true);
  if (id === 'autumn') s.tint = 0xe9a654;
  return s;
}

function workerDock(parent, face, x) {
  const capacity = Math.max(0, Math.min(4, face.workerCapacity));
  for (let i = capacity - 1; i >= 0; i--) {
    const id = i < face.workers ? ['workerFarmer', 'workerScholar', 'workerArtisan'][i % 3] : 'workerEmpty';
    sprite(parent, textures[id], x + 9, 397 - (i + 1) * 40, 37, 56);
  }
  panel(parent, 'socket', x, 396, 58, 47, 0.24);
  number(parent, `×${face.workerMultiplier}`, x + 29, 419, 30, 48, '#e7e3d7');
}

function stockTray(parent, face) {
  if (!face.stockTraits.length && !face.stockCapacity) return;
  const tags = face.stockTraits.slice(0, 3);
  const width = tags.length * 60 + 108;
  const x = 307 - width;
  panel(parent, 'panel', x, -22, width - 25, 57, 0.23);
  tags.forEach((tag, i) => {
    panel(parent, 'socket', x + 6 + i * 60, -17, 53, 46, 0.11);
    icon(parent, tag, x + 8 + i * 60, -20, 51);
  });
  sprite(parent, textures.crate, 220, -32, 94, 81);
  // A text group keeps two- and three-digit Stock amounts inside the crate.
  const values = new PIXI.Container(); parent.addChild(values);
  const current = number(values, face.stock, 0, 0, 40);
  current.anchor.x = 0;
  const limit = number(values, `/${face.stockCapacity}`, current.width - 1, 7, 25);
  limit.anchor.x = 0;
  const widthNeeded = current.width + limit.width;
  values.scale.set(Math.min(1, 85 / widthNeeded));
  values.position.set(267 - widthNeeded * values.scale.x / 2, 9);
}

function scheduled(parent, face) {
  const rows = face.production.slice(0, 3);
  const multi = rows.length > 1;
  const rowHeight = 36;
  const rowWidth = multi ? 72 : 54;
  const rowX = 250 - rowWidth;
  const rowY = 396 - (rows.length - 1) * rowHeight;
  panel(parent, 'panel', rowX, rowY, rowWidth + 10, rows.length * rowHeight + 11, 0.22);
  rows.forEach((row, i) => {
    if (multi) icon(parent, row.season ?? row.icon, rowX + 4, rowY + 4 + i * rowHeight, 29);
    number(parent, row.value, multi ? rowX + 53 : rowX + 28, rowY + 23 + i * rowHeight, 31, multi ? 36 : 44);
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
  sprite(parent, textures.medallion, medX, 387, 69, 69);
  const next = face.nextTrigger?.season ?? face.source?.icon ?? rows[0]?.season ?? 'spring';
  icon(parent, next, medX + 17, 403, 36);
  workerDock(parent, face, 250);
}

function charged(parent, face) {
  const rows = face.production.slice(0, 3);
  const multi = rows.length > 1;
  const outputX = multi ? 228 : 244;
  const barX = 40, barY = 397, barWidth = outputX - barX + 8;
  const count = Math.max(1, Math.min(12, face.chargeThreshold));
  const triggers = face.chargeTriggers.slice(0, 3);
  if (triggers.length) {
    const width = triggers.length * 43 + 14;
    panel(parent, 'panel', 43, 350, width, 45, 0.22);
    triggers.forEach((trigger, i) => icon(parent, trigger.trait ?? trigger.icon, 49 + i * 43, 352, 39));
  }
  const cellWidth = barWidth / count;
  for (let i = 0; i < count; i++) {
    const id = i < face.charge ? 'chargeFull' : 'chargeEmpty';
    panel(parent, id, barX + i * cellWidth, barY, cellWidth + 1, 43, 0.14, 30);
  }
  sprite(parent, textures.rail, barX - 5, barY - 4, barWidth + 10, 9);
  sprite(parent, textures.rail, barX - 5, barY + 39, barWidth + 10, 9);
  const rowY = 396 - (rows.length - 1) * 36;
  panel(parent, 'number', outputX, rowY, 307 - outputX, rows.length * 36 + 11, 0.23);
  rows.forEach((row, i) => {
    if (multi) icon(parent, row.icon, outputX + 4, rowY + 6 + i * 36, 27);
    number(parent, row.value, multi ? outputX + 54 : outputX + 31, rowY + 23 + i * 36, 31, 38);
  });
  workerDock(parent, face, -10);
}

/** Returns an independent Pixi container, in 300×420 logical card coordinates.
 * Stock extends 32px above; docks extend 36px below. Shared textures stay owned
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
