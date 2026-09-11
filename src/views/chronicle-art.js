// Presentation assets only. Atlas choices never read or advance simulation RNG.
const ASSET_ROOT = 'images/dark-fantasy/';
const SPRITE_SHEET_ROOT = 'images/sprite-sheets/';
const atlases = new Map();
const cells = new Map();
const packedTextures = new Map();
const packedLoads = new Map();
let revision = 0;
export const getArtRevision = () => revision;
export const RESOURCE_ART_IDS = Object.freeze([
  'year', 'moon', 'phase', 'prestige', 'money', 'food', 'birth', 'housing',
  'faith', 'migration', 'death', 'solar-wheel', 'moon-wheel', 'lunar-bezel', 'cost-frame',
]);
export const getResourceTexture = id => loadTexture(`resource-language-v1/${id}.png`);
export const SETTLEMENT_PIECE_ART_IDS = Object.freeze([
  'forage', 'cultivate', 'raiseHouses', 'administrate', 'exchange', 'import',
  'mixedFarming', 'efficientKitchens', 'homesteading', 'lodgingHouses', 'study', 'mill',
  'harvestFestival', 'marketFeast', 'symposium', 'vigil',
  'mudHouses', 'granary', 'library', 'smokehouse', 'countingHouse', 'hostel', 'archive',
  'hallOfSages', 'agrarianGuild', 'forum', 'academy', 'caravanserai', 'resettlementHall', 'university',
]);

function loadTexture(file) {
  const packed = getPackedTexture(file);
  if (packed) return packed;
  if (atlases.has(file)) return atlases.get(file);
  const texture = PIXI.Texture.from(ASSET_ROOT + file);
  texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
  texture.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
  texture.baseTexture.on('loaded', () => { revision += 1; });
  atlases.set(file, texture);
  return texture;
}

const PACKED_GROUPS = Object.freeze({
  resources: Object.freeze({
    prefix: 'resource-language-v1/',
    files: Object.freeze(['resource-language.json']),
  }),
  settlementPieces: Object.freeze({
    prefix: 'settlement-pieces-v2/',
    files: Object.freeze(['settlement-pieces.json']),
  }),
});

function getPackedTexture(file) {
  const group = Object.values(PACKED_GROUPS).find(({prefix}) => file.startsWith(prefix));
  if (!group) return null;
  const key = `${group.prefix}${file.slice(group.prefix.length)}`;
  if (packedTextures.has(key)) return packedTextures.get(key);
  loadPackedGroup(group);
  return null;
}

async function loadPackedGroup(group) {
  if (packedLoads.has(group)) return packedLoads.get(group);
  const load = Promise.all(group.files.map(file => PIXI.Assets.load(`${SPRITE_SHEET_ROOT}${file}`)))
    .then(sheets => {
      sheets.forEach(sheet => Object.entries(sheet.textures).forEach(([name, texture]) => {
        const file = `${group.prefix}${name}`;
        texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
        texture.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
        packedTextures.set(file, texture);
      }));
      revision += 1;
    })
    .catch(error => {
      console.error('[art] failed to load packed sprite sheet', error);
    });
  packedLoads.set(group, load);
  return load;
}

export function preloadChronicleArt() {
  for (const file of ['chronicle-cards.png', 'chronicle-practices.png', 'chronicle-civic.png', 'realm-terrain.png', 'chronicle-gate.png', 'vassal-portraits.png', 'realm-landmarks.png',
    ...RESOURCE_ART_IDS.map(id => `resource-language-v1/${id}.png`)]) {
    loadTexture(file);
  }
  loadPackedGroup(PACKED_GROUPS.resources);
}

const ART = Object.freeze({
  forage: 0, cultivate: 1, preserve: 2, administrate: 3,
  granary: 4, mudHouses: 5, raiseHouses: 12, travel: 6, routes: 6,
  patronage: 7, development: 8, crisis: 9, legacy: 10, settlement: 11,
  exchange: 13, import: 14, caravanRoutes: 15, clearingHouse: 16,
  mixedFarming: 17, efficientKitchens: 18, homesteading: 19, lodgingHouses: 20,
  study: 21, mill: 22, harvestFestival: 23, marketFeast: 24, symposium: 25,
  vigil: 26, exodus: 27, hostel: 28, library: 29, archive: 30, hallOfSages: 31,
  agrarianGuild: 32, forum: 33, academy: 34, university: 35,
  practiceReform: 0, publicWorks: 4,
});

export function resolveIllustrationId(piece = {}) {
  if (typeof piece === 'string') return piece;
  return piece.practiceId ?? piece.structureId ?? piece.defId ?? piece.id ?? 'legacy';
}

