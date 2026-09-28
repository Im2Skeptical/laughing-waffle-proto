import { getDetailedSettlementViewModel } from '../../model/detailed-settlements.js';
import { getCurrentLifeMapVassal, getVassalCandidatePool } from '../../model/vassal-life-map.js';
import { classActionOptions } from '../../model/vassal-life-map/class-actions.js';
import { getLabObservation } from '../../model/dev-lab/sandbox.js';
import { NEUTRAL_TEMPLATES } from '../../model/detailed-settlements/external-world.js';
import { planStock, stockTraits } from '../../model/detailed-settlements/stock.js';
import { el, input, select, field, button, section, details, table } from './elements.js';

const qualities = ['bronze','silver','gold','diamond'];
export function renderWorkbench(parent,{controller,cards,run,gym}) {
  const {state,regionId,previous,detail} = controller.getSnapshot();
  const vm = getDetailedSettlementViewModel(state,regionId), local = state.world.sites.find(s=>s.regionId===regionId)?.detailedState;
  const observation = getLabObservation(state,regionId), vassal = getCurrentLifeMapVassal(state);
  const edit = (kind,payload) => run(()=>controller.edit(kind,payload));
  const location = select('Settlement',state.world.sites.map(s=>[s.regionId,`${s.regionId} · ${s.name} · ${s.simulationMode}${s.neutral?' · neutral':''}`]),regionId);
  location.addEventListener('change',()=>run(()=>controller.selectRegion(location.value)));
  parent.append(field('Inspect settlement',location));
  if (!vm) parent.append(el('p',`This settlement is now a ruin. Dormant population and Stock remain in the world table; last defense: ${local?.lastDefense?.result ?? 'developer-authored ruin'}.`,'lab-warning'));
  const metrics = el('div','','lab-metrics');
  for (const [key,label] of Object.entries({population:'Population',housing:'Housing',edible:'Edible Stock',demand:'Meal demand',currency:'Currency Stock',scholars:'Scholars',warriors:'Warriors',support:'Martial Support',prestige:'Prestige',prowess:'Prowess',ingenuity:'Ingenuity',chaos:'Chaos',monsters:'Monsters'})) {
    const value = observation[key];
    metrics.append(el('div',`${label}\n${value ?? '—'}${previous && previous[key] !== value ? ` (was ${previous[key] ?? '—'})` : ''}`));
  }
  metrics.append(el('div',`Retinue\n${observation.retinue.value} / ${observation.retinue.cap}\nNext: ${observation.retinue.nextPrestige ?? 'capped'}`));
  parent.append(metrics);
  if (['stock','require'].includes(controller.getSnapshot().exhibitId) && local?.practiceSlots[0]) {
    const slot=local.practiceSlots[0],traits=stockTraits(state,slot);
    const probe=planStock(state,local,0,[{traits,amount:1}]);
    parent.append(section('No self-funding: real provider-planner probe',el('p',`Slot 1 (${slot.practiceId}) holds ${slot.stock} Stock. Ask it to Consume 1 [${traits.join(' / ')}]: ${probe.ok?'funded':'unavailable'}. The consumer’s own Stock cannot pay; no hosts exist to its left. This query does not spend Stock.`)));
  }
  const tableau = el('div','','lab-tableau'); tableau.dataset.testid='lab-tableau';
  vm?.practices.forEach((p,index)=>{
    const card=cards.card(p.face,`${index+1}. ${p.label ?? 'Empty'}`);
    if (p.face) {
      card.append(el('p',`Card Tags: ${p.tags.join(', ')} · Workers: ${(p.workers?.tokens??[]).map(t=>t.specialist??'ordinary').join(', ') || 'none'}`));
      if (p.evaluation?.providers?.length) for (const provider of p.evaluation.providers) card.append(el('p',`${provider.kind === 'consume'?'Consume':'Require'} ${provider.amount}: [${provider.slotIndex+1} ${provider.practiceId}] → [${index+1} ${p.label}]`,'lab-provider'));
      if (p.evaluation?.missing) card.append(el('p',`Blocked: ${p.evaluation.missing.kind} [${p.evaluation.missing.traits.join(' / ')}] to the left`,'lab-warning'));
      if (previous?.stocks?.[index]?.stock !== undefined) card.append(el('p',`Stock ${previous.stocks[index].stock} → ${p.stock}`));
    }
    if (gym) {
      const options=[['','Empty'],...Object.values(state.gameConfig.gamepieces.practices).map(d=>[d.id,d.label])];
      const definition=select(`Practice slot ${index+1}`,options,p.practiceId??''), quality=select(`Quality slot ${index+1}`,qualities,p.tier??'bronze'), stock=input(`Stock slot ${index+1}`,p.stock??0);
      card.append(field('Practice',definition),field('Quality',quality),field('Stock',stock),button('Apply slot',()=>edit('practice',{index,id:definition.value,tier:quality.value,stock:stock.value})));
      const move=el('div','','lab-controls');
      if(index>0)move.append(button('←',()=>edit('move',{from:index,to:index-1})));
      if(index<4)move.append(button('→',()=>edit('move',{from:index,to:index+1})));
      card.append(move);
    }
    tableau.append(card);
  });
  parent.append(section('Practice tableau · exactly five slots',tableau));
  const buildings=el('div','','lab-card-grid');
  vm?.structures.filter(Boolean).forEach(s=>{
    const card=cards.card(s.face,`${s.label} · cells ${s.origin+1}–${s.origin+s.width}`);
    if(gym)card.append(button('Remove Structure',()=>edit('removeStructure',{id:s.placementId})));buildings.append(card);
  });
  const structurePanel=section(`Structures · ${vm?.usedStructureCapacity} / ${vm?.structureCapacity} cells`,buildings);
  if(gym) {
    const definition=select('Add Structure',Object.values(state.gameConfig.gamepieces.structures).map(d=>[d.id,`${d.label} (${d.footprint} cells)`]),'mudHouses');
    const quality=select('Structure quality bonus',[[0,'Base'],[1,'+25%'],[2,'+50%'],[3,'+75%']],0);
    const controls=el('div','','lab-controls');controls.append(field('Structure',definition),field('Quality',quality),button('Add Structure',()=>edit('structure',{id:definition.value,quality:quality.value})));
    structurePanel.append(controls);
  }
  parent.append(structurePanel);
  const housing=Object.values(state.gameConfig.gamepieces.structures).filter(d=>d.housing);
  if (controller.getSnapshot().exhibitId==='housing') {
    const house=select('Housing rung',housing.map(d=>[d.id,`${d.label} · ${d.housing}`]),'mudHouses');
    parent.append(section('Housing ladder',table(['Structure','Base capacity'],housing.map(d=>[d.label,d.housing])),house,button('Replace house',()=>edit('house',{id:house.value}))));
  }
  if(gym || ['scholar','five'].includes(controller.getSnapshot().exhibitId)) {
    const pop=input('Adult population',vm?.population.total??0), scholars=input('Scholar adults',vm?.specialists.scholar??0), warriors=input('Warrior adults',vm?.specialists.warrior??0);
    const controls=el('div','','lab-controls');controls.append(field('Population',pop),field('Scholars',scholars),field('Warriors',warriors),button('Set adult cohort',()=>edit('population',{population:pop.value,scholars:scholars.value,warriors:warriors.value})));
    parent.insertBefore(section('Population and staffing',el('p','This explicit fixture edit replaces the selected settlement’s age/status cohorts with adult Villagers. Scholars and Warriors are subsets, not extra people.'),controls),tableau.parentElement);
  }
  if(vassal) {
    const panel=section(`${vassal.classId} Vassal`,el('p',`Location ${vassal.locationRegionId} · Commission: ${vassal.commission?.objective ?? 'none'} · Discovery access: ${vassal.discoveryAccess ? 'next shop' : 'none'}`));
    const controls=el('div','','lab-controls');
    const prestige=input('Prestige',vassal.prestige), ingenuity=input('Ingenuity',vassal.stats.cunning), prowess=input('Prowess',vassal.stats.intelligence);
    if(gym) {
      const stats=el('div','','lab-controls');stats.append(field('Prestige',prestige),field('Ingenuity',ingenuity),field('Prowess',prowess),button('Apply Vassal stats',()=>edit('vassal',{prestige:prestige.value,ingenuity:ingenuity.value,prowess:prowess.value})));
      parent.insertBefore(section('Vassal setup',stats),tableau.parentElement);
    }
    controls.append(button('Spend 5 Prestige',()=>edit('spendPrestige',{})),button('Preview seeded shop',()=>run(()=>controller.shop())),button('Check Commission',()=>edit('commissionCheck',{})));
    if (!gym && vassal.classId === 'scholar') controls.append(button('Commission target: replace slot 5 with Foraging',()=>edit('practice',{index:4,id:'forage',stock:0,tier:'bronze'})));
    panel.append(controls,el('p','Resolved-effect experiments below call the real class effect and legality helpers. They omit Life Map travel time, Prestige rewards and danger rolls. Use Play from here for the full journey.'));
    for(const family of [...(vassal.classId==='scholar'?['commission','discovery']:['campaign']),'crisis']) {
      const options=classActionOptions(state,vassal,family)??[];
      const choice=select(`${family} option`,options.map(o=>[o.id,o.label]),options[0]?.id);
      const row=el('div','','lab-controls');row.append(field(family,choice),button('Resolve effect',()=>edit('classEffect',{family,id:choice.value})));panel.append(row);
    }
    parent.append(panel);
  }
  if(gym || controller.getSnapshot().exhibitId==='scholar') {
    const candidates=getVassalCandidatePool(state).candidates;
    const panel=section('Candidates and institutional feedback',el('p','Regenerate uses the serialized candidate RNG stream and current institutions. Reset restores the exact sequence. Selection requires no active Vassal.'));
    panel.append(table(['Candidate','Class','Settlement','Ingenuity','Prowess'],candidates.map((c,i)=>[i+1,c.classId,c.locationRegionId,c.stats.cunning,c.stats.intelligence])));
    const choice=select('Candidate',candidates.map((c,i)=>[i,`${i+1} · ${c.classId}`]),0), choose=button('Select candidate',()=>edit('candidate',{index:choice.value})); choose.disabled=!!vassal;
    panel.append(choice,choose,button('Generate next candidate pool',()=>edit('candidates',{})),button('Compare institution bonuses',()=>run(()=>controller.institutions())));parent.append(panel);
  }
  if(gym) {
    const panel=section('External actors and Chaos');
    const regions=state.world.regions.map(r=>[r.id,`${r.id} · ${r.controller}${r.monster?' · Monster':''}`]);
    const target=select('Target region',regions,regions.find(([id])=>id!==regionId)?.[0]), defense=input('Monster defense',3), age=input('Monster age in moons',3), chaos=input('Chaos power',observation.chaos);
    const row=el('div','','lab-controls');row.append(field('Region',target),field('Defense',defense),field('Age (moons)',age),button('Spawn / set Monster',()=>edit('monster',{regionId:target.value,defense:defense.value,age:age.value})),button('Remove Monster',()=>edit('monster',{regionId:target.value,remove:true})));
    const templates=select('Neutral template',NEUTRAL_TEMPLATES.map((t,i)=>[i,t.name]),0);
    const second=el('div','','lab-controls');second.append(field('Neutral template',templates),button('Spawn neutral in target',()=>edit('neutral',{regionId:target.value,template:templates.value})),button('Connect target to settlement',()=>edit('connection',{regionId:target.value})),button('Ruin selected settlement',()=>edit('ruin',{})),field('Chaos',chaos),button('Set Chaos',()=>edit('chaos',{value:chaos.value})));
    panel.append(row,second);parent.append(panel);
  }
  parent.append(section('World and recent outcomes',table(['Region','Owner / mode','Population','Hosted Stock','Monster'],state.world.regions.map(r=>{
    const site=state.world.sites.find(s=>s.regionId===r.id);
    return [r.id,`${r.controller} / ${site?.simulationMode??'frontier'}`,site?.detailedState?Object.values(site.detailedState.populationByClass).reduce((n,c)=>n+c.children+c.adults+c.eldersByAge.reduce((sum,e)=>sum+e.count,0),0):'—',site?.detailedState?.practiceSlots.filter(Boolean).map(p=>`${p.practiceId}: ${p.stock}`).join(', '),r.monster?`Defense ${r.monster.defense}, age ${r.monster.ageMoons}`:'—'];
  })),details('Last meal and defense',{meal:observation.meal,defense:observation.lastDefense}),details('History and current observations',observation),details('Recent activation trace',(vm?.activationTrace??[]).slice(-12))));
  if(detail?.kind==='projection') parent.append(section(detail.equal?'Exact projection match':'Projection mismatch',el('p',`Both paths ended at t=${detail.endSec}. All serialized fields compared, including RNG, cohorts and spatial outcomes.`),table(['Field','Authoritative','Projection'],detail.differences.map(d=>[d.path,d.authoritative,d.projection])),details('Compared summaries',{authoritative:{tSec:detail.authoritative.tSec,rng:detail.authoritative.rng,history:detail.authoritative.civilization.history},projection:{tSec:detail.projection.tSec,rng:detail.projection.rng,history:detail.projection.civilization.history}})));
  if(detail?.kind==='shop') parent.append(section('Seeded shop preview',el('p',`Discovery access: ${!!detail.node.discoveryAccess}`),table(['Offer','Quality','Prestige / phases'],detail.node.offers.map(o=>[o.label,o.intervention?.resultingTier??o.intervention?.tier,`${o.basePrestigeCost} / ${o.basePhaseCost}`])),details('Actual generated offers',detail.node.offers)));
  if(detail?.kind==='institutions') parent.append(section('Institutions: same RNG comparison',el('p','Only Structures differ between these two candidate-generation previews. Neither preview changes the fixture or its RNG.'),table(['Class','Settlement','Ingenuity without → with','Prowess without → with'],detail.rows.map(r=>[r.classId,r.regionId,`${r.baseIngenuity} → ${r.ingenuity}`,`${r.baseProwess} → ${r.prowess}`]))));
  if(detail) parent.lastElementChild.dataset.labResult = 'true';
}
