// Development scaffolding only. Switching creates a fresh disposable run.
export function addKeywordPrototypeControls(host) {
  const section=document.createElement('section');section.className='lab-panel';
  const heading=document.createElement('h3');heading.textContent='Keywords & classes · throwaway';
  const params=new URLSearchParams(location.search);
  const select=(label,entries,current)=>{
    const field=document.createElement('label');field.textContent=label+' ';
    const input=document.createElement('select');input.setAttribute('aria-label',label);
    for(const [value,text] of entries){const option=document.createElement('option');option.value=value;option.textContent=text;input.append(option);}
    input.value=current;field.append(input);section.append(field);return input;
  };
  section.append(heading);
  const mode=select('Keyword option',[['disciplines','A · Class disciplines'],['lenses','B · Shared lenses'],['teachings','C · Inherited teachings']],params.get('variant')??'disciplines');
  const role=select('Keyword class',[['scholar','Scholar'],['warrior','Warrior'],['priest','Priest (planned)'],['merchant','Merchant (planned)']],params.get('class')??'scholar');
  const teaching=select('Prior teaching',[['1','Economic Regions inherited'],['0','No inherited teaching']],params.get('inherited')??'1');
  const supply=select('Synthesis supply',[['ready','Water supplied'],['blocked','Water missing initially']],params.get('supply')??'ready');
  const launch=document.createElement('button');launch.textContent='Open fresh keyword experiment';
  launch.addEventListener('click',()=>{location.href=`?prototype=keywords&variant=${mode.value}&class=${role.value}&inherited=${teaching.value}&supply=${supply.value}`;});
  const note=document.createElement('p');note.textContent='Opens the real game. Choose New game and a save slot. Role controls only keyword rules; Priest/Merchant are experimental lenses, not complete classes. Switching restarts; no live state is rewritten.';
  section.append(launch,note);host.append(section);
}
