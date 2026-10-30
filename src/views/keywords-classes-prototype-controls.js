// Development scaffolding only. Switching creates a fresh disposable run.
export function addKeywordPrototypeControls(host) {
  const section=document.createElement('section');section.className='lab-panel';
  const heading=document.createElement('h3');heading.textContent='Keywords · viewing decks & comparisons';
  const params=new URLSearchParams(location.search);
  const select=(label,entries,current)=>{
    const field=document.createElement('label');field.textContent=label+' ';
    const input=document.createElement('select');input.setAttribute('aria-label',label);
    for(const [value,text] of entries){const option=document.createElement('option');option.value=value;option.textContent=text;input.append(option);}
    input.value=current;field.append(input);section.append(field);return input;
  };
  section.append(heading);
  const mode=select('Keyword option',[['regular','Ordinary rules · Bronze viewing deck'],['disciplines','A · Historical class disciplines'],['lenses','B · Shared lenses'],['teachings','C · Inherited teachings']],params.get('variant')??'regular');
  const role=select('Keyword class',[['scholar','Scholar'],['warrior','Warrior'],['priest','Priest (planned)'],['merchant','Merchant (planned)']],params.get('class')??'scholar');
  const teaching=select('Prior teaching',[['1','Economic Regions inherited'],['0','No inherited teaching']],params.get('inherited')??'1');
  const supply=select('Synthesis supply',[['ready','Water supplied'],['blocked','Water missing initially']],params.get('supply')??'ready');
  const cards=select('Keyword cards',[['classic','Original examples'],['bronze','Eight new Bronze cards']],params.get('cards')??'classic');
  const update=()=>{
    const regular=mode.value==='regular';
    for(const option of role.options)option.disabled=regular&&['priest','merchant'].includes(option.value);
    if(regular&&['priest','merchant'].includes(role.value))role.value='scholar';
    teaching.disabled=regular;cards.disabled=regular;
    if(regular)cards.value='bronze';
  };
  mode.addEventListener('change',update);update();
  const launch=document.createElement('button');launch.textContent='Open fresh keyword run';
  launch.addEventListener('click',()=>{location.href=`?prototype=keywords&variant=${mode.value}&class=${role.value}&inherited=${teaching.value}&supply=${supply.value}&cards=${cards.value}`;});
  const note=document.createElement('p');note.textContent='Keywords work in ordinary games. The ordinary-rules viewing deck selects a real Scholar or Warrior with the eight Bronze cards and supplies. Choose New game and a save slot. A/B/C retain the historical comparisons; Priest/Merchant apply only there. Switching starts a fresh run.';
  section.append(launch,note);host.append(section);
}
