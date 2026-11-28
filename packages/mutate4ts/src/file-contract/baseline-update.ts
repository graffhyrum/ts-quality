import { promises as fs } from "node:fs";
import { BASELINE_VERSION, type BaselineDocument } from "./types.ts";

export async function buildUpdatedBaseline(
  baseline: BaselineDocument,
  violationsByFile: Map<string, number>,
  selectedKeys: Set<string>,
  isFullScan: boolean,
): Promise<BaselineDocument> {
  const files = { ...baseline.files };
  for (const key of selectedKeys) {
    const actual = violationsByFile.get(key) ?? 0;
    const stored = files[key];
    if (stored === undefined) {
      continue;
    }
    if (actual < stored) {
      if (actual > 0) files[key] = actual;
      else delete files[key];
    }
  }
  if (!isFullScan) {
    return { version: BASELINE_VERSION, files: omitZero(files) };
  }
  const pruned: Record<string, number> = {};
  for (const [key, count] of Object.entries(files)) {
    if (count <= 0) continue;
    try {
      await fs.access(key);
      pruned[key] = count;
    } catch {
      // drop keys for deleted files on full-scan update
    }
  }
  return { version: BASELINE_VERSION, files: pruned };
}

function omitZero(files: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, count] of Object.entries(files)) {
    if (count > 0) out[key] = count;
  }
  return out;
}
