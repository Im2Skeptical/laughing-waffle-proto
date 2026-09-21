// Presentation assets only. Atlas choices never read or advance simulation RNG.
const SPRITE_SHEET_ROOT = 'images/sprite-sheets/';
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
  'longhouse', 'cottage', 'townhouse', 'silo',
]);

const PACKED_GROUPS = Object.freeze({
  resources: Object.freeze({
    prefix: 'resource-language-v1/',
    files: Object.freeze(['resource-language.json']),
    eager: true,
  }),
  settlementPieces: Object.freeze({
    prefix: 'settlement-pieces-v2/',
    files: Object.freeze(['settlement-pieces.json']),
    eager: false,
  }),
  pieceFrames: Object.freeze({
    prefix: 'piece-frames-v1/',
    files: Object.freeze(['piece-frames.json']),
    eager: true,
  }),
  chronicleIllustrations: Object.freeze({
    prefix: 'chronicle-illustrations-v1/',
    files: Object.freeze(['chronicle-illustrations.json']),
    eager: true,
  }),
  vassalPortraits: Object.freeze({
    prefix: 'vassal-portraits-v1/',
    files: Object.freeze(['vassal-portraits.json']),
    eager: true,
  }),
  chronicleGate: Object.freeze({
    prefix: 'chronicle-gate-v1/',
    files: Object.freeze(['chronicle-gate.json']),
    eager: true,
  }),
  timegraphChronicle: Object.freeze({
    prefix: 'timegraph-chronicle-v1/',
    files: Object.freeze(['timegraph-chronicle.json']),
    eager: true,
  }),
});

function bumpRevision() {
  revision += 1;
}

function configureTexture(texture) {
  if (!texture?.baseTexture) return texture;
  texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
  texture.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
  return texture;
}

function packedGroupFor(file) {
  return Object.values(PACKED_GROUPS).find(({ prefix }) => file.startsWith(prefix)) ?? null;
}

function packedKeyFor(file, group) {
  return `${group.prefix}${file.slice(group.prefix.length)}`;
}

function loadTexture(file) {
  const group = packedGroupFor(file);
  if (group) {
    const key = packedKeyFor(file, group);
    if (packedTextures.has(key)) return packedTextures.get(key);
    // Packed sources are 4× larger than the runtime atlas. Never fetch them
    // while the sheet is in flight — that queue is what stalls desktop GPUs.
    loadPackedGroup(group);
    return null;
  }
  console.error(`[art] unregistered asset requested: ${file}`);
  return null;
}

export function getChronicleTexture(file) {
  return loadTexture(file);
}

async function loadPackedGroup(group) {
  if (packedLoads.has(group)) return packedLoads.get(group);
  const load = Promise.all(group.files.map(file => PIXI.Assets.load(`${SPRITE_SHEET_ROOT}${file}`)))
    .then(sheets => {
      sheets.forEach(sheet => Object.entries(sheet.textures).forEach(([name, texture]) => {
        const file = `${group.prefix}${name}`;
        configureTexture(texture);
        packedTextures.set(file, texture);
      }));
      bumpRevision();
    })
    .catch(error => {
      console.error('[art] failed to load packed sprite sheet', error);
    });
  packedLoads.set(group, load);
  return load;
}

export function preloadChronicleArt() {
  try { PIXI.Assets.setPreferences?.({ preferWorkers: true }); } catch { /* Pixi 7.2 ignores unknown prefs. */ }
  const eager = Object.values(PACKED_GROUPS)
    .filter(group => group.eager)
    .map(loadPackedGroup);
  // Warm the on-demand settlement atlas after HUD/map art has claimed the
  // first connections, so opening a settlement does not wait on a 20MB hitch.
  Promise.all(eager).then(() => loadPackedGroup(PACKED_GROUPS.settlementPieces));
  return Promise.all(eager);
}

const ART = Object.freeze({
  forage: 0, cultivate: 1, preserve: 2, administrate: 3,
  granary: 4, mudHouses: 5, raiseHouses: 12, travel: 6, routes: 6,
  patronage: 7, development: 8, crisis: 9, legacy: 10, relic: 10, settlement: 11,
  exchange: 13, import: 14, caravanRoutes: 15, clearingHouse: 16,
  mixedFarming: 17, efficientKitchens: 18, homesteading: 19, lodgingHouses: 20,
  study: 21, mill: 22, harvestFestival: 23, marketFeast: 24, symposium: 25,
  vigil: 26, exodus: 27, hostel: 28, library: 29, archive: 30, hallOfSages: 31,
  agrarianGuild: 32, forum: 33, academy: 34, university: 35,
  practiceReform: 0, publicWorks: 4,
});

const ILLUSTRATION_IDS = Object.freeze([
  'forage', 'cultivate', 'preserve', 'administrate', 'granary', 'mudHouses',
  'travel', 'patronage', 'development', 'crisis', 'legacy', 'settlement',
  'raiseHouses', 'exchange', 'import', 'caravanRoutes', 'clearingHouse',
  'mixedFarming', 'efficientKitchens', 'homesteading', 'lodgingHouses', 'study',
  'mill', 'harvestFestival', 'marketFeast', 'symposium', 'vigil', 'exodus',
  'hostel', 'library', 'archive', 'hallOfSages', 'agrarianGuild', 'forum',
  'academy', 'university',
]);
export function resolveIllustrationId(piece = {}) {
  if (typeof piece === 'string') return piece;
  return piece.practiceId ?? piece.structureId ?? piece.defId ?? piece.id ?? 'legacy';
}

export function getIllustrationSpec(id) {
  const pieceId = resolveIllustrationId(id);
  if (SETTLEMENT_PIECE_ART_IDS.includes(pieceId)) return { file: `settlement-pieces-v2/${pieceId}.webp`, index: 0, whole: true };
  const index=ART[resolveIllustrationId(id)];
  if(index==null)return null;
  return {file:`chronicle-illustrations-v1/${ILLUSTRATION_IDS[index]}.png`, whole:true};
}

export function addIllustration(parent, id, rect, { alpha = 1 } = {}) {
  const {file}=getIllustrationSpec(id)??getIllustrationSpec('legacy');
  const source = loadTexture(file);
  if (!source?.baseTexture.valid) return null;
  // Crop to cover; paintings must never stretch when a compact slot becomes a tall card.
  const ratio=rect.width/rect.height,key=`cover:${file}:${ratio.toFixed(4)}`;
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
  return loadTexture(`chronicle-illustrations-v1/${kind}-${frame}.png`);
}

export function addGateBackdrop(parent, rect, alpha = 0.18) {
  const texture = loadTexture('chronicle-gate-v1/chronicle-gate.png');
  if (!texture?.baseTexture.valid) return;
  const sprite = new PIXI.Sprite(texture);
  sprite.position.set(rect.x, rect.y);
  sprite.width = rect.width; sprite.height = rect.height;
  sprite.alpha = alpha; sprite.eventMode = 'none';
  parent.addChild(sprite);
}

// Polygon data owns the geography. This layer works with any generated topology.
export function addRegionTerrain(parent, points, colour, alpha = 1) {
  const terrain = {green:'green', red:'red', blue:'blue', black:'black'}[colour] ?? 'green';
  const texture = loadTexture(`chronicle-illustrations-v1/terrain-${terrain}.png`);
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
