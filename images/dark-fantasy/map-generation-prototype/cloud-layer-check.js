// Exercise the actual workbench display list: opaque clouds must hide borders,
// while clearing the sky must reveal them. No simulation or production hooks.
export function verifyCloudBorderOcclusion() {
  const workbench=window.mapWorkbench,before=workbench.timeline;
  let parent,renderer,stage;
  const addChild=PIXI.Container.prototype.addChild,render=PIXI.Renderer.prototype.render;
  workbench.setPlayback({playing:false});
  PIXI.Container.prototype.addChild=function(...nodes) {
    if(nodes.some(node=>node.name==='atmosphere'))parent=this;
    return addChild.apply(this,nodes);
  };
  PIXI.Renderer.prototype.render=function(container,...args) {
    renderer=this;stage=container;
    return render.call(this,container,...args);
  };
  try {workbench.setState({});}
  finally {PIXI.Container.prototype.addChild=addChild;PIXI.Renderer.prototype.render=render;}
  const border=parent?.children.find(node=>node.name==='region-borders');
  if(!border||!renderer||!stage)throw Error('Workbench border/atmosphere fixture unavailable');
  const sky=workbench.atmosphere,visible=border.visible;
  const cloud=new PIXI.Graphics().beginFill(0xffffff).drawRect(0,0,sky.texture.width,sky.texture.height).endFill();
  const capture=()=>{renderer.render(stage);return renderer.extract.pixels(stage);};
  const difference=(a,b)=>a.reduce((n,v,i)=>n+(Math.abs(v-b[i])>1),0);
  try {
    renderer.render(cloud,{renderTexture:sky.texture,clear:true});
    border.visible=true;const covered=capture();
    border.visible=false;const hidden=capture();
    const cloudBorderLeak=difference(covered,hidden);
    cloud.clear();renderer.render(cloud,{renderTexture:sky.texture,clear:true});
    border.visible=true;const clear=capture();
    border.visible=false;const noBorder=capture();
    const exposedBorderChannels=difference(clear,noBorder);
    if(!exposedBorderChannels)throw Error('Fixture did not exercise visible region borders');
    if(cloudBorderLeak)throw Error(`Borders drawn over opaque clouds: ${cloudBorderLeak} leaking channels`);
    return {pass:true,cloudBorderLeak,exposedBorderChannels};
  } finally {
    border.visible=visible;cloud.destroy();
    sky.update(renderer,before.displaySec,workbench.state,true);
    workbench.setPlayback({playing:before.playing});renderer.render(stage);
  }
}
