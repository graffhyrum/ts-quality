import path from "path";
import { Glob } from "bun";
import {
  applyRenamesInMemory,
  assertBaselineAbsent,
  assertBaselinePresent,
  buildSeedBaseline,
  readBaselineFile,
  writeBaselineIfChanged,
} from "./file-contract/baseline";
import { buildQualityReport, printQualityReport } from "./file-contract/quality-report";
import { absolutePathForKey, comparePath } from "./file-contract/path-key";
import {
  buildScopedKeys,
  resolveSelectionMode,
  type FileSelection,
  type TargetingInputs,
} from "./file-contract/selection";
import {
  buildReportRows,
  computeUpdatedBaseline,
  functionFileKey,
  violationsByFileKey,
} from "./file-contract/violations";
import type { BaselineDocument } from "./file-contract/types";
import type {
  Config,
  FileCoverage,
  FunctionCrap,
  FunctionInfo,
  ProjectSummary,
  SortField,
} from "./types";
import { CrapError } from "./types";
import { analyzeComplexity } from "./complexity/analyze";
import { parseCoverage } from "./coverage/resolve";
import { matchFunctions } from "./mapping/match";
import { summarize } from "./crap/score";
import { renderTable } from "./report/table";
import { renderJson } from "./report/json";
import { renderHtml } from "./report/html";
import { bunFileSystem } from "./detect/fs";
import type { FileSystem } from "./detect/types";
import { isGitignored, loadGitignoreGlobs } from "./gitignore";

export type AnalysisPlan = FileSelection & {
  sourcePaths: string[];
  reportKeys: string[];
};

export async function runPipeline(
  config: Config,
  fs: FileSystem = bunFileSystem,
): Promise<0 | 1 | 2> {
  const plan = await buildAnalysisPlan(config, fs);
  if (plan.mode === "scoped" && plan.reportKeys.length === 0) {
    return finishWithNoFiles(config, plan, new Map(), fs);
  }
  if (plan.sourcePaths.length === 0) {
    console.error("No source files found.");
    return 2;
  }
  const quiet = config.quiet === true;
  const warnings: string[] = [];
  const warn = (msg: string) => warnings.push(msg);
  try {
    if (config.onlyCrappyDeprecated) {
      warn("--only-crappy is deprecated (now the default). Use --all to show all functions.");
    }
    const functions = await analyzeAllFiles(plan.sourcePaths, fs);
    const coverage = await readAndParseCoverage(config, fs);
    const allMatched = matchFunctions(functions, coverage, config.threshold, warn);
    const inScope = filterFunctionsToReportKeys(allMatched, plan.reportKeys);
    const violations = violationsByFileKey(allMatched, plan.reportKeys);
    const baselineState = await loadBaselineState(config, plan);
    if (config.seed) {
      return await runSeed(config, plan, violations, warnings);
    }
    const rows = buildReportRows(plan.reportKeys, violations, baselineState.effective);
    let exitCode = resolveExitCode(config, rows, baselineState.effective, inScope);
    if (config.updateBaseline) {
      const updated = await runUpdateBaseline(config, plan, violations, baselineState, rows);
      if (updated === "blocked") exitCode = 1;
    }
    await emitOutputs(config, { functions: inScope, rows, exitCode, plan, quiet, warnings });
    return exitCode;
  } catch (error) {
    for (const message of warnings) console.warn(message);
    throw error;
  }
}

async function buildAnalysisPlan(config: Config, fs: FileSystem): Promise<AnalysisPlan> {
  const gitignoreGlobs = config.skipGitignore ? [] : await loadGitignoreGlobs(".", fs);
  const inputs: TargetingInputs = {
    filesFlags: config.targeting.filesFlags,
    filesFromPresent: config.targeting.filesFromPresent,
    filesFromEmpty: config.targeting.filesFromEmpty,
    legacyPresent: config.targeting.legacyPresent,
  };
  const mode = resolveSelectionMode(inputs);
  if (mode === "scoped") {
    const literal = [...config.targeting.filesFlags, ...config.targeting.filesFromPaths];
    const scopedKeys = await buildScopedKeys(
      literal,
      config.targeting.legacyFiles,
      gitignoreGlobs,
      config.skipGitignore,
      fs,
    );
    const sourcePaths = scopedKeys.map((key) => absolutePathForKey(key));
    return { mode, scopedKeys, sourcePaths, reportKeys: scopedKeys };
  }
  const sourcePaths = await resolveGlobFiles(config.include, config.exclude, gitignoreGlobs);
  const reportKeys = sourcePaths.map((p) => functionFileKey(p)).sort(comparePath);
  return { mode, scopedKeys: [], sourcePaths, reportKeys };
}

