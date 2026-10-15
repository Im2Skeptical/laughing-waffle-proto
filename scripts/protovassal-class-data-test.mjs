import assert from 'node:assert/strict';
import { BASE_STATS, FOUNDER_CLASSES, STAT_ICONS, founderTooltipSpec } from '../src/views/protovassal-class-data.js';
import { normalizeTooltipSpec } from '../src/views/tooltip-spec.js';
import { getVassalStatPresentation } from '../src/model/vassal-life-map/selectors.js';

const baseNames = BASE_STATS.map(stat => stat.name);
assert.deepEqual(Object.keys(FOUNDER_CLASSES).sort(), ['scholar', 'warrior'], 'both founder classes are described');
for (const [classId, data] of Object.entries(FOUNDER_CLASSES)) {
  assert.ok(baseNames.includes(data.replaces), `${classId} replaces one of the base attributes`);
  assert.ok(STAT_ICONS[data.stat] && baseNames.every(name => STAT_ICONS[name]), `${classId} attributes all have icons`);
  assert.equal(data.effects.length, 2, `${classId} lists two class attribute effects`);
  assert.ok(data.abilities.length >= 1 && data.abilities.every(ability => ability.id && ability.name && ability.summary));
  for (const name of [...baseNames, data.stat]) {
    const spec = normalizeTooltipSpec(founderTooltipSpec('stat', name, classId));
    assert.ok(spec.title && spec.sections.length > 0, `${classId} ${name} tooltip has titled content`);
    assert.ok(!JSON.stringify(spec).includes('[object Object]'), `${classId} ${name} tooltip renders as text`);
  }
  for (const ability of data.abilities) {
    const spec = normalizeTooltipSpec(founderTooltipSpec('ability', ability.id, classId));
    assert.ok(spec.sections.length > 0 && spec.accentColor === data.accent, `${classId} ${ability.id} tooltip is class coloured`);
  }
}
const locked = normalizeTooltipSpec(founderTooltipSpec('locked', 'locked:2', null));
assert.ok(locked.title && locked.sections.length > 0 && !JSON.stringify(locked).includes('[object Object]'), 'locked slot tooltip has hint text');
assert.equal(founderTooltipSpec('stat', 'Cunning', 'warrior').pin, true, 'founder tooltips are tap-pinnable');
// The picker's replaced / class attribute names must match what the model calls them in play.
for (const [classId, data] of Object.entries(FOUNDER_CLASSES)) {
  const replacedId = BASE_STATS.find(stat => stat.name === data.replaces).statId;
  const presented = getVassalStatPresentation({ classId, stats: { cunning: 1, intelligence: 1 } }, replacedId);
  assert.equal(presented.label, data.stat, `${classId} picker class attribute matches the model label`);
}
console.log('protovassal class data ok');
