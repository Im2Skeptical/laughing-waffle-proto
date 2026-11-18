import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const output = new URL("../src/sim/browser/generated/", import.meta.url);
const schemaDir = new URL("./", import.meta.url);
const scalarTypes = new Map([
  ["boolean", "bool"], ["number", "double"], ["integer", "double"],
  ["string", "std::string"], ["json", "core::json::Value"],
]);
const keywords = new Set((
  "alignas alignof and and_eq asm auto bitand bitor bool break case catch char char8_t char16_t " +
  "char32_t class compl concept const consteval constexpr constinit const_cast continue co_await " +
  "co_return co_yield decltype default delete do double dynamic_cast else enum explicit export extern " +
  "false float for friend goto if inline int long mutable namespace new noexcept not not_eq nullptr " +
  "operator or or_eq private protected public register reinterpret_cast requires return short signed " +
  "sizeof static static_assert static_cast struct switch template this thread_local throw true try " +
  "typedef typeid typename union unsigned using virtual void volatile wchar_t while xor xor_eq"
).split(" "));

function identifier(name) {
  const clean = name.replace(/[^A-Za-z0-9_]/gu, "_");
  if (!clean || !/^[A-Za-z]/u.test(clean) || clean.includes("__")) {
    throw Error("Unsupported C++ identifier for " + JSON.stringify(name));
  }
  return keywords.has(clean) ? clean + "_" : clean;
}

function requireUnique(names, context) {
  if (new Set(names).size !== names.length) throw Error(context + ": colliding C++ identifiers");
}

function literal(value) {
  if (typeof value === "number") return Number.isInteger(value) && !String(value).includes("e")
    ? String(value) + ".0"
    : String(value);
  if (value.includes("\0") || !value.isWellFormed()) throw Error("Unsupported schema string " + JSON.stringify(value));
  return '"' + [...Buffer.from(value)].map(byte => {
    if (byte === 34 || byte === 92) return "\\" + String.fromCharCode(byte);
    if (byte >= 32 && byte <= 126) return String.fromCharCode(byte);
    return "\\" + byte.toString(8).padStart(3, "0");
  }).join("") + '"';
}

function references(shape) {
  switch (shape.kind) {
    case "record": return Object.values(shape.fields).map(field => field.type);
    case "dict":
    case "nullable": return [shape.value];
    case "array": return [shape.items];
    case "tuple": return shape.items;
    case "enum": return [];
    case "union": return Object.values(shape.variants);
    case "oneOf": return shape.variants;
    default: throw Error("Unknown schema kind " + shape.kind);
  }
}

function orderedTypes(schema) {
  const sorted = new Map();
  const visiting = new Set();
  function visit(ref) {
    if (scalarTypes.has(ref) || sorted.has(ref)) return;
    if (!Object.hasOwn(schema.types, ref)) throw Error("Unknown type " + ref);
    if (visiting.has(ref)) throw Error("Recursive schema type " + ref + " needs an explicit representation");
    visiting.add(ref);
    const shape = schema.types[ref];
    for (const child of references(shape)) visit(child);
    sorted.set(ref, shape);
    visiting.delete(ref);
  }
  visit(schema.root);
  for (const ref of Object.keys(schema.types)) visit(ref);
  requireUnique([...sorted.keys()].map(identifier), "Schema types");
  return sorted;
}

const cppType = ref => scalarTypes.get(ref) ?? identifier(ref);
const reader = ref => "read_" + identifier(ref);
const writer = ref => "write_" + identifier(ref);
const homogeneous = items => items.length > 0 && items.every(ref => ref === items[0]);
const alias = (name, type) => "using " + name + " = " + type + ";";

function fieldMode(field) {
  if (typeof field.optional !== "boolean" || typeof field.nullable !== "boolean")
    throw Error("Record field lacks optional or nullable flags: " + JSON.stringify(field));
  return (field.optional ? "optional" : "required") + (field.nullable ? "_nullable" : "");
}

function fieldType(field) {
  const type = cppType(field.type);
  switch (fieldMode(field)) {
    case "optional_nullable": return "OptionalNullable<" + type + ">";
    case "optional":
    case "required_nullable": return "std::optional<" + type + ">";
    default: return type;
  }
}

function enumKind(shape, name) {
  if (shape.values.length && shape.values.every(value => typeof value === "string")) return "string";
  if (shape.values.length && shape.values.every(Number.isFinite)) return "number";
  throw Error(name + ": expected a nonempty enum of string or numeric values");
}

