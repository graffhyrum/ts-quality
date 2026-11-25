import path from "node:path";
import type { Item, Model, ModuleId, Reference } from "./model.ts";
import { isTestFile } from "../test-file.ts";

export type Check =
  | "module-cycle"
  | "tangle"
  | "field-leak"
  | "shallow-module"
  | "wide-directory"
  | "long-file";

export type Diagnostic = {
  readonly code: Check;
  readonly message: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly notes: readonly string[];
};

export type LintOptions = {
  readonly heldInMind: number;
  readonly maxLines: number;
  readonly excluded: readonly string[];
};

export const DEFAULT_OPTIONS: LintOptions = {
  heldInMind: 7,
  maxLines: 300,
  excluded: ["node_modules", "dist", "coverage", "build", ".git"],
};

export const CHECKS: readonly Check[] = [
  "module-cycle",
  "tangle",
  "field-leak",
  "shallow-module",
  "wide-directory",
  "long-file",
];

export function runLints(
  model: Model,
  options: LintOptions,
): readonly Diagnostic[] {
  const found: Diagnostic[] = [
    ...moduleCycle(model, options),
    ...tangle(model, options),
    ...fieldLeak(model, options),
    ...shallowModule(model, options),
    ...wideDirectory(model, options),
    ...longFile(model, options),
  ];
  return found.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
  });
}

export function formatDiagnostics(diagnostics: readonly Diagnostic[]): string {
  const lines: string[] = [];
  for (const d of diagnostics) {
    lines.push(`error[${d.code}]: ${d.message}`);
    lines.push(`  --> ${d.file}:${d.line}:${d.column}`);
    for (const note of d.notes) lines.push(`  = note: ${note}`);
    lines.push("");
  }
  return lines.join("\n");
}

function moduleCycle(model: Model, options: LintOptions): Diagnostic[] {
  const adjacency = new Map<number, number[]>();
  for (const m of model.modules) adjacency.set(m.id, []);
  const selfLoops = new Set<number>();
  for (const edge of model.imports) {
    if (edge.typeOnly) continue;
    if (edge.from === edge.to) selfLoops.add(edge.from);
    const neighbours = adjacency.get(edge.from);
    if (neighbours && !neighbours.includes(edge.to)) neighbours.push(edge.to);
  }

  const components = stronglyConnectedComponents(
    model.modules.map((m) => m.id),
    adjacency,
  );
  const out: Diagnostic[] = [];
  for (const component of components) {
    const cyclic =
      component.length > 1 ||
      (component.length === 1 && selfLoops.has(component[0] ?? -1));
    if (!cyclic) continue;
    const names = component.map((id) => relative(model, modulePath(model, id)));
    names.sort();
    if (isExcluded(modulePath(model, component[0] ?? -1), options)) continue;
    out.push({
      code: "module-cycle",
      message: `${names.length} modules form an import cycle`,
      file: names[0] ?? relative(model, model.root),
      line: 1,
      column: 1,
      notes: [`cycle: ${names.join(" -> ")} -> ${names[0]}`],
    });
  }
  return out;
}

function tangle(model: Model, options: LintOptions): Diagnostic[] {
  const adjacency = new Map<number, number[]>();
  for (const item of model.items) adjacency.set(item.id, []);
  for (const ref of model.references) {
    if (ref.holder === null) continue;
    const target = itemById(model, ref.item);
    if (!target) continue;
    const holder = itemById(model, ref.holder);
    if (!holder) continue;
    if (target.owner === ref.from && holder.owner === ref.from) continue;
    const neighbours = adjacency.get(ref.holder);
    if (neighbours && !neighbours.includes(ref.item)) neighbours.push(ref.item);
  }

  const components = stronglyConnectedComponents(
    model.items.map((i) => i.id),
    adjacency,
  );
  const out: Diagnostic[] = [];
  for (const component of components) {
    if (component.length <= options.heldInMind) continue;
    const owners = new Set<number>();
    for (const id of component) {
      const item = itemById(model, id);
      if (item) owners.add(item.owner);
    }
    if (owners.size < 2) continue;
    const first = itemById(model, component[0] ?? -1);
    if (!first || isExcluded(first.file, options)) continue;
    out.push({
      code: "tangle",
      message: `${component.length} items mutually reference each other across ${owners.size} modules`,
      file: relative(model, first.file),
      line: first.line,
      column: 1,
      notes: [`held-in-mind limit is ${options.heldInMind}`],
    });
  }
  return out;
}

function fieldLeak(model: Model, options: LintOptions): Diagnostic[] {
  const byField = new Map<number, Reference[]>();
  for (const ref of model.references) {
    const item = itemById(model, ref.item);
    if (!item || item.kind !== "field") continue;
    if (item.owner === ref.from) continue;
    const existing = byField.get(item.id) ?? [];
    existing.push(ref);
    byField.set(item.id, existing);
  }

  const out: Diagnostic[] = [];
  for (const [id, refs] of byField) {
    const item = itemById(model, id);
    if (!item || isExcluded(item.file, options)) continue;
    const places = refs
      .map((r) => `${relative(model, r.file)}:${r.line}`)
      .sort();
    const owner = modulePath(model, item.owner);
    out.push({
      code: "field-leak",
      message: `\`${item.name}\` is known outside its module in ${places.length} place(s)`,
      file: relative(model, item.file),
      line: item.line,
      column: 1,
      notes: [
        `owner: ${relative(model, owner)}`,
        ...places.map((p) => `used at ${p}`),
      ],
    });
  }
  return out;
}

