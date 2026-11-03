import { mechanicEffect, mechanicEvent } from '../defs/mechanics.js';

const listFilters = ['traitsAny', 'tagsAny', 'actionKindsAny'];
const flags = ['scholarStaffed', 'premature', 'martial'];
const textFilters = ['faction', 'controller', 'pool', 'classId'];
const strings = value => Array.isArray(value) && value.length > 0 && value.every(v => typeof v === 'string' && v.trim());

// Shared by authored definitions, captured run config and review/import paths.
// Validates supported references; subsystem validators still own full recipes.
export function validateGamepieceMechanics(def) {
  const errors = [];
  if (def?.effects !== undefined && !Array.isArray(def.effects)) return ['effects must be an array'];
  if (def?.modifiers !== undefined && !Array.isArray(def.modifiers)) return ['modifiers must be an array'];
  for (const effect of def?.effects ?? []) {
    const binding = mechanicEffect(effect?.op);
    if (!binding || binding.status !== 'implemented') {
      errors.push(`unsupported effect ${effect?.op}`);
      continue;
    }
    if (!Number.isFinite(effect.amount) || effect.amount < 0 || (binding.integer && !Number.isInteger(effect.amount))) errors.push(`${effect.op}: invalid amount`);
    if (binding.param && !binding.choices.includes(effect[binding.param])) errors.push(`${effect.op}: invalid ${binding.param}`);
    if (binding.fields && Object.keys(effect).some(key => !binding.fields.includes(key))) errors.push(`${effect.op}: unsupported parameter`);
  }
  const trigger = def?.charge?.trigger;
  if (trigger) {
    if (Object.keys(trigger).some(key => !['any', 'anotherPractice'].includes(key))
      || (trigger.anotherPractice !== undefined && typeof trigger.anotherPractice !== 'boolean')) errors.push('unsupported trigger grammar');
    if (!Array.isArray(trigger.any) || !trigger.any.length) errors.push('trigger needs event alternatives');
    else for (const clause of trigger.any) {
      const binding = mechanicEvent(clause?.kind);
      if (!binding || binding.status !== 'implemented') {
        errors.push(`unsupported trigger ${clause?.kind}`);
        continue;
      }
      if (!binding.scopes.includes(clause.scope ?? 'local')) errors.push(`${clause.kind}: unsupported scope ${clause.scope ?? 'local'}`);
      const allowed = binding.filters;
      if (Object.keys(clause).some(key => !['kind', 'scope', ...allowed].includes(key))) errors.push(`${clause.kind}: unsupported filter`);
      if (listFilters.some(key => clause[key] !== undefined && !strings(clause[key]))
        || flags.some(key => clause[key] !== undefined && typeof clause[key] !== 'boolean')
        || textFilters.some(key => clause[key] !== undefined && (typeof clause[key] !== 'string' || !clause[key].trim()))
        || (clause.minimumSources !== undefined && (!Number.isInteger(clause.minimumSources) || clause.minimumSources < 1))) errors.push(`${clause.kind}: invalid filter value`);
      if (clause.kind === 'monsterSpawn' && trigger.anotherPractice) errors.push('monsterSpawn: anotherPractice is not a global Spawn filter');
    }
  }
  for (const mod of def?.modifiers ?? []) {
    for (const op of mod.query?.effectOpsAny ?? []) if (mechanicEffect(op)?.status !== 'implemented') errors.push(`unsupported effect query ${op}`);
    for (const kind of mod.query?.triggerKindsAny ?? []) if (mechanicEvent(kind)?.status !== 'implemented') errors.push(`unsupported trigger query ${kind}`);
  }
  return errors;
}
