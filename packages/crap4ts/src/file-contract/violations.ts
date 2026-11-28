import path from "node:path";
import type { FunctionCrap } from "../types";
import { normalizeBaselineKey } from "./path-key";
import { allowedCount } from "./baseline";
import type { BaselineDocument } from "./types";

export function violationsByFileKey(
  functions: FunctionCrap[],
  reportKeys: readonly string[],
): Map<string, number> {
  const keySet = new Set(reportKeys);
  const counts = new Map<string, number>();
  for (const key of reportKeys) counts.set(key, 0);
  for (const fn of functions) {
    const key = functionFileKey(fn.filePath);
    if (!keySet.has(key)) continue;
    if (!fn.isCrappy) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function functionFileKey(filePath: string): string {
  const relative = path.isAbsolute(filePath) ? path.relative(process.cwd(), filePath) : filePath;
  return normalizeBaselineKey(relative.replaceAll("\\", "/"));
}

export function buildReportRows(
  reportKeys: readonly string[],
  violations: Map<string, number>,
  baseline: BaselineDocument | null,
): Array<{
  path: string;
  violations: number;
  baseline: number;
  status: "ok" | "fail";
}> {
  const rows: Array<{
    path: string;
    violations: number;
    baseline: number;
    status: "ok" | "fail";
  }> = [];
  for (const key of reportKeys) {
    const count = violations.get(key) ?? 0;
    const allowed = baseline ? allowedCount(baseline, key) : 0;
    const status: "ok" | "fail" = count > allowed ? "fail" : "ok";
    rows.push({ path: key, violations: count, baseline: allowed, status });
  }
  return rows;
}

export function computeUpdatedBaseline(
  baseline: BaselineDocument,
  reportKeys: readonly string[],
  violations: Map<string, number>,
  fullScan: boolean,
  discoveredKeys: Set<string>,
): BaselineDocument | null {
  const files = { ...baseline.files };
  for (const key of reportKeys) {
    const count = violations.get(key) ?? 0;
    const allowed = files[key] ?? 0;
    if (count > allowed) return null;
    if (!(key in files) && count > 0) return null;
    if (count === 0) {
      delete files[key];
    } else {
      files[key] = count;
    }
  }
  if (fullScan) {
    for (const key of Object.keys(files)) {
      if (!discoveredKeys.has(key)) delete files[key];
    }
  }
  return { version: 1, files };
}