function shallowModule(model: Model, options: LintOptions): Diagnostic[] {
  const learned = new Map<string, Set<number>>();
  for (const ref of model.references) {
    const item = itemById(model, ref.item);
    if (!item || !item.exported) continue;
    if (item.owner === ref.from) continue;
    const key = `${ref.from}:${item.owner}`;
    const set = learned.get(key) ?? new Set<number>();
    set.add(item.id);
    learned.set(key, set);
  }

  const out: Diagnostic[] = [];
  for (const [key, set] of learned) {
    if (set.size <= options.heldInMind) continue;
    const [callerId, ownerId] = key.split(":").map(Number);
    const caller = modulePath(model, callerId ?? -1);
    const owner = modulePath(model, ownerId ?? -1);
    if (isExcluded(owner, options)) continue;
    out.push({
      code: "shallow-module",
      message: `a caller learns ${set.size} exports of a module, more than the held-in-mind limit`,
      file: relative(model, owner),
      line: 1,
      column: 1,
      notes: [
        `caller: ${relative(model, caller)}`,
        `interface should be narrowed to at most ${options.heldInMind} exports`,
      ],
    });
  }
  return out;
}

function wideDirectory(model: Model, options: LintOptions): Diagnostic[] {
  const children = new Map<string, Set<string>>();
  for (const m of model.modules) {
    if (isExcluded(m.path, options)) continue;
    const rel = path.relative(model.root, m.path);
    const segments = rel.split(/[\\/]/).filter((s) => s.length > 0);
    let dir = model.root;
    for (const segment of segments) {
      const kids = children.get(dir) ?? new Set<string>();
      kids.add(segment);
      children.set(dir, kids);
      dir = path.join(dir, segment);
    }
  }

  const out: Diagnostic[] = [];
  for (const [dir, kids] of children) {
    if (kids.size <= options.heldInMind) continue;
    if (isExcluded(dir, options)) continue;
    if (dir === model.root) continue;
    const names = [...kids].sort();
    out.push({
      code: "wide-directory",
      message: `directory has ${kids.size} direct children, more than the held-in-mind limit`,
      file: relative(model, dir),
      line: 1,
      column: 1,
      notes: [
        `children: ${names.join(", ")}`,
        `limit is ${options.heldInMind}`,
      ],
    });
  }
  return out;
}

function longFile(model: Model, options: LintOptions): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const m of model.modules) {
    if (m.lines <= options.maxLines) continue;
    if (isExcluded(m.path, options)) continue;
    if (isTestFile(m.path) || m.path.endsWith(".d.ts")) continue;
    out.push({
      code: "long-file",
      message: `file has ${m.lines} lines, more than the ${options.maxLines} line limit`,
      file: relative(model, m.path),
      line: 1,
      column: 1,
      notes: [
        "split this file into deeper modules behind a narrower interface",
      ],
    });
  }
  return out;
}

function stronglyConnectedComponents(
  nodes: readonly number[],
  adjacency: ReadonlyMap<number, readonly number[]>,
): number[][] {
  const index = new Map<number, number>();
  const low = new Map<number, number>();
  const onStack = new Set<number>();
  const stack: number[] = [];
  const result: number[][] = [];
  let counter = 0;

  function visit(v: number): void {
    index.set(v, counter);
    low.set(v, counter);
    counter += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of adjacency.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v) ?? 0, low.get(w) ?? 0));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v) ?? 0, index.get(w) ?? 0));
      }
    }
    if (low.get(v) === index.get(v)) {
      const component: number[] = [];
      while (stack.length > 0) {
        const w = stack.pop();
        if (w === undefined) break;
        onStack.delete(w);
        component.push(w);
        if (w === v) break;
      }
      result.push(component);
    }
  }

  for (const v of nodes) {
    if (!index.has(v)) visit(v);
  }
  return result;
}

function itemById(model: Model, id: number): Item | undefined {
  return model.items.find((i) => i.id === id);
}

function modulePath(model: Model, id: ModuleId): string {
  return model.modules.find((m) => m.id === id)?.path ?? model.root;
}

function relative(model: Model, file: string): string {
  const rel = path.relative(model.root, file);
  return rel.length === 0 ? path.basename(file) : rel;
}

function isExcluded(file: string, options: LintOptions): boolean {
  const segments = file.split(/[\\/]/);
  for (const segment of segments) {
    if (options.excluded.includes(segment)) return true;
    if (segment.startsWith(".") && segment.length > 1) return true;
  }
  return false;
}