function filterFunctionsToReportKeys(
  functions: FunctionCrap[],
  reportKeys: readonly string[],
): FunctionCrap[] {
  const keys = new Set(reportKeys);
  return functions.filter((fn) => keys.has(functionFileKey(fn.filePath)));
}

async function finishWithNoFiles(
  config: Config,
  plan: AnalysisPlan,
  violations: Map<string, number>,
  fs: FileSystem,
): Promise<0 | 1 | 2> {
  const baselineState = await loadBaselineState(config, plan);
  const rows = buildReportRows(plan.reportKeys, violations, baselineState.effective);
  const exitCode = resolveExitCode(config, rows, baselineState.effective, []);
  if (config.reportJson) {
    const report = buildQualityReport(rows, exitCode);
    printQualityReport(report);
    return exitCode;
  }
  return exitCode;
}

function resolveExitCode(
  config: Config,
  rows: ReturnType<typeof buildReportRows>,
  baseline: BaselineDocument | null,
  inScope: FunctionCrap[],
): 0 | 1 {
  if (baseline) {
    return rows.some((r) => r.status === "fail") ? 1 : 0;
  }
  const summary = summarize(inScope, config.projectThreshold);
  return summary.isFlagged ? 1 : 0;
}

type BaselineState = {
  onDisk: BaselineDocument | null;
  effective: BaselineDocument | null;
};

async function loadBaselineState(config: Config, plan: AnalysisPlan): Promise<BaselineState> {
  const onDisk = await readBaselineFile(config.baselinePath);
  if (config.updateBaseline) assertBaselinePresent(onDisk);
  let effective = onDisk;
  if (effective && config.targeting.renamePairs.length > 0) {
    effective = await applyRenamesInMemory(effective, config.targeting.renamePairs);
  } else if (!effective && config.targeting.renamePairs.length > 0) {
    for (const pair of config.targeting.renamePairs) {
      if (!(await Bun.file(pair.to).exists())) {
        throw new CrapError(`rename map: to path does not exist: ${pair.to}`);
      }
    }
  }
  return { onDisk, effective };
}

async function runSeed(
  config: Config,
  plan: AnalysisPlan,
  violations: Map<string, number>,
  warnings: string[],
): Promise<0 | 1 | 2> {
  if (plan.mode !== "full") {
    throw new CrapError("--seed requires a full scan with no file list");
  }
  await assertBaselineAbsent(config.baselinePath);
  const doc = buildSeedBaseline(violations);
  await writeBaselineIfChanged(config.baselinePath, doc);
  for (const message of warnings) console.warn(message);
  if (config.reportJson) {
    const rows = buildReportRows(plan.reportKeys, violations, null);
    const report = buildQualityReport(rows, 0);
    printQualityReport(report);
  }
  return 0;
}

async function runUpdateBaseline(
  config: Config,
  plan: AnalysisPlan,
  violations: Map<string, number>,
  baselineState: BaselineState,
  rows: ReturnType<typeof buildReportRows>,
): Promise<"ok" | "blocked"> {
  if (rows.some((r) => r.status === "fail")) return "blocked";
  if (!baselineState.onDisk) return "blocked";
  const base = baselineState.onDisk;
  let effective = base;
  if (config.targeting.renamePairs.length > 0) {
    effective = await applyRenamesInMemory(effective, config.targeting.renamePairs);
  }
  const discovered = new Set(plan.reportKeys);
  const updated = computeUpdatedBaseline(
    effective,
    plan.reportKeys,
    violations,
    plan.mode === "full",
    discovered,
  );
  if (!updated) return "blocked";
  await writeBaselineIfChanged(config.baselinePath, updated);
  return "ok";
}

