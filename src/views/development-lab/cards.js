import { addSettlementPiece } from '../settlement-piece-pixi.js';
import { preloadChronicleArt, getArtRevision } from '../chronicle-art.js';
import { el, button, details } from './elements.js';
import { createLabCardReading } from './card-reading.js';

export function createLabCards({onReview} = {}) {
  const reading = createLabCardReading({onReview});
  const renderer = new PIXI.Renderer({width:440,height:250,resolution:2,backgroundAlpha:0,antialias:true,preserveDrawingBuffer:true});
  let revision = -1;
  let images = [];
  preloadChronicleArt();
  const timer = setInterval(() => {
    images = images.filter(({img}) => img.isConnected);
    const next = getArtRevision();
    if (next !== revision) {
      revision = next;
      // Late textures refresh only images, preserving unfinished form edits/focus.
      for (const item of images) paint(item);
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
  function image(face, onSections) {
    const description=face=>`${face.label} · ${face.tier}${face.kind==='practice'?` · Stock ${face.stock}/${face.stockCapacity}`:''}`;
    const img=el('img');img.alt=description(face);
    const item={img,face,width:face.kind==='structure'?Math.max(180,face.footprint*145):180,onSections};
    images.push(item);paint(item);
    return {node:img,update(next){item.face=next;img.alt=description(next);item.width=next.kind==='structure'?Math.max(180,next.footprint*145):180;paint(item);}};
  }
  function card(face, label = '', onClick = null, {readable = false} = {}) {
    const wrapper = el('article','','lab-card');
    if (!face) { wrapper.append(el('p',label || 'Empty Practice slot')); return wrapper; }
    const width = face.kind === 'structure' ? Math.max(180,face.footprint * 145) : 180;
    const img = el('img'); img.alt = `${face.label}, ${face.tier}, ${face.stock}/${face.stockCapacity} Stock`; img.width = width; img.height = 250;
    const item = {img,face,width}; images.push(item); paint(item);
    if (readable && face.reading) {
      const preview = button('', () => {});
      preview.className = 'lab-card-preview';
      preview.setAttribute('aria-label', `Read ${face.label}, ${face.tier}`);
      preview.append(img); reading.attach(preview, face);
      wrapper.append(preview, el('strong', label || `${face.label} · ${face.tier}`), button('Inspect tooltip', () => reading.inspect(face, preview)));
    } else wrapper.append(img,el('strong',label || `${face.label} · ${face.tier}`),el('p',face.rule));
    if (onClick) wrapper.append(button('Inspect / compare',onClick));
    else wrapper.append(details('Rules and providers',face.detailLines.join('\n')));
    return wrapper;
  }
  return {card,image,dismissReading:reading.close,getReadingSnapshot:reading.getSnapshot,destroy(){clearInterval(timer);reading.destroy();renderer.destroy();}};
}
