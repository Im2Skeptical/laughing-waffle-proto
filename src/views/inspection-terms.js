// Read-only reference copy. The selected card's rules remain authoritative;
// these definitions explain its vocabulary without implementing game behavior.
import { RESOURCE_ART_IDS } from './chronicle-art.js';
const TERMS = {
  Stock: 'Resources held by a Practice. Each unit carries all of its host’s Stock traits. Produce adds units; Consume spends matching units. Stock capacity limits how many can be held.',
  'Stock traits': 'Traits describe what Stock can satisfy. A unit can carry several traits at once. Bone, Timber, Fuel and Edible are examples. Inputs and Charge triggers look for matching traits.',
  'Stock capacity': 'The maximum Stock a Practice can hold. Production stops at capacity. Consume can free space for future Activation effects. Structures can increase capacity on the Practices described in their rules.',
  Activation: 'A Practice’s rules event: its grouped effects resolve when their requirements are met. Cycle provides a timing; Charge provides an event meter. An Activation can Produce Stock, Gain Research, or have other effects.',
  Cycle: 'A Practice that Activates at its indicated timing, such as a season or Food phase. Its requirements must be met each time. The worker multiplier increases Stock production when the Practice produces Stock.',
  Charge: 'Qualifying events advance a Practice’s private meter. When filled and legal, it Activates automatically. Charge is not Stock. Workers multiply incoming Charge rather than Activation output. Read the selected Practice’s trigger for its qualifying events.',
  Worker: 'An occupied socket shows staffing. The worker multiplier affects Stock production on Cycle Practices and incoming Charge on Charge Practices. Specialist staffing can also satisfy requirements.',
  'Worker multiplier': 'The plate shows effective staffing, including worker effectiveness. It increases Stock production on Cycle Practices that produce Stock, or incoming Charge on Charge Practices. It does not multiply every Activation effect.',
  Scholar: 'A specialist. Scholar workers can meet Practice staffing requirements and add the Knowledge classification. Structure requirements count local Scholars; read the card for the required number.',
  Warrior: 'A specialist associated with Martial Support and Defense. Read the selected card for its staffing, population, or Support requirement.',
  Neutral: 'A class-neutral gamepiece. Its rules and requirements describe who can use it.',
  Practice: 'A settlement gamepiece with a Cycle or Charge mechanic and an Activation outcome. Stock, workers and requirements belong to the individual Practice.',
  Structure: 'A gamepiece occupying the settlement’s construction strip. Its ongoing bonuses apply while its stated requirements are met. It has no Cycle or Charge meter.',
  Knowledge: 'A Practice classification used by other rules. A tagged Practice or one staffed by a Scholar can count as Knowledge. Read the referring card’s trigger for the event it watches.',
  Ancestral: 'A card classification associated with inherited traditions. It is separate from Stock traits. The selected card’s rules explain its effects.',
  Research: 'An abstract value gained by the realm, separate from Stock held on a Practice. Gain Research and Produce Stock can be separate effects of the same Activation.',
  Produce: 'Add Stock to a Practice, up to Stock capacity. Each unit carries its host’s Stock traits. Production can cause another Practice to Charge when its trigger matches.',
  Consume: 'Spend matching Stock for a recipe. Supply comes from local hosts first, then adjacent connected player settlements. Require checks Stock without spending it.',
  Require: 'A condition that must be met for Activation. Required Stock is checked and kept; Consume spends it instead. A full Charge meter can wait until requirements are legal.',
  Death: 'A death can Charge a Practice watching for that event. The selected Practice’s trigger gives the relevant location and conditions.',
  Quality: 'The jewel and frame identify quality. Quality can improve Practice Stock capacity and worker sockets, or scale numeric Structure bonuses. The enlarged card shows its current values.',
  'Housing capacity': 'Room for population. Structures add ongoing Housing capacity; Practice effects may provide Housing for a stated phase.',
  Housing: 'Room needed by the settlement’s population. Read the selected card for its amount and duration.',
  'Martial Support': 'Strength contributed by Warriors and supplied Practices. Structures may add bonuses. Its use and scope depend on the stated martial action.',
  'Chaos resistance': 'Resistance provided for the duration stated by the Practice’s Activation effect.',
  'Specialist training': 'An Activation that trains the named specialist class. Read the rules for its amount and requirements.',
  Development: 'A bonus to a future Vassal candidate. Read the rules for the affected class, amount and cap.',
  Prestige: 'The candidate-development symbol. On these Practice faces it identifies a bonus to a future candidate; the rules name the affected class and amount.',
  Support: 'Martial Support or a banked Support contribution. The rules specify which action can use it and any cap.',
  Preview: 'A local preview bonus. Read the card’s rules for its amount and cap.',
  'Meal saving': 'An effect that reduces Edible Stock needed at the settlement’s next meal.',
  'Construction footprint': 'The horizontal cells occupied in the construction strip. This capacity is separate from the settlement’s five Practice slots.',
  'Stock capacity bonus': 'The outlined Stock box and plus numeral identify added Stock capacity on matching Practices. The Structure itself does not hold Stock. Matching contributions add before final capacity rounds down.',
  Chaos: 'A source of pressure on settlements. Read the selected card for the event or condition that refers to Chaos.',
  Monster: 'A threat in a region. Practice triggers distinguish pressure from destruction; the selected rules give the qualifying event.',
  Defense: 'A settlement’s defensive strength. The selected rules specify the contribution or successful-defense trigger.',
  Danger: 'A survived Danger event can Charge a Practice that watches for it.',
  Campaign: 'A won Campaign can Charge a Practice that watches for that event.',
  Challenge: 'A completed Challenge can Charge a Practice that watches for that event.',
  Trade: 'A card classification or external Trade event. Read the selected rules for its use; a Trade Stock trait is a separate property of Stock.',
};
const ALIASES = {Activate:'Activation', Activates:'Activation', Workers:'Worker', Scholars:'Scholar', Warriors:'Warrior', Requires:'Require'};

export function getInspectionTerms(face, symbols = []) {
  const terms = {...TERMS};
  const traits = new Set([...RESOURCE_ART_IDS.filter(id=>id.startsWith('stock-')).map(id=>id[6].toUpperCase()+id.slice(7)),...(face.stockTraits??[]),
    ...(face.inputs??[]).flatMap(input=>input.traits),...(face.chargeTriggers??[]).map(trigger=>trigger.trait).filter(Boolean),
    ...(face.structureBonuses??[]).flatMap(bonus=>bonus.traits)]);
  for (const trait of traits) terms[trait] ??= `A Stock trait. Stock with ${trait} can satisfy matching inputs or Charge triggers. One unit can carry several Stock traits.`;
  if(traits.has('Knowledge'))terms.Knowledge+=' Knowledge can also be a Stock trait; Stock carrying it satisfies matching Stock inputs or triggers.';
  for (const tag of face.tags??[]) terms[tag] ??= 'A card classification. It is separate from Stock traits; the selected card’s rules describe its effects.';
  for (const season of ['Spring','Summer','Autumn','Winter']) terms[season] = `One of the four seasons. A Cycle Practice may Activate in ${season}; its Activation line gives the outcome at that timing.`;
  for (const phase of ['Birth','Food','Housing','Faith','Migration','Death']) terms[`${phase} phase`] = `A named moon phase. A Cycle Practice with this timing checks its requirements and Activates here.${phase==='Food'?' The settlement also uses Edible Stock for its meal.':''}`;
  for (const symbol of symbols) terms[symbol.name] ??= 'A symbol on this gamepiece. Read the selected card’s rules for its effect, scope and requirements.';
  return {terms, aliases:ALIASES};
}
