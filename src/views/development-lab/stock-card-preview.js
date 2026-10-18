import { el, button } from './elements.js';

// A non-modal reader owned by the Stock summary DOM. It never changes routes,
// the Zoo selection, filters or the controller fixture.
export function createStockCardPreview({cards, faceForKey}) {
  const panel=el('aside','','lab-stock-card-preview');panel.hidden=true;
  panel.id='stock-card-preview';panel.dataset.testid='stock-card-preview';
  panel.setAttribute('role','region');panel.setAttribute('aria-label','Stock card preview');
  const header=el('div','','lab-stock-preview-head'),title=el('h3');
  const closeButton=button('Close',()=>close(),'stock-preview-close','quiet');closeButton.setAttribute('aria-label','Close card preview');
  const nav=el('div','','lab-stock-preview-nav'),position=el('span');position.setAttribute('aria-live','polite');
  const previous=button('Previous',()=>step(-1),'stock-preview-previous');previous.setAttribute('aria-label','Previous card');
  const next=button('Next',()=>step(1),'stock-preview-next');next.setAttribute('aria-label','Next card');
  nav.append(previous,position,next);header.append(title,closeButton,nav);
  const body=el('div','','lab-stock-preview-body'),art=el('div','','lab-stock-preview-art'),rules=el('div','','lab-stock-preview-rules');
  const imageHost=el('div');
  const full=button('Full rules',()=>{if(face)cards.inspect(face,anchor);},'stock-preview-rules');
  art.append(imageHost,full);body.append(art,rules);panel.append(header,body);
  let sequence=[],links=[],index=0,anchor=null,host=null,face=null,image=null,faceOptions={};

  function highlight() {
    for(const item of links)item.button.setAttribute('aria-expanded',String(!panel.hidden&&item.key===sequence[index]?.key));
  }
  function draw() {
    const item=sequence[index];face=faceForKey(item.key,faceOptions);
    if(!face){close();return;}
    title.textContent=face.label;
    position.textContent=`${index+1} / ${sequence.length}`;
    previous.disabled=index===0;next.disabled=index===sequence.length-1;
    if(!image){image=cards.image(face);imageHost.append(image.node);}else image.update(face);
    const reading=face.reading??{};
    const quality=face.tier[0].toUpperCase()+face.tier.slice(1);
    rules.replaceChildren(el('p',`${quality} · ${face.kind==='practice'?'Practice':face.construction?'Construction plan':'Structure'}`,'lab-note'));
    if(reading.trigger)rules.append(el('p',reading.trigger));
    for(const effect of reading.effects??[]) {
      const line=el('p');if(effect.timing)line.append(el('strong',`${effect.timing}: `));line.append(effect.text);rules.append(line);
    }
    for(const requirement of reading.requirements??[])rules.append(el('p',requirement,'lab-note'));
    if(!(reading.effects?.length)&&!reading.trigger)rules.append(el('p',face.rule));
    body.scrollTop=0;highlight();
  }
  function step(delta) {
    index=Math.max(0,Math.min(sequence.length-1,index+delta));
    anchor=sequence[index].button;draw();reveal();
  }
  function reveal() {
    if(window.matchMedia('(max-width:700px)').matches)return;
    const rect=panel.getBoundingClientRect(),top=parseFloat(getComputedStyle(panel).top)||0;
    const overflow=rect.bottom-window.innerHeight+12;
    if(overflow>0)window.scrollBy(0,Math.min(overflow,Math.max(0,rect.top-top)));
  }
  function preserveAnchor(action) {
    const source=anchor,top=source?.isConnected?source.getBoundingClientRect().top:null;
    action();
    if(top!==null&&source.isConnected)window.scrollBy(0,source.getBoundingClientRect().top-top);
  }
  function open(items,key,source,target,options={}) {
    if(host!==target)close(false);
    if(image&&!image.node.isConnected){image=null;imageHost.replaceChildren();}
    links=items;sequence=[...new Map(items.map(item=>[item.key,item])).values()];
    index=sequence.findIndex(item=>item.key===key);if(index<0)return;
    anchor=source;host=target;faceOptions=options;
    preserveAnchor(()=>{host.append(panel);panel.hidden=false;host.classList.add('has-card-preview');draw();});
    reveal();
  }
  function close(restoreFocus=true) {
    if(panel.hidden)return;
    preserveAnchor(()=>{panel.hidden=true;host?.classList.remove('has-card-preview');highlight();});
    if(restoreFocus&&anchor?.isConnected)anchor.focus({preventScroll:true});
  }
  return {open,close};
}
