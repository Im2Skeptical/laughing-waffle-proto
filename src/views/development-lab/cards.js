import { addSettlementPiece } from '../settlement-piece-pixi.js';
import { preloadChronicleArt, getArtRevision } from '../chronicle-art.js';
import { el, button, details } from './elements.js';

export function createLabCards() {
  const renderer = new PIXI.Renderer({width:440,height:250,backgroundAlpha:0,antialias:true,preserveDrawingBuffer:true});
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
    }
  },500);
  function paint({img,face,width}) {
    renderer.resize(width,250);
    const root = new PIXI.Container();
    addSettlementPiece(root,{x:8,y:14,width:width-16,height:226},{face,time:face.viewedTime,reducedMotion:true});
    renderer.render(root);
    img.src = renderer.view.toDataURL();
    root.destroy({children:true});
  }
  function card(face, label = '', onClick = null) {
    const wrapper = el('article','','lab-card');
    if (!face) { wrapper.append(el('p',label || 'Empty Practice slot')); return wrapper; }
    const width = face.kind === 'structure' ? Math.max(180,face.footprint * 145) : 180;
    const img = el('img'); img.alt = `${face.label}, ${face.tier}, ${face.stock}/${face.stockCapacity} Stock`; img.width = width; img.height = 250;
    const item = {img,face,width}; images.push(item); paint(item);
    wrapper.append(img,el('strong',label || `${face.label} · ${face.tier}`),el('p',face.rule));
    if (onClick) wrapper.append(button('Inspect / compare',onClick));
    else wrapper.append(details('Rules and providers',face.detailLines.join('\n')));
    return wrapper;
  }
  return {card,destroy(){clearInterval(timer);renderer.destroy();}};
}
