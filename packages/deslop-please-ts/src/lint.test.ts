import { test, expect } from "bun:test";
import {
  CHECKS,
  DEFAULT_OPTIONS,
  formatDiagnostics,
  runLints,
  type Check,
} from "./lint.ts";
import type {
  ImportEdge,
  Item,
  Model,
  ModuleInfo,
  Reference,
} from "./model.ts";

const ROOT = "/proj";

function makeModel(overrides: Partial<Model> = {}): Model {
  return {
    root: ROOT,
    modules: [],
    items: [],
    references: [],
    imports: [],
    ...overrides,
  };
}

function moduleAt(id: number, name: string, lines = 1): ModuleInfo {
  return { id, path: `${ROOT}/${name}`, lines };
}

function functionItem(id: number, owner: number, exported = false): Item {
  return {
    id,
    kind: "function",
    name: `fn${id}`,
    owner,
    parent: null,
    file: `${ROOT}/lib.ts`,
    line: id + 1,
    exported,
  };
}

function ref(from: number, holder: number | null, item: number): Reference {
  return {
    file: `${ROOT}/app.ts`,
    line: 1,
    from,
    holder,
    item,
    copies: true,
  };
}

function edge(from: number, to: number, typeOnly = false): ImportEdge {
  return { from, to, typeOnly, dynamic: false };
}

function codes(model: Model): Check[] {
  return runLints(model, DEFAULT_OPTIONS).map((d) => d.code);
}

test("runLints reports nothing for an empty model", () => {
  expect(runLints(makeModel(), DEFAULT_OPTIONS)).toEqual([]);
});

test("module-cycle flags a two-file import cycle", () => {
  const model = makeModel({
    modules: [moduleAt(0, "a.ts"), moduleAt(1, "b.ts")],
    imports: [edge(0, 1), edge(1, 0)],
  });
  expect(codes(model)).toContain("module-cycle");
  const d = runLints(model, DEFAULT_OPTIONS).find(
    (x) => x.code === "module-cycle",
  );
  expect(d?.notes[0]).toContain("a.ts");
  expect(d?.notes[0]).toContain("b.ts");
});

test("module-cycle ignores type-only imports", () => {
  const model = makeModel({
    modules: [moduleAt(0, "a.ts"), moduleAt(1, "b.ts")],
    imports: [edge(0, 1, true), edge(1, 0, true)],
  });
  expect(codes(model)).not.toContain("module-cycle");
});

test("module-cycle flags a self import", () => {
  const model = makeModel({
    modules: [moduleAt(0, "a.ts")],
    imports: [edge(0, 0)],
  });
  expect(codes(model)).toContain("module-cycle");
});

test("module-cycle leaves an acyclic graph clean", () => {
  const model = makeModel({
    modules: [moduleAt(0, "a.ts"), moduleAt(1, "b.ts")],
    imports: [edge(0, 1)],
  });
  expect(codes(model)).not.toContain("module-cycle");
});

test("tangle flags a group larger than held-in-mind across modules", () => {
  const items = Array.from({ length: 8 }, (_, i) => functionItem(i, i % 2));
  const references = items.map((it, i) =>
    ref(it.owner, it.id, items[(i + 1) % items.length]?.id ?? 0),
  );
  const model = makeModel({
    modules: [moduleAt(0, "a.ts"), moduleAt(1, "b.ts")],
    items,
    references,
  });
  expect(codes(model)).toContain("tangle");
});

test("tangle leaves a small group clean", () => {
  const items = Array.from({ length: 3 }, (_, i) => functionItem(i, i % 2));
  const references = items.map((it, i) =>
    ref(it.owner, it.id, items[(i + 1) % items.length]?.id ?? 0),
  );
  const model = makeModel({ items, references });
  expect(codes(model)).not.toContain("tangle");
});

test("field-leak flags a field referenced from another module", () => {
  const field: Item = {
    id: 0,
    kind: "field",
    name: "value",
    owner: 0,
    parent: null,
    file: `${ROOT}/box.ts`,
    line: 2,
    exported: false,
  };
  const model = makeModel({
    modules: [moduleAt(0, "box.ts"), moduleAt(1, "app.ts")],
    items: [field],
    references: [ref(1, null, 0)],
  });
  expect(codes(model)).toContain("field-leak");
  const d = runLints(model, DEFAULT_OPTIONS).find(
    (x) => x.code === "field-leak",
  );
  expect(d?.message).toContain("value");
  expect(d?.notes.some((n) => n.includes("app.ts:1"))).toBe(true);
});

test("field-leak ignores a field used only inside its own module", () => {
  const field: Item = {
    id: 0,
    kind: "field",
    name: "value",
    owner: 0,
    parent: null,
    file: `${ROOT}/box.ts`,
    line: 2,
    exported: false,
  };
  const model = makeModel({
    modules: [moduleAt(0, "box.ts")],
    items: [field],
    references: [ref(0, null, 0)],
  });
  expect(codes(model)).not.toContain("field-leak");
});

