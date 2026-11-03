import { MECHANICS, mechanicEffect, mechanicEvent } from '../defs/mechanics.js';
const title = value => value ? value[0].toUpperCase() + value.slice(1) : '';

export function describeMechanicEffect(effect, amount) {
  const mechanic = MECHANICS[mechanicEffect(effect.op)?.mechanicId] ?? {name:'Unsupported effect'};
  const names = { scholar: 'Scholar', warrior: 'Warrior' };
  if (effect.op === 'addMonsterPressure') return `Gain ${amount} ${MECHANICS.creep.name}`;
  if (effect.op === 'addChaos') return `Gain ${amount} ${MECHANICS.chaos.name}`;
  if (effect.op === 'triggerMonsterSpawn') return amount === 1 ? `Trigger a ${MECHANICS.monsterSpawn.name}` : `Trigger ${amount} ${MECHANICS.monsterSpawn.name}s`;
  const text = {
    convertPopulation: `${effect.train?'Train and convert':'Convert'} up to ${amount} eligible ${effect.filter?.kind??''} ${effect.filter?.specialty??''} opposing residents to this institution's allegiance${effect.reach==='connectedAdjacent'?'; first eligible adjacent road-connected region':'; local'}`,
    politicalForce: `+${amount} supplied ${effect.defenseOnly?'monster defence':'occupation'} Force until next ${effect.duration??'moon'} (refreshes)`,
    generateStock: `Produce ${amount} ${mechanic.name}`,
    research: `Gain ${amount} ${mechanic.name}`,
    train: `Train ${amount} ${names[effect.classId] ?? 'specialist'}${amount === 1 ? '' : 's'}`,
    addHousingForPhase: `Gain ${amount} ${mechanic.name} for this phase`,
    reduceLocalFoodRequirement: `Use ${amount} less Edible Stock at this settlement's next meal`,
    addFaithChaosResistance: `Gain ${amount} ${mechanic.name} until the next Birth phase`,
    bankCandidateDevelopment: `Next ${names[effect.classId] ?? 'Vassal'} candidate gains ${amount} ${mechanic.name}`,
    bankShopQuality: `Gain ${amount} quality bonus for the next local shop (up to 3)`,
    bankPreview: `Gain ${amount} local preview bonus (up to 3)`,
    boostSeasonalFood: `One local seasonal Food Practice produces ${amount} extra Stock in its next two seasons this year`,
    bankSupport: `Bank ${amount} ${title(effect.bank)} ${mechanic.name} for a future martial action (up to 10)`,
  }[effect.op];
  const history = { losses: 'lost settlements', deaths: 'local deaths', deathsSinceSpring: 'local deaths since Spring' };
  return (text ?? `${amount} ${mechanicEffect(effect.op)?.label ?? 'Unsupported effect'}`) + (effect.historyScale ? `; increased by ${history[effect.historyScale] ?? effect.historyScale}` : '');
}


// The executable event clauses are authoritative. Freeform triggerText is retained
// as authored provenance, not used to rename or imply a different event.
export function describeMechanicTrigger(trigger) {
  if (!trigger?.any?.length) return '';
  const scopes = { local: 'in this settlement', adjacent: 'in this or an adjacent region', connected: 'in this or a connected region', civilization: 'anywhere in the civilisation' };
  const clauses = trigger.any.map(clause => {
    const binding = mechanicEvent(clause.kind);
    if (clause.kind === 'monsterSpawn') return `every ${MECHANICS.monsterSpawn.name}`;
    const details = [];
    if (clause.traitsAny?.length) details.push(`Stock with ${clause.traitsAny.join(' or ')}`);
    if (clause.tagsAny?.length) details.push(`Practices tagged ${clause.tagsAny.join(' or ')}`);
    if (clause.scholarStaffed) details.push('Scholar-staffed Practices');
    if (clause.pool) details.push(`${title(clause.pool)} Practices`);
    if (clause.classId) details.push(`${title(clause.classId)} class`);
    if (clause.premature) details.push('premature deaths only');
    if (clause.martial) details.push('martial events only');
    if (clause.actionKindsAny?.length) details.push(`${clause.actionKindsAny.join(' or ')} actions`);
    if (clause.minimumSources) details.push(`at least ${clause.minimumSources} contributing regions`);
    for (const key of ['faction', 'controller']) if (clause[key]) details.push(`${key}: ${clause[key] === 'beneficiary' ? "this Practice's beneficiary" : clause[key]}`);
    return `${binding?.name ?? 'Unsupported event'} ${scopes[clause.scope ?? 'local'] ?? '(unsupported scope)'}${details.length ? ` (${details.join('; ')})` : ''}`;
  });
  return `On ${clauses.join(' or ')}${trigger.anotherPractice ? '; another Practice only' : ''}.`;
}
