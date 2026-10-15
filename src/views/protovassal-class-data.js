// Founder class picker copy and tooltip specs. Pure data (no Pixi) so the picker
// view, its probe and tests read the same rules text. Numbers mirror
// docs/vassal-selection-prototype.md and getVassalStatPresentation().

// Face art for each stat, from the resource-language atlas the HUD already uses.
export const STAT_ICONS = Object.freeze({
  Cunning: 'prestige', Intelligence: 'stock-instrument', Wisdom: 'faith', Effectiveness: 'phase',
  Prowess: 'stock-arms', Ingenuity: 'stock-knowledge',
});
// Same four stats, in the order every Vassal lists them.
export const BASE_STATS = Object.freeze([
  Object.freeze({ name: 'Cunning', statId: 'cunning' }),
  Object.freeze({ name: 'Intelligence', statId: 'intelligence' }),
  Object.freeze({ name: 'Wisdom', statId: 'wisdom' }),
  Object.freeze({ name: 'Effectiveness', statId: 'effectiveness' }),
]);

const section = (title, text) => ({ type: 'paragraph', title, text });

const STAT_TIPS = Object.freeze({
  Cunning: { subtitle: 'Base attribute', lines: [
    section('EACH POINT', '+1 Prestige per completed node, on top of 3 base.'),
    section('SCHOLARS', 'Replace this with Ingenuity and keep the base income.')] },
  Intelligence: { subtitle: 'Base attribute', lines: [
    section('EACH POINT', '8% off Prestige costs, up to 60%. Costs round up.'),
    section('WARRIORS', 'Replace this with Prowess and lose the discount.')] },
  Wisdom: { subtitle: 'Base attribute', lines: [
    section('EACH POINT', '+1 EXP per completed node, on top of 2 base.'),
    section('BOTH CLASSES', 'Keep this attribute.')] },
  Effectiveness: { subtitle: 'Base attribute', lines: [
    section('EACH POINT', '8% off time costs, up to 60%. Costs round up.'),
    section('SCHOLARS', 'Also discounts Delve.')] },
  Prowess: { subtitle: 'Class attribute · replaces Intelligence', lines: [
    section('EACH POINT', '+1 global Martial Force.'),
    section('RISK SUCCESS', '+15% of the base chance per point: 50% becomes 57.5% at 1 and 65% at 2. Capped at 100%.'),
    section('LOSES', 'Intelligence’s 8% Prestige-cost discount. Natural mortality is a separate roll.')] },
  Ingenuity: { subtitle: 'Class attribute · replaces Cunning', lines: [
    section('EACH POINT', '+5% shop-quality chance and +1 Research on DISCOVERY.'),
    section('ABOVE 100%', 'Surplus rolls for another tier: 125% is one sure tier and a 25% chance of a second, up to Diamond. Prices stay the same.'),
    section('LOSES', 'Cunning’s extra Prestige per node; the 3 base stays.')] },
});
const ABILITY_TIPS = Object.freeze({
  retinue: { title: 'Personal Retinue', subtitle: 'Class ability', lines: [
    section('EFFECT', '+1 global Martial Force per 10 Prestige you hold.'),
    section('LIMITS', 'No population cap. Spending Prestige lowers the bonus.'),
    section('NOTE', 'Supplied Retinue improvements add Force directly.')] },
  risk: { title: 'Risk reward', subtitle: 'Class ability', lines: [
    section('EFFECT', '+15 Prestige on every successful RISK, on top of the action reward.'),
    section('APPLIES TO', 'All risky node actions, including Relic searches.'),
    section('NOTE', 'Protection after a failed roll does not count as success.')] },
  commission: { title: 'Commissions', subtitle: 'Class ability', lines: [
    section('EFFECT', 'Always keep one Commission underway. Finish it through your nodes, then pick the next of 3.'),
    section('REWARDS', 'Install a Practice 20 · Finish a Structure 40 · Acquire a Relic 60 Prestige.'),
    section('NOTE', 'Inheritance and autonomous actions do not count.')] },
  delve: { title: 'Delve', subtitle: 'Class ability', lines: [
    section('EFFECT', 'Spend 10 base years to refresh a shop’s offers, less Effectiveness. No Prestige cost.'),
    section('WHEN', 'Repeatable before purchases are staged.'),
    section('NOTE', 'Time, aging and mortality resolve before new offers appear.')] },
});

export const FOUNDER_CLASSES = Object.freeze({
  warrior: Object.freeze({
    name: 'WARLORD', unlocks: 'Warrior', flavour: 'Their courage outlives their name.',
    replaces: 'Intelligence', stat: 'Prowess', statKey: 'intelligence',
    effects: ['+1 Martial Force per point', '15% increased RISK success chance per point'],
    abilities: Object.freeze([
      { id: 'retinue', name: 'Personal Retinue', summary: '+1 Martial Force per 10 held Prestige', art: 'vigil' },
      { id: 'risk', name: 'Risk reward', summary: '+15 Prestige on RISK success', art: 'crisis' },
    ]),
    // Palette: ember red on a banner of dark oxblood.
    accent: 0xe08a64, deep: 0x3b1f1d, glow: 0xc4573f,
  }),
  scholar: Object.freeze({
    name: 'PHILOSOPHER', unlocks: 'Scholar', flavour: 'A patient mind leaves its mark.',
    replaces: 'Cunning', stat: 'Ingenuity', statKey: 'cunning',
    effects: ['+5% shop-quality chance per point', '+1 Research on DISCOVERY per point'],
    abilities: Object.freeze([
      { id: 'commission', name: 'Commissions', summary: 'Gain Prestige each Commission completion', art: 'patronage' },
      { id: 'delve', name: 'Delve', summary: 'Spend 10 years to reroll shop offers', art: 'study' },
    ]),
    accent: 0x9fb8ec, deep: 0x1b2438, glow: 0x6a86c9,
  }),
});

export const LOCKED_SLOT_TIP = Object.freeze({
  title: 'Locked tradition', subtitle: 'Future founding class',
  lines: [section('UNLOCK', 'Another founding class joins a later run. Begin with a Warlord or Philosopher for now.')],
});

// A tooltip spec for the shared tooltip view (tooltip-spec.js). `scale` is large
// because the canvas is drawn at 2424 px and shrinks on phones.
export function founderTooltipSpec(kind, id, classId) {
  const base = { sourceKind: 'founderPicker', sourceId: id, maxWidth: 300, scale: 2.6, pin: true };
  if (kind === 'locked') return { ...base, title: LOCKED_SLOT_TIP.title, subtitle: LOCKED_SLOT_TIP.subtitle, sections: LOCKED_SLOT_TIP.lines, accentColor: 0x9a9585 };
  const data = FOUNDER_CLASSES[classId];
  if (kind === 'ability') {
    const tip = ABILITY_TIPS[id];
    return { ...base, title: tip.title, subtitle: tip.subtitle, sections: tip.lines, accentColor: data.accent };
  }
  const tip = STAT_TIPS[id];
  const classStat = id === data.stat;
  const lines = id === data.replaces
    ? [...tip.lines.slice(0, 1), section('THIS CLASS', `Replaced by ${data.stat}.`)] : tip.lines;
  return { ...base, title: id, subtitle: id === data.replaces ? 'Replaced attribute' : tip.subtitle, sections: lines,
    accentColor: classStat ? data.accent : 0xc3a469 };
}
