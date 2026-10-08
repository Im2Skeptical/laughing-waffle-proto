import { addSettlementPiece } from '../settlement-piece-pixi.js';
import { preloadChronicleArt, getArtRevision, getStockTraitTexture } from '../chronicle-art.js';
import { eventIcon, seasonIcon } from '../piece-face-chrome.js';
import { el, button, details } from './elements.js';
import { createLabCardReading } from './card-reading.js';

const faceDescription = face => `${face.label} · ${face.tier}${face.kind==='practice'?` · Stock ${face.stock}/${face.stockCapacity}`:face.construction?` · Construction plan, ${face.construction.completedCycles}/${face.construction.requiredCycles} cycles · Consume per cycle: ${face.inputs.map(cost=>`${cost.amount} ${cost.traits.join(' / ')}`).join(' + ')}`:' · Completed structure'}`;

export function createLabCards({onReview} = {}) {
  const reading = createLabCardReading({onReview});
  const renderer = new PIXI.Renderer({width:440,height:250,resolution:2,backgroundAlpha:0,antialias:true,preserveDrawingBuffer:true});
  let revision = -1;
  let images = [];
  void preloadChronicleArt().catch(error => console.error('[art] card artwork preparation failed', error));
  const timer = setInterval(() => {
    images = images.filter(({img}) => img.isConnected);
    const next = getArtRevision();
    if (next !== revision) {
      revision = next;
      // Late textures refresh only images, preserving unfinished form edits/focus.
      for (const item of images) item.paint?item.paint():paint(item);
      reading.refresh();
    }
  },500);
  function paint({img,face,width,onSections}) {
    renderer.resize(width,250);
    const root = new PIXI.Container();
    const piece=addSettlementPiece(root,{x:8,y:14,width:width-16,height:226},{face,time:face.viewedTime,reducedMotion:true});
    renderer.render(root);
    img.src = renderer.view.toDataURL();
    onSections?.(Object.fromEntries(Object.entries(piece.faceSections??{}).filter(([,section])=>section?.width).map(([key,section])=>[key,{
      x:(piece.x+section.x*piece.scale.x)/width*100,y:(piece.y+section.y*piece.scale.y)/250*100,
      width:section.width*piece.scale.x/width*100,height:section.height*piece.scale.y/250*100,
    }])));
    root.destroy({children:true});
  }
  const icons=new Map();
  function icon({trait,season,event}) {
    const key=JSON.stringify({trait,season,event});
    const img=el('img');img.alt='';img.width=40;img.height=40;
    const draw=()=>{
      renderer.resize(48,48);const root=new PIXI.Container();
      if(trait){const sprite=new PIXI.Sprite(getStockTraitTexture(trait));sprite.anchor.set(.5);sprite.position.set(24,24);sprite.width=sprite.height=40;root.addChild(sprite);}
      else if(season)seasonIcon(root,season,24,24,40);
      else eventIcon(root,event,24,24,40);
      renderer.render(root);const url=renderer.view.toDataURL();root.destroy({children:true});return url;
    };
    let cached=icons.get(key);
    if(!cached||cached.revision!==getArtRevision()){cached={revision:getArtRevision(),url:draw()};icons.set(key,cached);}
    img.src=cached.url;
    // Reuse the card renderer and refresh late atlas loads with the card faces.
    images.push({img,paint:()=>{img.src=draw();}});
    return img;
  }
  function image(face, onSections) {
    const img=el('img');img.alt=faceDescription(face);
    const item={img,face,width:face.kind==='structure'?Math.max(180,face.footprint*145):180,onSections};
    images.push(item);paint(item);
    return {node:img,update(next){item.face=next;img.alt=faceDescription(next);item.width=next.kind==='structure'?Math.max(180,next.footprint*145):180;paint(item);}};
  }
  // Readable specimens: tapping/hovering the face gives the quick read; one
  // compact row holds Rules (full inspection), Compare and any caller actions.
  // `meta` chips (class, quality, state) sit under the name instead of a long label.
  function card(face, label = '', onClick = null, {readable = false, actions = [], meta = []} = {}) {
    const wrapper = el('article','','lab-card');
    if (!face) { wrapper.append(el('p',label || 'Empty Practice slot','lab-empty')); return wrapper; }
    const width = face.kind === 'structure' ? Math.max(180,face.footprint * 145) : 180;
    const img = el('img'); img.alt = faceDescription(face); img.width = width; img.height = 250;
    const item = {img,face,width}; images.push(item); paint(item);
    const row = el('div','','lab-card-actions');
    const name = el('strong', label || `${face.label} · ${face.tier}`, 'lab-card-title');
    const chips = el('div','','lab-card-meta'); chips.append(...meta);
    if (readable && face.reading) {
      const preview = button('', () => {});
      preview.className = 'lab-card-preview';
      preview.setAttribute('aria-label', `Read ${face.label}, ${face.tier}`);
      preview.append(img); reading.attach(preview, face);
      wrapper.append(preview, name);
      row.append(button('Rules', () => reading.inspect(face, preview), '', 'quiet'));
    } else wrapper.append(img,name);
    if (meta.length) wrapper.append(chips);
    if (!readable || !face.reading) wrapper.append(el('p',face.rule,'lab-card-rule'));
    if (onClick) row.append(button('Compare',onClick,'','quiet'));
    row.append(...actions);
    if (row.children.length) wrapper.append(row);
    if (!onClick) wrapper.append(details('Rules and providers',face.detailLines.join('\n')));
    return wrapper;
  }
  return {card,image,icon,dismissReading:reading.close,getReadingSnapshot:reading.getSnapshot,destroy(){clearInterval(timer);reading.destroy();renderer.destroy();}};
}