test("shallow-module flags a caller learning more than seven exports", () => {
  const items = Array.from({ length: 8 }, (_, i) => functionItem(i, 0, true));
  const references = items.map((it) => ref(1, null, it.id));
  const model = makeModel({
    modules: [moduleAt(0, "lib.ts"), moduleAt(1, "app.ts")],
    items,
    references,
  });
  expect(codes(model)).toContain("shallow-module");
});

test("shallow-module leaves a narrow interface clean", () => {
  const items = Array.from({ length: 3 }, (_, i) => functionItem(i, 0, true));
  const references = items.map((it) => ref(1, null, it.id));
  const model = makeModel({ items, references });
  expect(codes(model)).not.toContain("shallow-module");
});

test("wide-directory flags a directory with eight direct children", () => {
  const modules = Array.from({ length: 8 }, (_, i) =>
    moduleAt(i, `bucket/f${i}.ts`),
  );
  const model = makeModel({ modules });
  expect(codes(model)).toContain("wide-directory");
  const d = runLints(model, DEFAULT_OPTIONS).find(
    (x) => x.code === "wide-directory",
  );
  expect(d?.notes.some((n) => n.includes("children:"))).toBe(true);
});

test("wide-directory leaves a narrow directory clean", () => {
  const model = makeModel({
    modules: [moduleAt(0, "a.ts"), moduleAt(1, "b.ts")],
  });
  expect(codes(model)).not.toContain("wide-directory");
});

test("long-file flags a file over the line limit", () => {
  const model = makeModel({ modules: [moduleAt(0, "big.ts", 301)] });
  expect(codes(model)).toContain("long-file");
});

test("long-file exempts test files", () => {
  const model = makeModel({ modules: [moduleAt(0, "big.test.ts", 400)] });
  expect(codes(model)).not.toContain("long-file");
});

test("long-file leaves short files clean", () => {
  const model = makeModel({ modules: [moduleAt(0, "small.ts", 10)] });
  expect(codes(model)).not.toContain("long-file");
});

test("excluded vendor paths are not linted", () => {
  const model = makeModel({
    modules: [{ id: 0, path: `${ROOT}/node_modules/pkg/big.ts`, lines: 500 }],
  });
  expect(runLints(model, DEFAULT_OPTIONS)).toEqual([]);
});

test("options override the held-in-mind and line thresholds", () => {
  const model = makeModel({
    modules: [moduleAt(0, "big.ts", 12)],
  });
  expect(
    runLints(model, { ...DEFAULT_OPTIONS, maxLines: 10 }).map((d) => d.code),
  ).toContain("long-file");
});

test("diagnostics on the same file are sorted by line", () => {
  const field = (id: number, name: string, line: number): Item => ({
    id,
    kind: "field",
    name,
    owner: 0,
    parent: null,
    file: `${ROOT}/box.ts`,
    line,
    exported: false,
  });
  const model = makeModel({
    modules: [moduleAt(0, "box.ts"), moduleAt(1, "app.ts")],
    items: [field(0, "declaredLater", 9), field(1, "declaredFirst", 3)],
    references: [ref(1, null, 0), ref(1, null, 1)],
  });
  const found = runLints(model, DEFAULT_OPTIONS);
  expect(found.length).toBe(2);
  expect(found.map((d) => d.line)).toEqual([3, 9]);
});

test("diagnostics on the same file and line are sorted by code", () => {
  const children = Array.from({ length: 8 }, (_, i) =>
    moduleAt(i + 1, `bucket/f${i}.ts`),
  );
  const model = makeModel({
    modules: [{ id: 0, path: `${ROOT}/bucket`, lines: 301 }, ...children],
  });
  const found = runLints(model, DEFAULT_OPTIONS);
  expect(found.map((d) => d.code)).toEqual(["long-file", "wide-directory"]);
});

test("diagnostics are sorted by file then code", () => {
  const model = makeModel({
    modules: [moduleAt(0, "big.ts", 301), moduleAt(1, "z.ts", 301)],
  });
  const found = runLints(model, DEFAULT_OPTIONS);
  expect(found.length).toBe(2);
  expect(found[0]?.file).toBe("big.ts");
  expect(found[1]?.file).toBe("z.ts");
});

test("formatDiagnostics renders rustc-style output", () => {
  const model = makeModel({ modules: [moduleAt(0, "big.ts", 301)] });
  const text = formatDiagnostics(runLints(model, DEFAULT_OPTIONS));
  expect(text).toContain("error[long-file]:");
  expect(text).toContain("--> big.ts:1:1");
  expect(text).toContain("= note:");
});

test("CHECKS lists all six lints", () => {
  expect(CHECKS).toEqual([
    "module-cycle",
    "tangle",
    "field-leak",
    "shallow-module",
    "wide-directory",
    "long-file",
  ]);
});
