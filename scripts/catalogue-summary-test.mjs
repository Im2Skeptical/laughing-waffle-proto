import assert from 'node:assert/strict';
import { summarizeLabCatalogue, compareLabStock } from '../src/model/dev-lab/catalogue-summary.js';
import { getLabCatalogue, filterLabCatalogue } from '../src/model/dev-lab/catalogue.js';
import { createNewGameState } from '../src/model/new-game.js';
import { serializeGameState } from '../src/model/state.js';
import { createCardReviewController } from '../src/controllers/card-review-controller.js';

const game = createNewGameState(83);
const before = JSON.stringify(serializeGameState(game));
const catalogue = getLabCatalogue(game);
const filtered = filterLabCatalogue(catalogue,{category:'practice',pool:['common','warrior']});
assert.equal(filtered.length,107,'two selected pools are a union');
assert.ok(filtered.every(entry=>['common','warrior'].includes(entry.pool)));
assert.equal(filterLabCatalogue(catalogue,{category:'practice',pool:[]}).length,166,'empty selection means All');
assert.equal(filterLabCatalogue(catalogue,{category:'practice',pool:'warrior'}).length,72,'single-pool callers still work');
const summary = summarizeLabCatalogue(filtered);
assert.equal(summary.cardCount,107,'summary includes all pages');
assert.equal(summary.practiceCount,107);
assert.equal(summary.structureCount,0);
assert.ok(summary.consumed.some(row=>row.traits.includes('Arms') && row.timing==='Birth phase'
  && row.sources.some(source=>source.key==='practice:warriorTraining' && source.amount===1)));
assert.equal(JSON.stringify(serializeGameState(game)),before,'filtering and summarizing preserve state and RNG');

const pick = id => catalogue.find(entry=>entry.id===id && entry.category==='practice');
const seasonal = summarizeLabCatalogue([pick('dryFarming')]);
assert.deepEqual(seasonal.produced.map(row=>[row.timing,row.amount]),[['Autumn season',6],['Summer season',2]],'seasonal quantities are separate');
assert.deepEqual(seasonal.produced[0].traits,['Edible','Grain'],'multi-trait production is one Stock amount');
const corpse = summarizeLabCatalogue([pick('corpseGarden')]);
assert.equal(corpse.produced.find(row=>row.timing==='Spring season').amount,2,'activation override precedes generic amount');
assert.equal(corpse.produced.find(row=>row.timing==='Death phase').amount,1);
assert.equal(corpse.produced.find(row=>row.timing==='Death phase').variable,false,'Spring-only scaling does not leak to Death');
assert.equal(corpse.produced.find(row=>row.timing==='Spring season').variable,true);
const variable = summarizeLabCatalogue([pick('taxAssessment')]);
assert.equal(variable.produced[0].amount,0);
assert.equal(variable.produced[0].variable,true,'zero-base scaling production remains visible');
const charge = summarizeLabCatalogue([pick('smelting')]);
assert.equal(charge.produced[0].timing,'Per Discharge');
assert.deepEqual(charge.consumed,[],'Charge event traits are not Stock costs');
assert.ok(charge.produced[0].sources[0].notes.some(note=>note.includes('Charge to Discharge')));
const passive = summarizeLabCatalogue([pick('patrolling')]);
assert.equal(passive.consumed[0].timing,'Per supplied defense response');
assert.equal(passive.required[0].timing,'While supplied');

const entry = (id,def) => ({category:'practice',id,label:id,def:{activation:{type:'birth'},stockTraits:['Currency'],...def}});
const alternatives = summarizeLabCatalogue([
  entry('a',{effects:[{op:'generateStock',amount:2},{op:'generateStock',amount:3}],consume:[{traits:['Arms','Tool'],amount:2}]}),
  entry('b',{effects:[{op:'generateStock',amount:4}],consume:[{traits:['Tool','Arms'],amount:1}]}),
]);
assert.equal(alternatives.produced[0].amount,9);
assert.equal(alternatives.produced[0].sources.length,2,'multiple effects do not inflate card count');
assert.equal(alternatives.produced[0].sources.find(source=>source.label==='a').amount,5);
assert.equal(alternatives.consumed.length,1,'input alternative order does not split equivalent groups');
assert.equal(alternatives.consumed[0].amount,3,'OR alternatives counted once');
assert.deepEqual(alternatives.consumed[0].traits,['Arms','Tool']);
const construction = summarizeLabCatalogue([{category:'structure',id:'tower',label:'Tower',def:{construction:{cycles:3,activation:{type:'housing'},consume:[{traits:['Stone','Timber'],amount:2}]}}}]);
assert.equal(construction.construction[0].amount,6,'construction is per-cycle cost times cycles');
assert.deepEqual(construction.consumed,[],'construction totals never mingle with recurring costs');
assert.ok(construction.construction[0].sources[0].notes.includes('2 per successful Housing cycle, 3 cycles.'));
assert.deepEqual(summarizeLabCatalogue([]),{cardCount:0,practiceCount:0,structureCount:0,produced:[],consumed:[],required:[],construction:[]});
assert.equal(summarizeLabCatalogue(catalogue.filter(entry=>entry.category==='candidate')).cardCount,0,'non-card templates excluded');

