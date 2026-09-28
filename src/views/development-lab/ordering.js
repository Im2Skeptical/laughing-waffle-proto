// Pointer events support mouse, pen and touch. Keyboard users can use Alt+arrows.
export function enablePracticeOrdering(tableau,onMove) {
  let drag=null;
  tableau.addEventListener('pointerdown',event=>{
    const handle=event.target.closest('[data-drag-slot]');
    if(!handle||event.button!==0)return;
    event.preventDefault();handle.setPointerCapture(event.pointerId);
    drag={from:Number(handle.dataset.dragSlot),to:null,handle};
    handle.closest('.lab-card').classList.add('lab-dragging');
  });
  tableau.addEventListener('pointermove',event=>{
    if(!drag)return;
    const card=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-slot-index]');
    drag.to=card&&tableau.contains(card)?Number(card.dataset.slotIndex):null;
    for(const item of tableau.children)item.classList.toggle('lab-drop-target',Number(item.dataset.slotIndex)===drag.to);
  });
  const finish=commit=>{
    if(!drag)return;
    const {from,to}=drag;drag=null;
    for(const item of tableau.children)item.classList.remove('lab-dragging','lab-drop-target');
    if(commit&&to!==null&&to!==from)onMove(from,to);
  };
  tableau.addEventListener('pointerup',()=>finish(true));
  tableau.addEventListener('pointercancel',()=>finish(false));
  tableau.addEventListener('keydown',event=>{
    const handle=event.target.closest('[data-drag-slot]');
    if(!handle||!event.altKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();const from=Number(handle.dataset.dragSlot),to=from+(event.key==='ArrowLeft'?-1:1);
    if(to>=0&&to<5)onMove(from,to);
  });
}
