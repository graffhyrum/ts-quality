import { promises as fs } from "node:fs";
import path from "node:path";
import { comparePath, normalizeBaselineKey, UsageError } from "./path-key.ts";
import { pathExists } from "./read-inputs.ts";
import { BASELINE_VERSION, type BaselineDocument, type RenamePair } from "./types.ts";

export const DEFAULT_BASELINE_PATH = ".quality/mutate4ts-baseline.json";

export async function readBaselineFile(baselinePath: string): Promise<BaselineDocument | null> {
  try {
    await fs.access(baselinePath);
  } catch {
    return null;
  }
  const raw = await Bun.file(baselinePath).text();
  if (raw.startsWith("\uFEFF")) {
    throw new UsageError("baseline file: UTF-8 BOM is not allowed");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UsageError("baseline file: invalid JSON");
  }
  return validateBaselineDocument(parsed);
}

function validateBaselineDocument(value: unknown): BaselineDocument {
  if (!value || typeof value !== "object") {
    throw new UsageError("baseline file: invalid shape");
  }
  const doc = value as Record<string, unknown>;
  if (doc.version !== BASELINE_VERSION) {
    throw new UsageError("baseline file: unsupported version");
  }
  if (!doc.files || typeof doc.files !== "object" || Array.isArray(doc.files)) {
    throw new UsageError("baseline file: invalid files map");
  }
  const files: Record<string, number> = {};
  for (const [key, count] of Object.entries(doc.files as Record<string, unknown>)) {
    try {
      normalizeBaselineKey(key);
    } catch {
      throw new UsageError(`baseline file: invalid key ${key}`);
    }
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      throw new UsageError(`baseline file: invalid count for ${key}`);
    }
    if (count > 0) files[key] = count;
  }
  return { version: BASELINE_VERSION, files };
}

export function allowedCount(baseline: BaselineDocument | null, key: string): number {
  if (!baseline) return 0;
  return baseline.files[key] ?? 0;
}

export async function applyRenamesInMemory(
  baseline: BaselineDocument,
  pairs: RenamePair[],
): Promise<BaselineDocument> {
  const sorted = [...pairs].sort((a, b) => comparePath(a.to, b.to));
  validateRenameGraph(sorted);
  const files = { ...baseline.files };
  let remaining = [...sorted];
  while (remaining.length > 0) {
    const fromSet = new Set(remaining.map((p) => p.from));
    const ready = remaining.filter((p) => !fromSet.has(p.to));
    if (ready.length === 0) {
      throw new UsageError("rename map contains a cycle");
    }
    for (const pair of ready) {
      await applyRenamePair(files, pair);
      remaining = remaining.filter((p) => p !== pair);
    }
  }
  return { version: BASELINE_VERSION, files };
}

function validateRenameGraph(pairs: RenamePair[]): void {
  const toCounts = new Map<string, number>();
  for (const pair of pairs) {
    toCounts.set(pair.to, (toCounts.get(pair.to) ?? 0) + 1);
    if ((toCounts.get(pair.to) ?? 0) > 1) {
      throw new UsageError("rename map: duplicate to path");
    }
  }
}

async function applyRenamePair(files: Record<string, number>, pair: RenamePair): Promise<void> {
  const toExists = await pathExists(pair.to);
  if (!toExists) {
    throw new UsageError(`rename map: to path does not exist: ${pair.to}`);
  }
  if (!(pair.from in files)) {
    return;
  }
  if (pair.to in files) {
    throw new UsageError(`rename map: to path already has a baseline key: ${pair.to}`);
  }
  const fromCount = files[pair.from];
  if (fromCount === undefined) return;
  files[pair.to] = fromCount;
  delete files[pair.from];
}

export async function writeBaselineIfChanged(
  baselinePath: string,
  doc: BaselineDocument,
): Promise<void> {
  const next = serializeBaseline(doc);
  let previous = "";
  try {
    previous = await Bun.file(baselinePath).text();
  } catch {
    previous = "";
  }
  if (previous === next) return;
  await fs.mkdir(path.dirname(baselinePath), { recursive: true });
  await fs.writeFile(baselinePath, next, "utf8");
}

export function serializeBaseline(doc: BaselineDocument): string {
  const sortedKeys = Object.keys(doc.files).sort(comparePath);
  const files: Record<string, number> = {};
  for (const key of sortedKeys) {
    const count = doc.files[key];
    if (count !== undefined && count > 0) files[key] = count;
  }
  return `${JSON.stringify({ version: BASELINE_VERSION, files }, null, 2)}\n`;
}

export function buildSeedBaseline(violationsByFile: Map<string, number>): BaselineDocument {
  const files: Record<string, number> = {};
  for (const [key, count] of violationsByFile) {
    if (count > 0) files[key] = count;
  }
  return { version: BASELINE_VERSION, files };
}

export function pruneMissingKeys(
  baseline: BaselineDocument,
  existingKeys: Set<string>,
): BaselineDocument {
  const files: Record<string, number> = {};
  for (const [key, count] of Object.entries(baseline.files)) {
    if (existingKeys.has(key)) files[key] = count;
  }
  return { version: BASELINE_VERSION, files };
}

export async function assertBaselineAbsent(baselinePath: string): Promise<void> {
  if (await pathExists(baselinePath)) {
    throw new UsageError("baseline file already exists");
  }
}

export function assertBaselinePresent(
  baseline: BaselineDocument | null,
): asserts baseline is BaselineDocument {
  if (!baseline) {
    throw new UsageError("baseline file missing; run a full scan with --seed first");
  }
}
