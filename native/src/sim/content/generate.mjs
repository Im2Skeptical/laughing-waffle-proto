import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const schemaDir = new URL('../../../schema/', import.meta.url);
const schemaName = readdirSync(schemaDir).filter(name => /^gamestate\.v\d+\.json$/.test(name))
  .sort((a, b) => Number(b.split('.')[1].slice(1)) - Number(a.split('.')[1].slice(1)))[0];
const { types } = JSON.parse(readFileSync(new URL(schemaName, schemaDir), 'utf8'));
const coverage = new Map();
let fields;
for (const line of readFileSync(new URL('field-coverage.txt', import.meta.url), 'utf8').split(/\r?\n/)) {
  const text = line.trim();
  if (!text || text.startsWith('#')) continue;
  if (text.startsWith('[') && text.endsWith(']')) {
    const name = text.slice(1, -1);
    if (coverage.has(name)) throw Error('Duplicate record ' + name);
    coverage.set(name, fields = new Map());
    continue;
  }
  const [policy, ...names] = text.split(/\s+/);
  if (!fields || !names.length) throw Error('Expected policy and fields: ' + text);
  for (const name of names) {
    if (fields.has(name)) throw Error('Duplicate field ' + name);
    fields.set(name, policy);
  }
}

const scalar = { boolean: 'bool', number: 'double', integer: 'double' };
const id = name => name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(require|requires|template|union)$/, '$1_');
const records = new Set();
const layouts = [];
const declarations = [];
const arenas = new Set();
const counts = { compiled: 0, descriptive: 0, unsupported: 0 };
const tags = new Map([
  ['PracticeEffect', 'EffectOp'],
  ['TriggerClause', 'TriggerKind'],
  ['PracticeStockMultiplier', 'MultiplierPool'],
]);
const ignoredRecords = new Set();
const definitions = {
  PracticeDefinition: '    std::uint16_t activationMask{};\n    std::uint8_t stageMask{};\n    std::uint8_t seasonMask{};\n    bool standaloneStockOutput{};\n    runtime::Range<std::uint32_t> recipeEffects;\n',
  PracticeStockMultiplieroutputMultiplier: '    std::uint8_t seasonMask{};\n',
  PracticeStockMultipliercapacity: '    std::uint8_t seasonMask{};\n',
  StructureDefinitionModifiersEntry: '    runtime::SymbolId queryIdentity;\n',
};

function range(item) {
  arenas.add(item);
  return 'runtime::Range<' + item + '>';
}

function accountDescriptive(ref) {
  const shape = types[ref];
  if (shape?.kind === 'array') accountDescriptive(shape.items);
  if (shape?.kind !== 'record' || ignoredRecords.has(ref)) return;
  ignoredRecords.add(ref);
  const mapping = coverage.get(ref);
  if (!mapping) throw Error('Missing descriptive record ' + ref);
  for (const [key, field] of Object.entries(shape.fields)) {
    if (mapping.get(key) !== 'descriptive') throw Error('Unclassified descriptive field ' + ref + '.' + key);
    mapping.delete(key);
    counts.descriptive++;
    accountDescriptive(field.type);
  }
  if (mapping.size) throw Error(ref + ': stale fields ' + [...mapping.keys()].join(', '));
}

