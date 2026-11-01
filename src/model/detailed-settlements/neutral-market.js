import { getDetailedPracticeDef } from '../game-config.js';
import { stockCapacity, stockTraits } from './stock.js';

// Neutral inventories are authored markets, independent of player gamepieces.
export const NEUTRAL_MARKETS = Object.freeze([
  [{ id: 'food', label: 'Provisions', traits: ['Edible'], price: 1, capacity: 12, replenishment: 3 }],
  [{ id: 'food', label: 'Provisions', traits: ['Edible'], price: 1, capacity: 12, replenishment: 3 },
    { id: 'timber', label: 'Timber', traits: ['Timber', 'Fuel', 'Construction'], price: 1, capacity: 10, replenishment: 2 }],
  [{ id: 'food', label: 'Provisions', traits: ['Edible'], price: 1, capacity: 12, replenishment: 3 },
    { id: 'stone', label: 'Stone', traits: ['Stone', 'Construction'], price: 2, capacity: 10, replenishment: 2 },
    { id: 'ore', label: 'Ore', traits: ['Ore'], price: 2, capacity: 8, replenishment: 2 },
    { id: 'metal', label: 'Metal', traits: ['Metal'], price: 3, capacity: 6, replenishment: 1 }],
  [{ id: 'food', label: 'Provisions', traits: ['Edible'], price: 1, capacity: 18, replenishment: 4 },
    { id: 'timber', label: 'Timber', traits: ['Timber', 'Fuel', 'Construction'], price: 1, capacity: 12, replenishment: 3 },
    { id: 'stone', label: 'Stone', traits: ['Stone', 'Construction'], price: 2, capacity: 12, replenishment: 2 },
    { id: 'ore', label: 'Ore', traits: ['Ore'], price: 2, capacity: 10, replenishment: 2 }],
]);

export function replenishNeutralMarkets(state) {
  for (const site of state.world.sites) {
    if (!site.neutral || site.simulationMode !== 'detailed') continue;
    for (const stock of site.neutral.stocks) {
      stock.stock = Math.min(stock.capacity, stock.stock + stock.replenishment);
    }
  }
}

export function validateNeutralMarket(site) {
  const errors = [];
  if(site.town){
    const town=site.town;
    if(!Object.hasOwn(TOWN_PROFILES,town.type)||typeof town.activated!=='boolean'
      ||!town.activated&&!site.neutral&&site.simulationMode!=='ruin'||town.activated&&!town.market)errors.push(`site ${site.id} has invalid town lifecycle`);
    const market=site.neutral??town.market;
    if(!Array.isArray(market?.practices)||market.practices.length<1||market.practices.length>5
      ||market.practices.some(id=>typeof id!=='string'))errors.push(`site ${site.id} has invalid town recipe`);
    if(!site.neutral&&town.market)errors.push(...validateNeutralMarket({id:site.id,neutral:town.market}));
  }
  const neutral = site.neutral;
  if (!neutral) return errors;
  if (!Number.isInteger(neutral.currencyStock) || neutral.currencyStock < 0
      || !Number.isInteger(neutral.housing) || neutral.housing < 0
      || !Array.isArray(neutral.stocks) || !neutral.stocks.length) errors.push(`site ${site.id} has invalid neutral market`);
  const ids = new Set();
  for (const stock of Array.isArray(neutral.stocks) ? neutral.stocks : []) {
    if (!stock || typeof stock.id !== 'string' || ids.has(stock.id)
        || typeof stock.label !== 'string' || !Array.isArray(stock.traits) || !stock.traits.length
        || stock.traits.some(trait=>typeof trait !== 'string')
        || !Number.isInteger(stock.stock) || stock.stock < 0 || stock.stock > stock.capacity
        || !Number.isInteger(stock.capacity) || stock.capacity < 1
        || !Number.isInteger(stock.price) || stock.price < 1
        || !Number.isInteger(stock.replenishment) || stock.replenishment < 0) errors.push(`site ${site.id} has invalid neutral Stock`);
    ids.add(stock?.id);
  }
  if (!site.town?.activated && (site.detailedState?.practiceSlots?.some(Boolean) || site.detailedState?.structureSlots?.some(Boolean))) errors.push(`site ${site.id} neutral market cannot install gamepieces`);
  return errors;
}

const TOWN_PROFILES = {
  forager: {name:'Forager Hamlet',population:18,defense:3,practices:['forage','barter'],market:0},
  grain: {name:'Grain Village',population:30,defense:4,practices:['dryFarming','fm_handQuern'],market:0},
  timber: {name:'Timber Village',population:24,defense:4,practices:['logging','barter'],market:1},
  quarry: {name:'Quarry Village',population:30,defense:5,practices:['fm_rubblePicking','barter'],market:2},
  market: {name:'Market Town',population:60,defense:8,practices:['forage','dryFarming','barter'],market:3},
};
export function createTownMarket(type) {
  const p=TOWN_PROFILES[type];
  let stocks=JSON.parse(JSON.stringify(NEUTRAL_MARKETS[p.market]));
  if(type==='grain')stocks.push({id:'grain',label:'Grain',traits:['Grain','Edible'],price:1,capacity:12,replenishment:3});
  if(type==='quarry')stocks=stocks.filter(s=>['stone','ore'].includes(s.id));
  return {template:p.name,defense:p.defense,housing:p.population,currencyStock:0,
    practices:[...p.practices],stocks:stocks.map(s=>({...s,stock:Math.floor(s.capacity/2)}))};
}
export function transitionTown(state,site,faction) {
  if(!site?.town)return;
  if(faction==='frontier') {
    if(!site.neutral)site.neutral=JSON.parse(JSON.stringify(site.town.market));
    return;
  }
  if(!site.neutral&&!site.town.activated&&site.town.market)site.neutral=site.town.market;
  if(!site.neutral)return;
  const market=site.neutral,settlement=site.detailedState;
  delete site.neutral;
  site.town.market=market;
  if(site.town.activated)return;
  site.town.activated=true;
  settlement.practiceSlots=market.practices.map(practiceId=>{
    const def=getDetailedPracticeDef(state,practiceId);
    return {practiceId,tier:'bronze',instanceId:`institution:${state.civilization.nextPracticeInstanceId++}`,charge:0,work:0,
      ...(def.category==='influence'?{allegiance:faction}:{stock:0})};
  });
  while(settlement.practiceSlots.length<5)settlement.practiceSlots.push(null);
  settlement.structureSlots[0]={structureId:'timberHouse',placementId:`${site.regionId}:housing`,origin:0,width:1};
  for(const goods of market.stocks){
    for(const slot of settlement.practiceSlots){
      if(!slot||!('stock' in slot)||!goods.traits.some(t=>stockTraits(state,slot).includes(t)))continue;
      const amount=Math.min(goods.stock,Math.max(0,stockCapacity(state,settlement,slot)-slot.stock));
      slot.stock+=amount;goods.stock-=amount;
    }
    goods.stock=0;
  }
}
