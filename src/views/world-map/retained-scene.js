// View-owned scene sections. Replacing a section disposes its old objects;
// unchanged sections retain text textures, graphics, hit areas and listeners.
export function createRetainedMapScene() {
  const entries=new Map();
  let builds=0,hits=0;
  return {
    update(parent,id,input,draw){
      const key=JSON.stringify(input);
      let entry=entries.get(id);
      if(!entry||entry.key!==key){
        entry?.node.destroy({children:true});
        const node=new PIXI.Container();
        entry={key,node,value:draw(node)};entries.set(id,entry);builds++;
      }else hits++;
      parent.addChild(entry.node);
      return entry;
    },
    clear(){for(const entry of entries.values())entry.node.destroy({children:true});entries.clear();},
    snapshot:()=>({entries:entries.size,builds,hits}),
  };
}
