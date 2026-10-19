import { VASSAL_NORMAL_NODE_FAMILY_IDS } from '../defs/gamepieces/vassal-life-map-defs.js';

export function lifeMapScopeMatches(scope, classId) {
  return scope === 'common' || scope === (classId ?? 'unclassed') || scope === 'specialist' && ['scholar', 'warrior'].includes(classId);
}

export function getLifeMapColumns(config, classId) {
  return config.design.enabled ? config.design.columns.filter(column => column.enabled && lifeMapScopeMatches(column.scope, classId)) : [];
}

export function validateLifeMapColumns(design, depthCount) {
  const errors = [], ids = new Set();
  const bookends=design.bookends;
  for(const kind of ['founding','legacy']){
    const rule=bookends?.[kind];
    if(!rule||typeof rule.enabled!=='boolean'||!(kind==='legacy'&&rule.depth==='end'||Number.isInteger(rule.depth)&&rule.depth>=(kind==='founding'?0:1)&&rule.depth<=20))errors.push(`design.bookends.${kind}: choose an enabled state and depth`);
    else if(design.enabled&&rule.enabled&&rule.depth!=='end'&&rule.depth>depthCount)errors.push(`design.bookends.${kind}: depth must fit the graph`);
  }
  if (!Array.isArray(design.columns) || design.columns.length > 20) return ['design.columns: expected up to 20 milestone columns'];
  for (const column of design.columns) {
    const fail = text => errors.push(`design.columns.${column?.id ?? '?'}: ${text}`);
    if (!column || typeof column !== 'object') { fail('expected a column'); continue; }
    if (typeof column.id !== 'string' || !/^[a-z][a-zA-Z0-9-]{0,39}$/.test(column.id) || ids.has(column.id)) fail('unique column ids required');
    ids.add(column.id);
    if (typeof column.label !== 'string' || !column.label.trim() || column.label.length > 80) fail('give the column a name (up to 80 characters)');
    if (typeof column.enabled !== 'boolean') fail('enabled must be a boolean');
    if (!['common', 'specialist', 'scholar', 'warrior', 'unclassed'].includes(column.scope)) fail('choose a class');
    if (!Number.isInteger(column.depth) || column.depth < 1 || column.depth > 20 || design.enabled && column.enabled && column.depth > depthCount) fail('depth must fit the graph');
    if (column.targetType === 'pool' ? !Array.isArray(design.pools) || !design.pools.some(pool => pool?.id === column.targetId)
      : column.targetType !== 'node' || ![...VASSAL_NORMAL_NODE_FAMILY_IDS, 'stockShop'].includes(column.targetId)) fail('choose a node type or family');
  }
  for (const classId of [null, 'scholar', 'warrior']) {
    const depths = new Set();
    if(bookends?.legacy?.enabled&&bookends.legacy.depth!=='end')depths.add(bookends.legacy.depth);
    if(classId&&bookends?.founding?.enabled&&bookends.founding.depth>0){
      if(depths.has(bookends.founding.depth))errors.push('design.bookends: Founding and Legacy cannot share a depth');
      depths.add(bookends.founding.depth);
    }
    for (const column of design.columns.filter(c => c?.enabled && lifeMapScopeMatches(c.scope, classId))) {
      if (depths.has(column.depth)) errors.push(`design.columns: two milestone columns occupy depth ${column.depth} for ${classId ?? 'unclassed'}`);
      depths.add(column.depth);
    }
  }
  return errors;
}

// Collapse the existing depth before reserving content. Every incoming route
// meets here; every outgoing branch remains reachable. No additional RNG draws.
export function applyLifeMapColumns(config, nodes, edges, {classId,founderClassId,foundingNodeId='life-founding'}={}) {
  const settings=config.design.enabled?config.design.bookends:{founding:{enabled:true,depth:0},legacy:{enabled:true,depth:'end'}};
  const columns=getLifeMapColumns(config,classId).map(column=>({...column,kind:'milestone'}));
  if(settings.legacy.enabled)columns.push({id:'legacy',kind:'legacy',depth:settings.legacy.depth==='end'?config.normalDepthCount+1:settings.legacy.depth});
  if(founderClassId&&settings.founding.enabled)columns.push({id:'founding',kind:'founding',depth:settings.founding.depth});
  let bossNodeId=null,placedFoundingId=null;
  for (const column of columns) {
    const depth = column.depth - 1, removed = new Set(nodes.filter(node => node.depth === depth).map(node => node.id));
    const id=column.kind==='legacy'?`life-d${String(depth+1).padStart(2,'0')}-boss`:column.kind==='founding'?foundingNodeId:`life-milestone-${column.id}`;
    const node = { id, depth, lane: Math.floor((config.laneCount - 1) / 2),
      band: depth < config.earlyDepthCount ? 'early' : depth < config.earlyDepthCount + config.midDepthCount ? 'mid' : 'late',
      family: null };
    if(column.kind==='milestone')node.milestoneId=column.id;
    else {
      node.bookend=column.kind;node.generationRuleId=column.kind;
      if(column.kind==='legacy'){node.family='legacy';node.band='legacy';bossNodeId=id;}
      else{node.family=founderClassId==='scholar'?'philosopherFounding':'warlordFounding';node.band='founding';placedFoundingId=id;}
    }
    nodes = nodes.filter(node => !removed.has(node.id));
    nodes.push(node);
    edges = edges.filter(edge => !removed.has(edge.fromNodeId) && !removed.has(edge.toNodeId));
    for (const parent of nodes.filter(other => other.depth === depth - 1)) edges.push({ fromNodeId: parent.id, toNodeId: node.id });
    for (const child of nodes.filter(other => other.depth === depth + 1)) edges.push({ fromNodeId: node.id, toNodeId: child.id });
  }
  return { nodes: nodes.sort((a, b) => a.depth - b.depth || a.lane - b.lane), edges,bossNodeId,foundingNodeId:placedFoundingId };
}
