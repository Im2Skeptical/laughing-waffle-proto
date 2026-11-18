import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const schema = JSON.parse(readFileSync(new URL("./gamestate.v52.json", import.meta.url), "utf8"));
const own = (record, key) => Object.hasOwn(record, key);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const scalars = {
  number: Number.isFinite,
  integer: Number.isInteger,
  string: value => typeof value === "string",
  boolean: value => typeof value === "boolean",
  json: function isJson(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (Array.isArray(value)) return value.every(isJson);
    return object(value) && Object.values(value).every(isJson);
  },
};
const expected = new Set();
const known = ref => own(scalars, ref) || own(schema.types, ref);
for (const [name, type] of Object.entries(schema.types)) {
  let refs;
  switch (type.kind) {
    case "record":
      refs = Object.entries(type.fields).map(([key, field]) => {
        if (typeof field.optional !== "boolean" || typeof field.nullable !== "boolean") {
          throw Error(`${name}.${key}: missing optional or nullable flag`);
        }
        expected.add(`${name}.${key}`);
        return field.type;
      });
      break;
    case "dict":
      if (!["string", "intString"].includes(type.key)) throw Error(`${name}: invalid dictionary key type`);
      refs = [type.value];
      break;
    case "array": refs = [type.items]; break;
    case "nullable": refs = [type.value]; break;
    case "enum":
      if (!type.values?.length) throw Error(`${name}: empty enum`);
      refs = [];
      break;
    case "tuple": refs = type.items; break;
    case "union": refs = Object.values(type.variants); break;
    case "oneOf": refs = type.variants; break;
    default: throw Error(`${name}: unknown schema kind ${type.kind}`);
  }
  for (const ref of refs) if (!known(ref)) throw Error(`${name}: unknown type ${ref}`);
}
if (!own(schema.types, schema.root)) throw Error("unknown schema root");

const keyPath = (path, key) => `${path}[${JSON.stringify(key)}]`;
const intString = /^(?:0|-?[1-9]\d*)$/u;

// Collect field coverage on successful matches only. A present null counts as
// seen; non-null statistics distinguish empty placeholders from exercised types.
export function validateSnapshot(value, coverage = new Map(), { maxErrors = 20 } = {}) {
  const errors = [];

  function visit(ref, item, path, seen, problems) {
    if (problems.length >= maxErrors) return;
    const fail = message => problems.push(`${path}: ${message}`);
    if (own(scalars, ref)) {
      if (!scalars[ref](item)) fail(`expected ${ref}`);
      return;
    }
    const shape = schema.types[ref];
    switch (shape.kind) {
      case "record":
        if (!object(item)) return fail(`expected record ${ref}`);
        for (const key of Object.keys(item)) {
          if (!own(shape.fields, key) && problems.length < maxErrors) fail(`unknown field ${JSON.stringify(key)} in ${ref}`);
        }
        for (const [key, field] of Object.entries(shape.fields)) {
          if (problems.length >= maxErrors) break;
          if (!own(item, key)) {
            if (!field.optional) fail(`missing field ${JSON.stringify(key)} in ${ref}`);
            continue;
          }
          const member = item[key];
          const id = `${ref}.${key}`;
          seen.set(id, member !== null || seen.get(id) === true);
          if (member === null) {
            if (!field.nullable) fail(`field ${JSON.stringify(key)} is not nullable`);
          } else {
            visit(field.type, member, keyPath(path, key), seen, problems);
          }
        }
        break;
      case "dict":
        if (!object(item)) return fail("expected dictionary");
        for (const [key, member] of Object.entries(item)) {
          if (problems.length >= maxErrors) break;
          if (shape.key === "intString" && !intString.test(key)) fail(`invalid integer key ${JSON.stringify(key)}`);
          visit(shape.value, member, keyPath(path, key), seen, problems);
        }
        break;
      case "array":
      case "tuple":
        if (!Array.isArray(item)) return fail(`expected ${shape.kind}`);
        if (shape.kind === "tuple" && item.length !== shape.items.length) return fail(`expected tuple length ${shape.items.length}`);
        for (let index = 0; index < item.length && problems.length < maxErrors; ++index) {
          visit(shape.kind === "tuple" ? shape.items[index] : shape.items, item[index], `${path}[${index}]`, seen, problems);
        }
        break;
      case "enum":
        if (!shape.values.includes(item)) fail(`expected a member of ${ref}`);
        break;
      case "nullable":
        if (item !== null) visit(shape.value, item, path, seen, problems);
        break;
      case "union": {
        const tag = object(item) && own(item, shape.discriminator) ? item[shape.discriminator] : undefined;
        if (typeof tag !== "string" || !own(shape.variants, tag)) {
          return fail(`unknown or missing discriminator ${shape.discriminator} in ${ref}`);
        }
        visit(shape.variants[tag], item, path, seen, problems);
        break;
      }
      case "oneOf": {
        const matches = [];
        for (const variant of shape.variants) {
          const local = new Map();
          const failures = [];
          visit(variant, item, path, local, failures);
          if (!failures.length) matches.push(local);
        }
        if (matches.length !== 1) return fail(`expected exactly one variant of ${ref}; matched ${matches.length}`);
        for (const [key, nonNull] of matches[0]) seen.set(key, nonNull || seen.get(key) === true);
        break;
      }
    }
  }

  const seen = new Map();
  visit(schema.root, value, "$", seen, errors);
  if (!errors.length) {
    for (const [key, nonNull] of seen) coverage.set(key, nonNull || coverage.get(key) === true);
  }
  return errors;
}

function validationFiles(input) {
  const path = resolve(input);
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path)
    .filter(name => name.endsWith(".json"))
    .sort()
    .map(name => resolve(path, name));
}

function main(args) {
  const files = [...new Set(args.flatMap(validationFiles))];
  if (!files.length) throw Error("Usage: node native/schema/validate.mjs <snapshot.json|directory> [...]");
  const coverage = new Map();
  let failed = 0;
  let writtenErrors = 0;
  for (const file of files) {
    let errors;
    try {
      const snapshot = JSON.parse(readFileSync(file, "utf8"));
      errors = validateSnapshot(snapshot, coverage);
    } catch (error) {
      errors = [error.message];
    }
    if (!errors.length) continue;
    failed++;
    if (writtenErrors++ < 12) console.error(`${file}\n  ${errors.join("\n  ")}`);
  }
  const neverObserved = [...expected].filter(field => !coverage.has(field)).sort();
  const onlyNull = [...coverage].filter(([, nonNull]) => !nonNull).map(([field]) => field).sort();
  console.log(JSON.stringify({
    schemaVersion: schema.schemaVersion,
    types: Object.keys(schema.types).length,
    fields: expected.size,
    states: files.length,
    passed: files.length - failed,
    failed,
    fieldsObserved: coverage.size,
    neverObserved,
    onlyNull,
  }, null, 2));
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main(process.argv.slice(2));