export function getIllustrationSpec(id) {
  const pieceId = resolveIllustrationId(id);
  if (SETTLEMENT_PIECE_ART_IDS.includes(pieceId)) return { file: `settlement-pieces-v2/${pieceId}.webp`, index: 0, whole: true };
  const index=ART[resolveIllustrationId(id)];
  if(index==null)return null;
  return {file:['chronicle-cards.png','chronicle-practices.png','chronicle-civic.png'][Math.floor(index/12)],index:index%12};
}

export function atlasCell(file, index, columns, rows) {
  const source = atlases.get(file);
  if (!source?.baseTexture.valid) return null;
  const key = `${file}:${index}:${columns}:${rows}`;
  if (!cells.has(key)) {
    const width = Math.floor(source.width / columns);
    const height = Math.floor(source.height / rows);
    cells.set(key, new PIXI.Texture(source.baseTexture, new PIXI.Rectangle(
      (index % columns) * width + 2, Math.floor(index / columns) * height + 2,
      width - 4, height - 4,
    )));
  }
  return cells.get(key);
}

export function addIllustration(parent, id, rect, { alpha = 1 } = {}) {
  const {file,index,whole}=getIllustrationSpec(id)??getIllustrationSpec('legacy');
  if (whole) {
    const texture = loadTexture(file);
    if (!texture.baseTexture.valid) return null;
    const sprite = new PIXI.Sprite(texture);
    const scale = Math.min(rect.width / texture.width, rect.height / texture.height);
    sprite.scale.set(scale);
    sprite.position.set(rect.x + (rect.width - sprite.width) / 2, rect.y + (rect.height - sprite.height) / 2);
    sprite.alpha = alpha; sprite.eventMode = 'none'; parent.addChild(sprite);
    return sprite;
  }
  const source = atlasCell(file, index, 4, 3);
  if (!source) return null;
  // Crop to cover; paintings must never stretch when a compact slot becomes a tall card.
  const ratio=rect.width/rect.height,key=`cover:${file}:${index}:${ratio.toFixed(4)}`;
  if(!cells.has(key)){
    const width=Math.min(source.width,source.height*ratio),height=Math.min(source.height,source.width/ratio);
    cells.set(key,new PIXI.Texture(source.baseTexture,new PIXI.Rectangle(
      source.frame.x+(source.width-width)/2,source.frame.y+(source.height-height)/2,width,height)));
  }
  const texture=cells.get(key);
  const sprite = new PIXI.Sprite(texture);
  sprite.position.set(rect.x, rect.y);
  sprite.width = rect.width;
  sprite.height = rect.height;
  sprite.alpha = alpha;
  sprite.eventMode = 'none';
  parent.addChild(sprite);
  return sprite;
}

export function landmarkTexture(kind, frame) {
  const source=atlases.get('realm-landmarks.png');if(!source?.baseTexture.valid)return null;
  const key=`landmark:${kind}:${frame}`;
  if(!cells.has(key)){
    // The delivered transparent atlas has taller hamlet cells than fire cells.
    const y=kind==='fire'?.59*source.height:0;
    const height=kind==='fire'?.41*source.height:.565*source.height;
    cells.set(key,new PIXI.Texture(source.baseTexture,new PIXI.Rectangle(
      frame*source.width/4+2,y,source.width/4-4,Math.min(height,source.height-y))));
  }
  return cells.get(key);
}

export function addGateBackdrop(parent, rect, alpha = 0.18) {
  const texture = atlases.get('chronicle-gate.png');
  if (!texture?.baseTexture.valid) return;
  const sprite = new PIXI.Sprite(texture);
  sprite.position.set(rect.x, rect.y);
  sprite.width = rect.width; sprite.height = rect.height;
  sprite.alpha = alpha; sprite.eventMode = 'none';
  parent.addChild(sprite);
}

// Polygon data owns the geography. This layer works with any generated topology.
export function addRegionTerrain(parent, points, colour, alpha = 1) {
  const index = {green:0, red:1, blue:2, black:3}[colour] ?? 0;
  const texture = atlasCell('realm-terrain.png', index, 2, 2);
  if (!texture) return;
  const xs = points.filter((_, i) => i % 2 === 0);
  const ys = points.filter((_, i) => i % 2 === 1);
  const x = Math.min(...xs), y = Math.min(...ys);
  const width = Math.max(...xs) - x, height = Math.max(...ys) - y;
  const tile = new PIXI.TilingSprite(texture, width, height);
  tile.position.set(x, y);
  tile.tileScale.set(0.85);
  tile.tilePosition.set(-x, -y);
  tile.alpha = alpha;
  tile.eventMode = 'none';
  const mask = new PIXI.Graphics().beginFill(0xffffff).drawPolygon(points).endFill();
  mask.eventMode = 'none';
  parent.addChild(tile, mask);
  tile.mask = mask;
}
