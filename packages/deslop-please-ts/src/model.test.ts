import { test, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildModel, formatModel } from "./model.ts";

const SAMPLE = path.resolve("tests/fixtures/sample");
const ASSIGN = path.resolve("tests/fixtures/assign");
const REEXPORT = path.resolve("tests/fixtures/reexport");
const DYNAMIC = path.resolve("tests/fixtures/dynamic");
const NAMES = path.resolve("tests/fixtures/names");
const COPIES = path.resolve("tests/fixtures/copies");

function refIn(
  model: ReturnType<typeof buildModel>,
  holderName: string,
  itemName: string,
) {
  const holder = model.items.find((i) => i.name === holderName);
  const item = model.items.find((i) => i.name === itemName);
  return model.references.find(
    (r) => r.holder === holder?.id && r.item === item?.id,
  );
}

test("buildModel discovers the fixture modules", () => {
  const model = buildModel(SAMPLE);
  const paths = model.modules.map((m) => path.basename(m.path)).sort();
  expect(paths).toEqual(["helper.ts", "main.ts"]);
});

test("buildModel extracts items including classes, functions, fields, constants", () => {
  const model = buildModel(SAMPLE);
  const names = model.items.map((i) => i.name);
  expect(names).toContain("Store");
  expect(names).toContain("double");
  expect(names).toContain("LIMIT");
  expect(names).toContain("items");
  expect(names).toContain("count");
  expect(names).toContain("add");
});

test("buildModel records cross-file references", () => {
  const model = buildModel(SAMPLE);
  const mainModule = model.modules.find((m) => m.path.endsWith("main.ts"));
  expect(mainModule).toBeDefined();
  const mainRefs = model.references.filter((r) => r.from === mainModule?.id);
  expect(mainRefs.length).toBeGreaterThan(0);
});

test("buildModel resolves a reference to its owning item", () => {
  const model = buildModel(SAMPLE);
  const doubleItem = model.items.find((i) => i.name === "double");
  expect(doubleItem).toBeDefined();
  const ref = model.references.find((r) => r.item === doubleItem?.id);
  expect(ref).toBeDefined();
});

test("buildModel marks exported declarations", () => {
  const model = buildModel(SAMPLE);
  const doubleItem = model.items.find((i) => i.name === "double");
  const secretItem = model.items.find((i) => i.name === "secret");
  expect(doubleItem?.exported).toBe(true);
  expect(secretItem?.exported).toBe(false);
});

test("buildModel records import edges between modules", () => {
  const model = buildModel(SAMPLE);
  const edge = model.imports.find((e) => !e.typeOnly);
  expect(edge).toBeDefined();
  const from = model.modules.find((m) => m.id === edge?.from);
  const to = model.modules.find((m) => m.id === edge?.to);
  expect(path.basename(from?.path ?? "")).toBe("main.ts");
  expect(path.basename(to?.path ?? "")).toBe("helper.ts");
});

test("buildModel records a physical line count per module", () => {
  const model = buildModel(SAMPLE);
  expect(model.modules.every((m) => m.lines > 0)).toBe(true);
});

test("computeCopies marks chained field access as non-copy", () => {
  const model = buildModel(SAMPLE);
  const itemsItem = model.items.find((i) => i.name === "items");
  expect(itemsItem).toBeDefined();
  const ref = model.references.find((r) => r.item === itemsItem?.id);
  expect(ref?.copies).toBe(false);
});

test("computeCopies marks a simple read as a copy", () => {
  const model = buildModel(SAMPLE);
  const countItem = model.items.find((i) => i.name === "count");
  expect(countItem).toBeDefined();
  const ref = model.references.find((r) => r.item === countItem?.id);
  expect(ref?.copies).toBe(true);
});

test("computeCopies marks an assignment LHS as non-copy", () => {
  const model = buildModel(ASSIGN);
  const mutItem = model.items.find((i) => i.name === "MUT");
  expect(mutItem).toBeDefined();
  const ref = model.references.find(
    (r) => r.item === mutItem?.id && r.copies === false,
  );
  expect(ref).toBeDefined();
});

test("formatModel produces a readable summary", () => {
  const model = buildModel(SAMPLE);
  const text = formatModel(model);
  expect(text).toContain("Modules (2)");
  expect(text).toContain("Store");
  expect(text).toContain("References");
  expect(text).toContain("Imports");
});

test("buildModel reports a missing tsconfig clearly", () => {
  expect(() => buildModel("/tmp/opencode/deslop-no-config-here")).toThrow(
    /no tsconfig.json found/,
  );
});

test("buildModel reports a tsconfig it cannot parse", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deslop-bad-config-"));
  try {
    fs.writeFileSync(
      path.join(dir, "tsconfig.json"),
      '{\n  "compilerOptions": { "target": "ES2022" },\n  "include": ["*.ts"\n}\n',
    );
    expect(() => buildModel(dir)).toThrow(/expected/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("buildModel records a re-export as an import edge", () => {
  const model = buildModel(REEXPORT);
  const agg = model.modules.find((m) => m.path.endsWith("agg.ts"));
  const base = model.modules.find((m) => m.path.endsWith("base.ts"));
  const edges = model.imports.filter(
    (e) => e.from === agg?.id && e.to === base?.id,
  );
  expect(edges.length).toBe(2);
  expect(edges.some((e) => e.typeOnly)).toBe(true);
  expect(edges.some((e) => !e.typeOnly && !e.dynamic)).toBe(true);
});

test("buildModel records a dynamic import as a dynamic edge", () => {
  const model = buildModel(DYNAMIC);
  const edge = model.imports.find((e) => e.dynamic);
  expect(edge).toBeDefined();
  const from = model.modules.find((m) => m.id === edge?.from);
  const to = model.modules.find((m) => m.id === edge?.to);
  expect(path.basename(from?.path ?? "")).toBe("main.ts");
  expect(path.basename(to?.path ?? "")).toBe("late.ts");
});

test("buildModel names a field declared with a string literal", () => {
  const model = buildModel(NAMES);
  const name = model.items.find((i) => i.name === "stringField");
  expect(name?.kind).toBe("field");
});

test("buildModel keeps a quoted field name and skips a computed one", () => {
  const model = buildModel(NAMES);
  const fields = model.items
    .filter((i) => i.kind === "field")
    .map((i) => i.name);
  expect(fields).toContain("stringField");
  expect(fields).toContain("quotedField");
  expect(fields).not.toContain("computedName");
});

test("computeCopies marks an element-access key read as a copy", () => {
  const model = buildModel(COPIES);
  expect(refIn(model, "readByKey", "KEY")?.copies).toBe(true);
});

test("computeCopies marks an element-access key write as non-copy", () => {
  const model = buildModel(COPIES);
  expect(refIn(model, "writeByKey", "KEY")?.copies).toBe(false);
});

test("computeCopies marks a field read inside an element access as a copy", () => {
  const model = buildModel(COPIES);
  expect(refIn(model, "readNested", "amount")?.copies).toBe(true);
});

test("computeCopies marks a field read in an arithmetic expression as a copy", () => {
  const model = buildModel(COPIES);
  expect(refIn(model, "addAmount", "amount")?.copies).toBe(true);
});