async function emitOutputs(
  config: Config,
  ctx: {
    functions: FunctionCrap[];
    rows: ReturnType<typeof buildReportRows>;
    exitCode: 0 | 1 | 2;
    plan: AnalysisPlan;
    quiet: boolean;
    warnings: string[];
  },
): Promise<void> {
  const { functions, rows, exitCode, plan, quiet, warnings } = ctx;
  const flagged = exitCode !== 0;
  if (!quiet || flagged) {
    for (const message of warnings) console.warn(message);
  }
  if (config.reportJson) {
    const report = buildQualityReport(rows, exitCode);
    printQualityReport(report);
    return;
  }
  const sorted = sortFunctions(functions, config.sort);
  const summary = summarize(sorted, config.projectThreshold);
  const displayed = config.showAll ? sorted : sorted.filter((f) => f.isCrappy);
  const legacySummary: ProjectSummary = {
    ...summary,
    isFlagged: flagged,
    functions: displayed,
  };
  const output = renderOutput(legacySummary, config);
  await writeOutput(output, config, { quiet, flagged });
}

async function resolveGlobFiles(
  include: string,
  exclude: string,
  gitignoreGlobs: Glob[],
): Promise<string[]> {
  const includeGlob = new Glob(include);
  const excludeGlob = new Glob(exclude);
  const results: string[] = [];
  for await (const file of includeGlob.scan({ cwd: "." })) {
    if (!excludeGlob.match(file) && !isGitignored(gitignoreGlobs, file)) {
      results.push(path.resolve(file));
    }
  }
  return results;
}

async function analyzeAllFiles(files: string[], fs: FileSystem): Promise<FunctionInfo[]> {
  const results: FunctionInfo[] = [];
  for (const filePath of files) {
    const content = await fs.readText(filePath);
    if (content === null) throw new CrapError(`Source file not found: ${filePath}`);
    results.push(...analyzeComplexity(content, filePath));
  }
  return results;
}

async function readAndParseCoverage(config: Config, fs: FileSystem): Promise<FileCoverage[]> {
  const covPath = path.resolve(config.coveragePath);
  if (!(await fs.exists(covPath))) throw new CrapError(`Coverage file not found: ${covPath}`);
  const content = await fs.readText(covPath);
  if (content === null) throw new CrapError(`Coverage file not found: ${covPath}`);
  return await parseCoverage(content, covPath, config.format, { fs });
}

function sortFunctions(functions: FunctionCrap[], sort: SortField): FunctionCrap[] {
  const sorted = [...functions];
  sorted.sort(comparator(sort));
  return sorted;
}

function comparator(sort: SortField): (a: FunctionCrap, b: FunctionCrap) => number {
  switch (sort) {
    case "score":
      return (a, b) => b.crapScore - a.crapScore;
    case "name":
      return (a, b) => a.name.localeCompare(b.name);
    case "complexity":
      return (a, b) => b.complexity - a.complexity;
    case "coverage":
      return (a, b) => (a.coverage ?? -1) - (b.coverage ?? -1);
  }
}

function renderOutput(summary: ProjectSummary, config: Config): string {
  switch (config.output) {
    case "table":
      return renderTable(summary);
    case "json":
      return renderJson(summary);
    case "html":
      return renderHtml(summary);
  }
}

async function writeOutput(
  output: string,
  config: Config,
  options: { quiet: boolean; flagged: boolean },
): Promise<void> {
  const dest = config.outputFile ?? defaultOutputFile(config);
  const printConsole = !(options.quiet && !options.flagged);
  if (dest) {
    await Bun.write(dest, output);
    if (printConsole) console.log(`Report written to ${dest}`);
  } else if (printConsole) {
    console.log(output);
  }
}

function defaultOutputFile(config: Config): string | undefined {
  if (config.output === "html") return "crap-report.html";
  return undefined;
}
