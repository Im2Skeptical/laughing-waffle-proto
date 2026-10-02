// Isolated art prototype. Consumes presentation data; never reads or writes game state.
const ROOT = 'images/dark-fantasy/card-chrome-prototype/';
const ART = 'images/dark-fantasy/';
const textures = {};
const resources = {};
const paintings = {};
export const CARD_SIZE = { width: 300, height: 420, overhang: 24 };

export async function loadCardAssets(ids) {
  const manifests = [];
  for (const file of ['components.json', 'components-v2.json']) {
    const response = await fetch(`${ROOT}${file}`);
    if (!response.ok) throw new Error(`Component manifest: ${response.status}`);
    const manifest = await response.json();
    manifests.push(manifest);
    const atlas = await PIXI.Assets.load(`${ROOT}${manifest.image}`);
    for (const [id, r] of Object.entries(manifest.frames)) {
      textures[id] = new PIXI.Texture(atlas.baseTexture, new PIXI.Rectangle(r.x, r.y, r.w, r.h));
    }
  }
  const revisedBase = textures.workerHousing.baseTexture;
  textures.triggerWell = new PIXI.Texture(revisedBase, new PIXI.Rectangle(40, 625, 167, 167));
  // The bare base is the same carved object, for a card with no worker sockets.
  textures.workerBase = new PIXI.Texture(revisedBase, new PIXI.Rectangle(49, 420, 376, 138));
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

function icon(parent, id, x, y, size) {
  const aliases = { research: 'stock-knowledge', support: 'stock-arms', knowledge: 'stock-knowledge', housingCapacity: 'housing', population: 'birth' };
  const tex = id === 'spring' ? textures.springLeaf : id === 'autumn' ? textures.autumnLeaf
    : id === 'summer' ? textures.sun : id === 'winter' ? textures.winter
    : resources[aliases[id] ?? id] ?? resources[`stock-${String(id).toLowerCase()}`] ?? resources.stock;
  const s = sprite(parent, tex, x, y, size, size, true);
  return s;
}

function triggerWell(parent, id, x, y, size) {
  const well = sprite(parent, textures.triggerWell, x, y, size, size);
  const mask = new PIXI.Graphics().beginFill(0xffffff).drawCircle(x + size / 2, y + size / 2, size / 2).endFill();
  parent.addChild(mask); well.mask = mask;
  icon(parent, id, x + size * 0.15, y + size * 0.15, size * 0.7);
}

function workerDock(parent, face, x) {
  const capacity = Math.max(0, Math.min(4, face.workerCapacity));
  const bottom = 444, baseHeight = 43, pitch = 33;
  if (capacity) {
    const height = baseHeight + capacity * pitch + 19;
    // Only the blank shaft stretches. The arch and flared base remain one artwork.
    const housing = new PIXI.NineSlicePlane(textures.workerHousing, 0, 95, 0, 205);
    housing.width = 376; housing.height = height / 0.22;
    housing.scale.set(60 / 376, 0.22); housing.position.set(x, bottom - height);
    parent.addChild(housing);
    for (let i = 0; i < capacity; i++) {
      sprite(parent, textures[i < face.workers ? 'pawnFull' : 'pawnEmpty'], x + 20, 403 - (i + 1) * pitch, 21, 31, true);
    }
  } else {
    sprite(parent, textures.workerBase, x, bottom - baseHeight, 60, baseHeight);
  }
  number(parent, `×${face.workerMultiplier}`, x + 30, 424, 30, 48, '#eee9da');
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
  const rowHeight = 43;
  const rowWidth = multi ? 91 : 60;
  const rowX = 250 - rowWidth;
  const rowY = 396 - (rows.length - 1) * rowHeight;
  panel(parent, 'stockOutput', rowX, rowY, rowWidth + 10, rows.length * rowHeight + 5, 0.16, 80);
  rows.forEach((row, i) => {
    const y = rowY + 3 + i * rowHeight;
    if (i) parent.addChild(new PIXI.Graphics().lineStyle(1, 0xb29862, 0.5).moveTo(rowX + 10, y).lineTo(rowX + rowWidth, y));
    if (multi) triggerWell(parent, row.season ?? row.icon, rowX + 7, y + 3, 36);
    number(parent, row.value, multi ? rowX + 69 : rowX + 34, y + 22, 34, multi ? 39 : 48);
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
  workerDock(parent, face, 250);
}

function charged(parent, face) {
  const rows = face.production.slice(0, 3);
  const multi = rows.length > 1;
  const outputX = multi ? 228 : 244;
  const barX = 40, barWidth = outputX - barX + 8;
  const count = Math.max(1, Math.min(12, face.chargeThreshold));
  const triggers = face.chargeTriggers.slice(0, 3);
  // These are illustrated as one forged mechanism: circular wells flow into
  // the reservoir. Live symbols and lit segments occupy its existing recesses.
  const layout = [null,
    { centers: [110], cy: 81, diameter: 130, meter: { x: 29, y: 179, w: 334, h: 62 } },
    { centers: [101, 252], cy: 79, diameter: 128, meter: { x: 28, y: 178, w: 328, h: 62 } },
    { centers: [78, 211, 341], cy: 77, diameter: 113, meter: { x: 29, y: 177, w: 366, h: 62 } },
  ][Math.max(1, triggers.length)];
  const texture = textures[`chargeHousing${Math.max(1, triggers.length)}`];
  const scale = barWidth / texture.width;
  const housingY = 443 - texture.height * scale;
  sprite(parent, texture, barX, housingY, barWidth, texture.height * scale);
  triggers.forEach((trigger, i) => {
    const size = layout.diameter * scale * 0.81;
    icon(parent, trigger.trait ?? trigger.icon, barX + layout.centers[i] * scale - size / 2, housingY + layout.cy * scale - size / 2, size);
  });
  const meter = { x: barX + layout.meter.x * scale, y: housingY + layout.meter.y * scale, width: layout.meter.w * scale, height: layout.meter.h * scale };
  const cellWidth = meter.width / count;
  for (let i = 0; i < count; i++) {
    if (i < face.charge) sprite(parent, textures.chargeEnamel, meter.x + i * cellWidth + 1, meter.y, cellWidth - 2, meter.height);
    if (i) sprite(parent, textures.divider, meter.x + i * cellWidth - 2, meter.y - 4, 4, meter.height + 8);
  }
  const rowY = 396 - (rows.length - 1) * 36;
  panel(parent, 'stockOutput', outputX, rowY, 307 - outputX, rows.length * 36 + 11, 0.12, 80);
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
