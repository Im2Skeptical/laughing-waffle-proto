// Painted class chrome is presentation only; portrait identities stay serialized.
const ROOT = 'images/dark-fantasy/vassal-chrome-prototype/';
const FRAMES = {warrior:[16,24,595,600],scholar:[646,22,585,607],crest:[72,651,501,521],mystery:[649,678,551,567]};
const textures = {};
let loading;
let revision = 0;
export const getVassalClassArtRevision = () => revision;
export const getVassalClassTextures = () => Object.values(textures);
async function loadClassTexture(file) {
  for (let attempt=0;attempt<3;attempt++) {
    try {
      const texture=await PIXI.Assets.load(`${ROOT}${file}`);
      if(!texture?.baseTexture?.valid || texture.valid === false)throw new Error('invalid or undecoded texture');
      return texture;
    } catch (cause) {
      if(attempt===2) {
        const error=new Error(`Artwork could not be loaded: ${file}`,{cause});
        error.code='artworkLoadFailed';throw error;
      }
      await new Promise(resolve=>setTimeout(resolve,[500,1500][attempt]));
    }
  }
}
export function preloadVassalClassArt() {
  return loading ??= Promise.all([loadClassTexture('components.png'),loadClassTexture('portraits.png')]).then(([components, portraits]) => {
    for (const [id, rect] of Object.entries(FRAMES)) textures[id] = new PIXI.Texture(components.baseTexture, new PIXI.Rectangle(...rect));
    const size = portraits.width / 2;
    for (const [index, id] of ['warrior','scholar'].entries()) textures[`${id}-founder`] = new PIXI.Texture(portraits.baseTexture,new PIXI.Rectangle(index*size,0,size,size));
    revision++;
  }).catch(error=>{loading=null;throw error;});
}

// `crest` defaults to the founder crest; tabs and chips pass crest:false for the bare frame.
export function createClassPortraitArt(classId, {size, founder = false, texture = null, crest = founder} = {}) {
  if (!textures[classId]) return null;
  const root = new PIXI.Container();
  const h = size * textures[classId].height / textures[classId].width;
  const painting = founder ? textures[`${classId}-founder`] : texture;
  if (painting) {
    const sprite = new PIXI.Sprite(painting);
    sprite.position.set(size*.13,h*.14);sprite.width=size*.74;sprite.height=h*.74;
    const mask = new PIXI.Graphics().beginFill(0xffffff);
    if (classId === 'warrior') mask.drawCircle(size*.5,h*.505,size*.357);
    else mask.moveTo(size*.212,h*.835).lineTo(size*.212,h*.425)
      .quadraticCurveTo(size*.212,h*.195,size*.5,h*.195)
      .quadraticCurveTo(size*.788,h*.195,size*.788,h*.425).lineTo(size*.788,h*.835).closePath();
    mask.endFill();root.addChild(sprite,mask);sprite.mask=mask;
  }
  const frame = new PIXI.Sprite(textures[classId]);frame.width=size;frame.height=h;root.addChild(frame);
  if (crest) {
    const sun = new PIXI.Sprite(textures.crest);sun.position.set(size*.34,-size*.105);sun.width=size*.32;sun.height=size*.32;root.addChild(sun);
  }
  root.hitArea = new PIXI.Rectangle(0,0,size,h);
  return root;
}
