import path from "path";
import type { FileCoverage, FunctionCrap, FunctionInfo, StatementCoverage } from "../types";
import { computeCrapScore, isCrappy as checkCrappy } from "../crap/score";

export function matchFunctions(
  functions: FunctionInfo[],
  coverage: FileCoverage[],
  threshold: number,
  warn: (msg: string) => void = console.warn,
): FunctionCrap[] {
  const coverageMap = buildCoverageMap(coverage);
  const functionsByFile = groupByFile(functions);
  return scoreFunctions(functionsByFile, coverageMap, functions, threshold, warn);
}

function buildCoverageMap(coverage: FileCoverage[]): Map<string, FileCoverage> {
  const map = new Map<string, FileCoverage>();
  for (const fc of coverage) map.set(normalize(fc.filePath), fc);
  return map;
}

function groupByFile(functions: FunctionInfo[]): Map<string, FunctionInfo[]> {
  const map = new Map<string, FunctionInfo[]>();
  for (const fn of functions) {
    const key = normalize(fn.filePath);
    const list = map.get(key) ?? [];
    list.push(fn);
    map.set(key, list);
  }
  return map;
}

function scoreFunctions(
  functionsByFile: Map<string, FunctionInfo[]>,
  coverageMap: Map<string, FileCoverage>,
  allFunctions: FunctionInfo[],
  threshold: number,
  warn: (msg: string) => void,
): FunctionCrap[] {
  const results: FunctionCrap[] = [];
  const warned = new Set<string>();

  for (const fn of allFunctions) {
    const key = normalize(fn.filePath);
    const fileCov = coverageMap.get(key);
    const fileFunctions = functionsByFile.get(key) ?? [];
    const coverage = computeFunctionCoverage(fn, fileCov, fileFunctions);
    warnIfUnmatched(key, fileCov, warned, warn);
    const crapScore = computeCrapScore(fn.complexity, coverage);
    results.push({
      ...fn,
      coverage,
      crapScore,
      isCrappy: checkCrappy(crapScore, threshold),
    });
  }

  return results;
}

function warnIfUnmatched(
  key: string,
  fileCov: FileCoverage | undefined,
  warned: Set<string>,
  warn: (msg: string) => void,
): void {
  if (!fileCov && !warned.has(key)) {
    warn(`Warning: no coverage data for ${key}`);
    warned.add(key);
  }
}

function computeFunctionCoverage(
  fn: FunctionInfo,
  fileCov: FileCoverage | undefined,
  fileFunctions: FunctionInfo[],
): number | null {
  if (!fileCov) return null;
  const overlapping = filterOverlapping(fileCov.statements, fn);
  if (overlapping.length === 0) return 0;
  const children = findDirectChildren(fn, fileFunctions);
  const filtered = subtractChildren(overlapping, children);
  if (filtered.length === 0) return 0;
  return countCovered(filtered) / filtered.length;
}

function filterOverlapping(statements: StatementCoverage[], fn: FunctionInfo): StatementCoverage[] {
  return statements.filter((s) => s.startLine >= fn.startLine && s.endLine <= fn.endLine);
}

function findDirectChildren(parent: FunctionInfo, all: FunctionInfo[]): FunctionInfo[] {
  const nested = all.filter(
    (f) => f !== parent && f.startLine >= parent.startLine && f.endLine <= parent.endLine,
  );
  return nested.filter(
    (child) =>
      !nested.some(
        (other) =>
          other !== child &&
          child.startLine >= other.startLine &&
          child.endLine <= other.endLine &&
          spanLength(other) < spanLength(parent),
      ),
  );
}

function subtractChildren(
  statements: StatementCoverage[],
  children: FunctionInfo[],
): StatementCoverage[] {
  return statements.filter(
    (s) => !children.some((c) => s.startLine >= c.startLine && s.endLine <= c.endLine),
  );
}

function countCovered(statements: StatementCoverage[]): number {
  return statements.filter((s) => s.hits > 0).length;
}

function spanLength(fn: FunctionInfo): number {
  return fn.endLine - fn.startLine;
}

function normalize(filePath: string): string {
  return path.resolve(filePath);
}
