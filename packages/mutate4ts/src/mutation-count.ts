import type { MutationOutcome, MutationResult } from "./execute.ts";

export type AggregatedRun = {
  violationsByFile: Map<string, number>;
  allResults: MutationResult[];
  perFileResults: Map<string, MutationResult[]>;
};

export function createAggregatedRun(): AggregatedRun {
  return {
    violationsByFile: new Map(),
    allResults: [],
    perFileResults: new Map(),
  };
}

export function recordFileResults(
  agg: AggregatedRun,
  filePath: string,
  results: readonly MutationResult[],
): void {
  const copies = [...results];
  agg.perFileResults.set(filePath, copies);
  agg.allResults.push(...copies);
  mergeResults(agg.violationsByFile, filePath, results);
}

export function mergeResults(
  target: Map<string, number>,
  filePath: string,
  results: readonly MutationResult[],
): void {
  const prior = target.get(filePath) ?? 0;
  target.set(filePath, prior + countSurvivors(results));
}

export function countSurvivors(results: readonly MutationResult[]): number {
  return results.filter((r) => r.outcome.status === "survived").length;
}

export function hasMutationError(results: readonly MutationResult[]): boolean {
  return results.some((r) => r.outcome.status === "error");
}

export function mutationToolExitCode(results: readonly MutationResult[]): 0 | 1 | 3 {
  let code: 0 | 1 | 3 = 0;
  for (const r of results) {
    const mapped = OUTCOME_EXIT[r.outcome.status];
    if (mapped > code) code = mapped;
  }
  return code;
}

const OUTCOME_EXIT: Record<MutationOutcome["status"], 0 | 1 | 3> = {
  killed: 0,
  survived: 1,
  timeout: 0,
  error: 3,
};
