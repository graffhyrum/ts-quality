import type { FunctionCrap, ProjectSummary } from "../types";

export function computeCrapScore(complexity: number, coverage: number | null): number {
  const cov = coverage ?? 0;
  return complexity * complexity * Math.pow(1 - cov, 3) + complexity;
}

export function isCrappy(score: number, threshold: number): boolean {
  return score >= threshold;
}

export function summarize(functions: FunctionCrap[], projectThreshold: number): ProjectSummary {
  const totalFunctions = functions.length;
  const crappyCount = functions.filter((f) => f.isCrappy).length;
  const crappyPercent = totalFunctions > 0 ? (crappyCount / totalFunctions) * 100 : 0;
  const isFlagged = crappyPercent > projectThreshold;
  return { functions, totalFunctions, crappyCount, crappyPercent, isFlagged };
}
