import { allowedCount } from "./baseline.ts";
import {
  QUALITY_REPORT_SCHEMA,
  type BaselineDocument,
  type QualityReport,
  type QualityReportFile,
} from "./types.ts";

export function buildQualityReport(
  violationsByFile: Map<string, number>,
  baseline: BaselineDocument | null,
  toolExitCode: number,
): QualityReport {
  const files: QualityReportFile[] = [];
  const sortedKeys = [...violationsByFile.keys()].sort((a, b) => a.localeCompare(b));
  for (const path of sortedKeys) {
    const violations = violationsByFile.get(path) ?? 0;
    const base = allowedCount(baseline, path);
    const status = violations <= base ? "ok" : "fail";
    files.push({ path, violations, baseline: base, status });
  }
  const failed = files.filter((f) => f.status === "fail").length;
  const violations = files.reduce((n, f) => n + f.violations, 0);
  const baselineFail = failed > 0;
  const exitCode = computeProcessExit(baseline, baselineFail, toolExitCode);
  return {
    schema: QUALITY_REPORT_SCHEMA,
    tool: "mutate4ts",
    exitCode,
    ok: exitCode === 0,
    files,
    totals: { files: files.length, violations, failed },
  };
}

function computeProcessExit(
  baseline: BaselineDocument | null,
  baselineFail: boolean,
  toolExitCode: number,
): number {
  if (baselineFail) return Math.max(1, toolExitCode);
  if (baseline) {
    // Mutation survivors are gated by the baseline; only errored mutants retain exit 3.
    return toolExitCode >= 3 ? toolExitCode : 0;
  }
  return toolExitCode;
}

export function formatQualityReportJson(report: QualityReport): string {
  return `${JSON.stringify(report)}\n`;
}

export function baselineWouldFail(
  violationsByFile: Map<string, number>,
  baseline: BaselineDocument | null,
  selectedKeys: Iterable<string>,
): boolean {
  for (const key of selectedKeys) {
    const violations = violationsByFile.get(key) ?? 0;
    if (violations > allowedCount(baseline, key)) return true;
  }
  return false;
}

export function newViolationsWouldIncreaseBaseline(
  violationsByFile: Map<string, number>,
  baseline: BaselineDocument | null,
  selectedKeys: Iterable<string>,
): boolean {
  for (const key of selectedKeys) {
    const violations = violationsByFile.get(key) ?? 0;
    const allowed = allowedCount(baseline, key);
    if (!(key in (baseline?.files ?? {})) && violations > 0) return true;
    if (violations > allowed) return true;
  }
  return false;
}