function declaration(ref, shape) {
  const name = cppType(ref);
  switch (shape.kind) {
    case "record": {
      const members = Object.entries(shape.fields);
      requireUnique(members.map(([key]) => identifier(key)), name);
      return [
        "struct " + name + " {",
        ...members.map(([key, field]) => "    " + fieldType(field) + " " + identifier(key) + "{};"),
        "};",
      ].join("\n");
    }
    case "dict": return alias(name, "OrderedDict<" + cppType(shape.value) + ">");
    case "array": return alias(name, "std::vector<" + cppType(shape.items) + ">");
    case "tuple": return homogeneous(shape.items)
      ? alias(name, "std::array<" + cppType(shape.items[0]) + ", " + shape.items.length + ">")
      : alias(name, "std::tuple<" + shape.items.map(cppType).join(", ") + ">");
    case "nullable": return alias(name, "std::optional<" + cppType(shape.value) + ">");
    case "enum": {
      if (enumKind(shape, name) === "number") return alias(name, "double");
      const members = shape.values.map(identifier);
      requireUnique(members, name);
      return "enum class " + name + " { " + members.join(", ") + " };";
    }
    case "union":
    case "oneOf":
      return alias(name, "std::variant<" + references(shape).map(cppType).join(", ") + ">");
  }
}

function prototypes(ref) {
  const name = cppType(ref);
  return [
    name + " " + reader(ref) + "(const Value& value, const std::string& path)",
    "Value " + writer(ref) + "(const " + name + "& value)",
  ];
}

const invalidVariant = name => 'throw std::invalid_argument("invalid ' + name + ' variant");';

function readBody(ref, shape) {
  const name = cppType(ref);
  const refs = references(shape);
  switch (shape.kind) {
    case "record": {
      const fields = Object.entries(shape.fields);
      return [
        "static constexpr std::array<std::string_view, " + fields.length + "> keys{" +
          fields.map(([key]) => literal(key)).join(", ") + "};",
        ...(fields.length ? [
          "const auto fields = read_record(value, path, keys);",
          "return {",
          ...fields.map(([key, field], index) => "    read_" + fieldMode(field) + "(fields[" +
            index + "], property_path(path, keys[" + index + "]), " + reader(field.type) + "),"),
          "};",
        ] : ["read_record(value, path, keys);", "return {};"]),
      ];
    }
    case "dict":
      if (!["string", "intString"].includes(shape.key)) throw Error(name + ": unsupported dictionary key");
      return ["return read_dictionary(value, path, " + reader(shape.value) + ", " + (shape.key === "intString") + ");"];
    case "array": return ["return read_items(value, path, " + reader(shape.items) + ");"];
    case "tuple":
      return [
        "const auto& items = read_tuple(value, path, " + refs.length + ");",
        "return {",
        ...refs.map((child, index) => "    " + reader(child) + "(items[" + index + "], index_path(path, " + index + ")),"),
        "};",
      ];
    case "nullable": return ["return read_nullable(value, path, " + reader(shape.value) + ");"];
    case "enum": {
      const kind = enumKind(shape, name);
      return [
        "if (value.kind() == Value::Kind::" + kind + ") {",
        "    const auto" + (kind === "string" ? "&" : "") + " member = value.as_" + kind + "();",
        ...shape.values.map(member => "    if (member == " + literal(member) + ") return " +
          (kind === "string" ? name + "::" + identifier(member) : "member") + ";"),
        "}",
        'fail(path, "expected a member of ' + name + '");',
      ];
    }
    case "union": {
      const tag = literal(shape.discriminator);
      return [
        'read_object(value, path, "record");',
        "const auto* tag = value.find(" + tag + ");",
        "if (tag && tag->kind() == Value::Kind::string) {",
        ...Object.entries(shape.variants).flatMap(([key, child], index) => [
          "    if (tag->as_string() == " + literal(key) + ")",
          "        return " + name + "(std::in_place_index<" + index + ">, " + reader(child) + "(value, path));",
        ]),
        "}",
        'fail(property_path(path, ' + tag + '), "unknown or missing discriminator in ' + name + '");',
      ];
    }
    case "oneOf":
      return [
        "std::optional<" + name + "> result;",
        "std::size_t matches = 0;",
        ...refs.flatMap((child, index) => [
          "try {",
          "    auto candidate = " + reader(child) + "(value, path);",
          "    if (++matches == 1) result.emplace(std::in_place_index<" + index + ">, std::move(candidate));",
          "} catch (const ImportError&) {}",
        ]),
        'if (matches != 1) fail(path, "expected exactly one variant of ' + name + '; matched " + std::to_string(matches));',
        "return std::move(*result);",
      ];
  }
}