// The comparison condenses timings to one row per trait without treating
// seasonal variants as multiple cards or OR costs as mandatory demand.
const grain = compareLabStock(seasonal).find(row=>row.trait==='Grain');
assert.deepEqual([grain.produced.min,grain.produced.max],[2,6],'all timings uses the per-card seasonal range, not 8');
assert.equal(grain.produced.sources.length,1);
assert.equal(grain.produced.cardCount,1,'seasonal activations count as one producer card');
assert.equal(grain.produced.sources[0].timings.length,2);
const summer = compareLabStock(seasonal,'Summer season').find(row=>row.trait==='Grain');
assert.deepEqual([summer.produced.min,summer.produced.max],[2,2]);
assert.equal(summer.produced.sources[0].timings.length,1);
assert.equal(compareLabStock(seasonal,'Birth phase').find(row=>row.trait==='Grain').produced.sources.length,0);
const alternativeArms = compareLabStock(alternatives).find(row=>row.trait==='Arms');
assert.equal(alternativeArms.consumed.max,0,'alternative Arms/Tool cost is not a mandatory Arms cost');
assert.equal(alternativeArms.consumed.flexible.max,3);
assert.equal(compareLabStock(alternatives).find(row=>row.trait==='Currency').produced.max,9);
assert.equal(compareLabStock(alternatives).find(row=>row.trait==='Currency').produced.cardCount,2,'multiple production effects count each card once');
assert.equal(alternativeArms.consumed.cardCount,2,'alternative-only consumers are counted');
assert.equal(compareLabStock(construction,'Birth phase').find(row=>row.trait==='Stone').construction.flexible.max,6,'construction ignores activation timing and keeps alternatives separate');
assert.deepEqual(compareLabStock(summarizeLabCatalogue([])),[]);
const comparison = compareLabStock(summary);
assert.equal(new Set(comparison.map(row=>row.trait)).size,comparison.length,'only one comparison row per trait');
const inventoryBefore = JSON.stringify(summary);
compareLabStock(summary,'Birth phase');
assert.equal(JSON.stringify(summary),inventoryBefore,'comparison does not mutate the inventory');

const capabilities = summarizeLabCatalogue([
  entry('smallFood',{stockTraits:['Edible'],effects:[{op:'generateStock',amount:1}]}),
  entry('largeFood',{stockTraits:['Edible'],activation:{type:'season',seasonKeys:['summer','autumn']},effects:[{op:'generateStock',amount:100},{op:'generateStock',amount:3}]}),
  entry('conditionalFood',{stockTraits:['Edible'],effects:[{op:'generateStock',amount:0,populationBand:60}]}),
  entry('traitOnly',{stockTraits:['Edible'],effects:[]}),
  entry('directAndFlexible',{consume:[{traits:['Edible'],amount:2},{traits:['Edible'],amount:3},{traits:['Edible','Grain'],amount:5}]}),
  entry('flexibleOnly',{consume:[{traits:['Edible','Grain'],amount:4}]}),
]);
const edible = compareLabStock(capabilities).find(row=>row.trait==='Edible');
assert.equal(edible.produced.cardCount,3,'three capable cards count as 3, independent of quantities, seasons and multiple effects');
assert.equal(edible.produced.max,104,'card counts preserve the existing Stock quantity');
assert.equal(edible.produced.variable,true,'zero-base conditional producers retain their capability');
assert.equal(edible.consumed.cardCount,2,'a card with both mandatory and alternative inputs counts once');
assert.equal(edible.consumed.max,5);
assert.equal(edible.consumed.flexible.max,9);
const birthEdible=compareLabStock(capabilities,'Birth phase').find(row=>row.trait==='Edible');
assert.equal(birthEdible.produced.cardCount,2,'card counts follow selected timing');
const summerEdible=compareLabStock(capabilities,'Summer season').find(row=>row.trait==='Edible');
assert.equal(summerEdible.produced.cardCount,1);
assert.equal(summerEdible.consumed.cardCount,0,'a timing without matching consumers has zero cards');

// Use the same projection as Zoo's With edits mode; no fixture changes.
const live = game.gameConfig.gamepieces;
const saved = new Map();
const review = createCardReviewController({storage:{getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)},resolveLive:(kind,id)=>live[kind==='practice'?'practices':'structures'][id]});
review.flag('practice','warriorTraining',live.practices.warriorTraining);
review.edit('practice','warriorTraining',['consume',0,'amount'],4);
const projection = review.applyTo(live);
const editedCatalogue = getLabCatalogue({...game,gameConfig:{...game.gameConfig,gamepieces:projection.gamepieces}});
const edited = summarizeLabCatalogue(filterLabCatalogue(editedCatalogue,{category:'practice',pool:['common','warrior'],search:'warriorTraining'}));
assert.equal(edited.cardCount,1);
assert.equal(edited.consumed[0].amount,4,'summary reads reviewed input amounts');
assert.equal(compareLabStock(edited).find(row=>row.trait==='Arms').consumed.max,4,'comparison reads reviewed quantities');
assert.equal(compareLabStock(edited).find(row=>row.trait==='Arms').consumed.cardCount,1,'reviewed quantities do not inflate card counts');
assert.equal(summarizeLabCatalogue([pick('warriorTraining')]).consumed[0].amount,1,'live summary retains live amounts');
assert.equal(JSON.stringify(serializeGameState(game)),before,'review projection and analysis leave the fixture unchanged');
console.log('[catalogue-summary] OK: combined pools, all-page quantities, seasonal/Charge timing, multi-trait Stock, alternatives, variable output, passive supply, construction totals and edited definitions');