function type(ref, policy = 'compiled') {
  const shape = types[ref];
  if (shape?.kind === 'array') return range(type(shape.items, policy));
  if (shape?.kind === 'dict') {
    const key = { GamepiecesPractices: 'PracticeId', GamepiecesStructures: 'StructureId',
      SpecialRelicPoolEntries: 'SymbolId' }[ref];
    if (!key || shape.key !== 'string') throw Error('Unclassified dictionary ' + ref);
    return range('runtime::Entry<runtime::' + key + ', ' + type(shape.value) + '>');
  }
  if (ref === 'string') {
    if (/^runtime::\w+Id$|^\w+$/u.test(policy) && policy !== 'compiled') return policy;
    throw Error('Unclassified string policy ' + policy);
  }
  if (policy !== 'compiled') throw Error('Unexpected ' + policy + ' for ' + ref);
  if (Object.hasOwn(scalar, ref)) return scalar[ref];
  if (shape?.kind === 'enum' && shape.values.every(v => typeof v === 'number')) return 'double';
  if (shape?.kind === 'enum' && shape.values.length === 1) {
    const label = 'browser::' + ref;
    layouts.push('template<> inline constexpr std::string_view literal<' + label + '> = ' +
      JSON.stringify(shape.values[0]) + ';');
    return label;
  }
  if (shape?.kind === 'enum') return 'browser::' + ref;
  if (records.has(ref)) return ref;
  records.add(ref);

  if (shape?.kind === 'union' || shape?.kind === 'oneOf') {
    const tag = tags.get(ref);
    const entries = shape.kind === 'union' ? Object.entries(shape.variants) :
      shape.variants.map(child => [null, child]);
    const alternatives = entries.map(([, child]) => type(child));
    declarations.push('using ' + ref + ' = std::variant<' + alternatives.join(', ') + '>;');
    if (tag) layouts.push('template<> struct Union<' + ref + '> {\n' +
      '    static constexpr std::string_view discriminator = "' + shape.discriminator + '";\n' +
      '    static constexpr std::array tags{' + entries.map(([key]) => JSON.stringify(key)).join(', ') + '};\n};\n' +
      'template<> inline constexpr auto names<' + tag + '> = Union<' + ref + '>::tags;');
    return ref;
  }
  if (shape?.kind !== 'record') throw Error('Unsupported type ' + ref);
  const mapping = coverage.get(ref);
  if (!mapping) throw Error('Missing record ' + ref);
  const members = [];
  const visits = [];
  for (const [key, field] of Object.entries(shape.fields)) {
    const fieldPolicy = mapping.get(key);
    if (!fieldPolicy) throw Error('Unclassified field ' + ref + '.' + key);
    mapping.delete(key);
    const kind = fieldPolicy.split(':')[0];
    if (fieldPolicy === 'descriptive' || kind === 'unsupported') {
      if (kind === 'unsupported' && !fieldPolicy.slice('unsupported:'.length))
        throw Error('Missing unsupported reason for ' + ref + '.' + key);
      counts[kind]++;
      if (kind === 'descriptive') accountDescriptive(field.type);
      if (kind === 'unsupported') visits.push('        field(' + JSON.stringify(key) + ', Unsupported{' +
        JSON.stringify(fieldPolicy.slice('unsupported:'.length).replaceAll('_', ' ')) + '});');
      continue;
    }
    if (field.nullable) throw Error('Nullable field needs a policy: ' + ref + '.' + key);
    counts.compiled++;
    const compiled = type(field.type, fieldPolicy);
    members.push('    ' + (field.optional ? 'std::optional<' + compiled + '>' : compiled) + ' ' + id(key) + '{};');
    const shape = types[field.type];
    const numberKind = field.type === 'integer' ? ', NumberRule::integer' :
      shape?.kind === 'enum' && shape.values.every(v => typeof v === 'number') ? ', NumberRule::version, ' + shape.values[0] : '';
    visits.push('        field(' + JSON.stringify(key) + ', &' + ref + '::' + id(key) + numberKind + ');');
  }
  if (mapping.size) throw Error(ref + ': stale fields ' + [...mapping.keys()].join(', '));
  declarations.push('struct ' + ref + ' {\n' + members.join('\n') + '\n' +
    (definitions[ref] ?? '') + '};');
  layouts.push('template<> struct Record<' + ref + '> {\n' +
    '    template<class F> static void visit(F&& field)\n    {\n' + visits.join('\n') + '\n    }\n};');
  return ref;
}

type('GameConfig');
for (const ref of coverage.keys()) if (!records.has(ref) && !ignoredRecords.has(ref)) throw Error('Stale record ' + ref);
arenas.add('std::uint32_t');
const outputs = {
  'content_types.generated.hpp': [
    '#pragma once', '', '#include "sim/content/vocabulary.hpp"', '',
    'namespace waffle::sim::content {', '',
    ...[...tags].map(([ref, tag]) => 'enum class ' + tag + ' : std::uint8_t { ' +
      Object.keys(types[ref].variants).map(id).join(', ') + ' };'),
    '', ...declarations.flatMap(text => [text, '']),
    'using ContentTables = runtime::Tables<\n    ' + [...arenas].join(',\n    ') + '>;', '', '}', '',
  ],
  'content_layout.generated.hpp': ['#pragma once', '', ...new Set(layouts), ''],
};
for (const [name, lines] of Object.entries(outputs)) {
  const path = new URL(name, import.meta.url);
  const result = '// Generated by native/src/sim/content/generate.mjs. Do not edit.\n' + lines.join('\n');
  if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8').replace(/\r\n/g, '\n') !== result) throw Error(name + ' is stale');
  } else writeFileSync(path, result);
}
console.log('Captured content fields: ' + JSON.stringify(counts));