function writeBody(ref, shape) {
  const name = cppType(ref);
  const refs = references(shape);
  switch (shape.kind) {
    case "record": {
      const fields = Object.entries(shape.fields);
      return [
        "Value::Object out;",
        "out.reserve(" + fields.length + ");",
        ...fields.map(([key, field]) => "write_" + fieldMode(field) + "(out, " + literal(key) +
          ", value." + identifier(key) + ", " + writer(field.type) + ");"),
        "return Value(std::move(out));",
      ];
    }
    case "dict": return ["return write_dictionary(value, " + writer(shape.value) + ");"];
    case "array": return ["return write_items(value, " + writer(shape.items) + ");"];
    case "tuple": return homogeneous(refs)
      ? ["return write_items(value, " + writer(refs[0]) + ");"]
      : [
        "return Value(Value::Array{",
        ...refs.map((child, index) => "    " + writer(child) + "(std::get<" + index + ">(value)),"),
        "});",
      ];
    case "nullable": return ["return write_nullable(value, " + writer(shape.value) + ");"];
    case "enum": {
      const invalid = 'throw std::invalid_argument("invalid ' + name + ' value");';
      if (enumKind(shape, name) === "number") return [
        ...shape.values.map(member => "if (value == " + literal(member) + ") return Value(value);"),
        invalid,
      ];
      return [
        "switch (value) {",
        ...shape.values.map(member => "case " + name + "::" + identifier(member) + ": return Value(" + literal(member) + ");"),
        "}",
        invalid,
      ];
    }
    case "union":
    case "oneOf":
      return [
        "switch (value.index()) {",
        ...refs.map((child, index) => "case " + index + ": return " + writer(child) + "(std::get<" + index + ">(value));"),
        "}",
        invalidVariant(name),
      ];
  }
}

function functionText(signature, body) {
  return [signature, "{", ...body.map(line => "    " + line), "}", ""].join("\n");
}

function generate(schema, banner) {
  const types = [...orderedTypes(schema)];
  const root = cppType(schema.root);
  const hasGameConfig = types.some(([ref]) => ref === "GameConfig");
  const header = [
    banner, "#pragma once", "",
    '#include "core/json.hpp"',
    '#include "sim/browser/types.hpp"', "",
    "#include <array>", "#include <tuple>", "#include <variant>", "",
    "namespace waffle::sim::browser {", "",
    ...types.map(([ref, shape]) => declaration(ref, shape) + "\n"),
    "// Throws std::invalid_argument with a JSON path if the value fails the schema.",
    root + " import_game_state(const core::json::Value& value);",
    "core::json::Value export_game_state(const " + root + "& state);",
    ...(hasGameConfig ? ["core::json::Value export_game_config(const GameConfig& config);"] : []),
    "", "}", "",
  ].join("\n");
  const source = [
    banner,
    '#include "sim/browser/generated/game_state.hpp"',
    '#include "sim/browser/detail/codec.hpp"', "",
    "namespace waffle::sim::browser {", "namespace {", "",
    "using namespace detail;", "",
    ...types.flatMap(([ref]) => prototypes(ref).map(signature => signature + ";")), "",
    ...types.flatMap(([ref, shape]) => {
      const [read, write] = prototypes(ref);
      return [functionText(read, readBody(ref, shape)), functionText(write, writeBody(ref, shape))];
    }),
    "}", "",
    functionText(root + " import_game_state(const core::json::Value& value)", [
      'return ' + reader(schema.root) + '(value, "$");',
    ]),
    functionText("core::json::Value export_game_state(const " + root + "& state)", [
      "return " + writer(schema.root) + "(state);",
    ]),
    ...(hasGameConfig ? [functionText("core::json::Value export_game_config(const GameConfig& config)", [
      "return write_GameConfig(config);",
    ])] : []),
    "}", "",
  ].join("\n");
  return new Map([["game_state.hpp", header], ["game_state.cpp", source]]);
}

function latestSchema() {
  const candidates = readdirSync(schemaDir).map(name => /^gamestate\.v(\d+)\.json$/u.exec(name)).filter(Boolean);
  if (!candidates.length) throw Error("No GameState schema found");
  candidates.sort((a, b) => Number(b[1]) - Number(a[1]));
  return fileURLToPath(new URL(candidates[0][0], schemaDir));
}

function main(args) {
  const check = args.includes("--check");
  const inputs = args.filter(arg => arg !== "--check");
  if (inputs.length > 1 || inputs.some(arg => arg.startsWith("-")))
    throw Error("Usage: node native/schema/codegen.mjs [--check] [gamestate.v<N>.json]");
  const file = inputs.length ? resolve(inputs[0]) : latestSchema();
  const content = readFileSync(file, "utf8").replaceAll("\r\n", "\n");
  const schema = JSON.parse(content);
  const filename = basename(file);
  if (filename !== "gamestate.v" + schema.schemaVersion + ".json")
    throw Error("Schema filename and version disagree: " + filename);
  const hash = createHash("sha256").update(content).digest("hex");
  const banner = "// Generated by native/schema/codegen.mjs from " + filename + ". Do not edit.\n" +
    "// Schema SHA-256 (LF): " + hash + "\n";
  const files = generate(schema, banner);
  if (!check) mkdirSync(output, { recursive: true });
  for (const [name, expected] of files) {
    const target = new URL(name, output);
    if (check) {
      let actual;
      try {
        actual = readFileSync(target, "utf8").replaceAll("\r\n", "\n");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (actual !== expected) {
        console.error(fileURLToPath(target) + " is stale. Run node native/schema/codegen.mjs.");
        process.exitCode = 1;
      }
    } else {
      writeFileSync(target, expected);
    }
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
