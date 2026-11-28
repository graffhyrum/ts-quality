#!/usr/bin/env bun
import { Effect, Exit, Fiber } from "effect";
import {
  parseCliOptions,
  exitWithJsonError,
  exitWithUsage,
  validateCliContract,
  type ParsedCli,
} from "./cli.ts";
import { UsageError } from "./file-contract/path-key.ts";
import {
  assertBaselineAbsent,
  assertBaselinePresent,
  applyRenamesInMemory,
  buildSeedBaseline,
  readBaselineFile,
  writeBaselineIfChanged,
} from "./file-contract/baseline.ts";
import type { BaselineDocument } from "./file-contract/types.ts";
import { buildUpdatedBaseline } from "./file-contract/baseline-update.ts";
import { readRenamePairs } from "./file-contract/read-inputs.ts";
import {
  baselineWouldFail,
  buildQualityReport,
  formatQualityReportJson,
  newViolationsWouldIncreaseBaseline,
} from "./file-contract/quality-report.ts";
import { resolveFileSelection } from "./resolve-targeting.ts";
import { scanFile, readFile } from "./scan.ts";
import type { ScanError } from "./scan.ts";
import { runBaseline } from "./baseline.ts";
import type { BaselineFailedError, SpawnError } from "./baseline.ts";
import { executeMutations } from "./execute.ts";
import type { MutationResult } from "./execute.ts";
import type { FileError } from "./file-ops.ts";
import { formatReport } from "./report.ts";
import { computeTimeoutMs } from "./timeout.ts";
import { fatalOutcome } from "./exit-code.ts";
import type { MutationSite } from "./mutations/registry.ts";
import {
  createAggregatedRun,
  mutationToolExitCode,
  recordFileResults,
  type AggregatedRun,
} from "./mutation-count.ts";
import type { QualityReport } from "./file-contract/types.ts";

export async function runFromArgv(argv: readonly string[]): Promise<void> {
  const opts = parseCliOptions(argv);
  await runParsed(opts);
}

export async function main(): Promise<void> {
  const opts = parseCliOptions(Bun.argv);
  await runParsed(opts);
}

async function runParsed(opts: ParsedCli): Promise<void> {
  try {
    validateCliContract(opts);
    await runMain(opts);
  } catch (err) {
    const message =
      err instanceof UsageError ? err.message : err instanceof Error ? err.message : String(err);
    if (opts.report === "json") exitWithJsonError(message);
    exitWithUsage(message);
  }
}

export async function runMain(opts: ParsedCli): Promise<void> {
  const selection = await resolveFileSelection(opts);
  const renamePairs =
    opts.renamesFrom !== undefined ? await readRenamePairs(opts.renamesFrom, "--renames-from") : [];
  let baseline = await readBaselineFile(opts.baselinePath);
  if (baseline && renamePairs.length > 0) {
    baseline = await applyRenamesInMemory(baseline, renamePairs);
  }
  if (opts.seed) await assertBaselineAbsent(opts.baselinePath);
  if (opts.updateBaseline) assertBaselinePresent(baseline);

  if (opts.scan) {
    await runScanMode(opts, selection.targetKeys);
    return;
  }

  const program = buildMultiFileProgram(opts, selection.targetKeys);
  const fiber = Effect.runFork(program);
  let interrupted = false;
  process.on("SIGINT", () => {
    if (interrupted) return;
    interrupted = true;
    Effect.runFork(Fiber.interrupt(fiber));
  });

  const exit = await new Promise<Exit.Exit<void, unknown>>((resolve) => {
    fiber.addObserver((value) => resolve(value));
  });

  if (Exit.isFailure(exit)) {
    const { exitCode, message } = fatalOutcome(exit.cause);
    if (message !== null) console.error(message);
    process.exit(exitCode);
    return;
  }

  await finishAfterMutations(opts, baseline, selection.mode === "full");
}

// Mutation run stores aggregate on a module-level slot set by the Effect program.
let lastAggregatedRun: AggregatedRun | null = null;
let lastTargetKeys: string[] = [];

export function buildMultiFileProgram(
  opts: ParsedCli,
  targetKeys: string[],
): Effect.Effect<void, FileError | ScanError | BaselineFailedError | SpawnError> {
  lastTargetKeys = targetKeys;
  return Effect.gen(function* () {
    const agg = createAggregatedRun();
    if (targetKeys.length === 0) {
      lastAggregatedRun = agg;
      return;
    }
    const baselineDurationMs = yield* runBaseline(opts.testCommand).pipe(
      Effect.map((r) => r.durationMs),
    );
    for (const key of targetKeys) {
      yield* mutateOneFile(opts, key, baselineDurationMs, agg);
    }
    lastAggregatedRun = agg;
  });
}

function mutateOneFile(
  opts: ParsedCli,
  filePath: string,
  baselineDurationMs: number,
  agg: AggregatedRun,
): Effect.Effect<void, FileError | ScanError> {
  return Effect.gen(function* () {
    const sites = yield* scanFile(filePath, opts.lines);
    if (sites.length === 0) {
      agg.violationsByFile.set(filePath, 0);
      return;
    }
    const original = yield* readFile(filePath);
    const timeoutMs = computeTimeoutMs(baselineDurationMs, opts.timeoutFactor);
    const onProgress =
      opts.report === "json" ? () => {} : opts.verbose ? verboseProgress : defaultProgress;
    const results = yield* executeMutations({
      sites,
      filePath,
      originalSource: original,
      testCommand: opts.testCommand,
      timeoutMs,
      onProgress,
    });
    recordFileResults(agg, filePath, results);
    const singleTarget = lastTargetKeys.length === 1;
    if (opts.report === "human" && (opts.verbose || singleTarget)) {
      yield* Effect.sync(() => {
        console.log(`\n${formatReport(results)}`);
      });
    }
  });
}

async function finishAfterMutations(
  opts: ParsedCli,
  baseline: BaselineDocument | null,
  isFullScan: boolean,
): Promise<void> {
  const agg = lastAggregatedRun ?? createAggregatedRun();
  const { exitCode } = await finalizeRun(opts, baseline, isFullScan, agg, lastTargetKeys);
  process.exit(exitCode);
}

export async function finalizeRun(
  opts: ParsedCli,
  baseline: BaselineDocument | null,
  isFullScan: boolean,
  agg: AggregatedRun,
  targetKeys: readonly string[],
): Promise<{ exitCode: number }> {
  const selectedKeys = new Set(targetKeys);
  const reported = filterReportedViolations(agg.violationsByFile, selectedKeys);
  const toolCode = mutationToolExitCode(agg.allResults);
  const report = buildQualityReport(reported, baseline, toolCode);

  if (opts.seed) {
    const seedDoc = buildSeedBaseline(reported);
    await writeBaselineIfChanged(opts.baselinePath, seedDoc);
    emitOutput(opts, report, agg);
    return { exitCode: 0 };
  }

  const failsBaseline = baselineWouldFail(reported, baseline, selectedKeys);
  if (opts.updateBaseline) {
    if (failsBaseline || newViolationsWouldIncreaseBaseline(reported, baseline, selectedKeys)) {
      emitOutput(opts, { ...report, exitCode: 1, ok: false }, agg);
      return { exitCode: 1 };
    }
    if (baseline) {
      const updated = await buildUpdatedBaseline(baseline, reported, selectedKeys, isFullScan);
      await writeBaselineIfChanged(opts.baselinePath, updated);
    }
  }

  emitOutput(opts, report, agg);
  return { exitCode: report.exitCode };
}

export async function runScanMode(opts: ParsedCli, targetKeys: string[]): Promise<void> {
  if (targetKeys.length === 0) {
    console.log("No mutation sites found.");
    return;
  }
  let totalSites = 0;
  for (const key of targetKeys) {
    const exit = await Effect.runPromiseExit(scanFile(key, opts.lines));
    if (Exit.isFailure(exit)) {
      const { exitCode, message } = fatalOutcome(exit.cause);
      if (message !== null) console.error(message);
      process.exit(exitCode);
    }
    const sites = exit.value;
    totalSites += sites.length;
    if (targetKeys.length === 1) {
      printScanResults(sites);
    } else if (sites.length > 0) {
      console.log(`\n${key}:`);
      for (const site of sites) printSite(site);
    }
  }
  if (targetKeys.length > 1) {
    console.log(`\nFound ${totalSites} mutation sites across ${targetKeys.length} files.`);
  }
}

export function filterReportedViolations(
  violations: Map<string, number>,
  selectedKeys: Set<string>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const key of selectedKeys) {
    out.set(key, violations.get(key) ?? 0);
  }
  return out;
}

export function emitOutput(opts: ParsedCli, report: QualityReport, agg: AggregatedRun): void {
  if (opts.report === "json") {
    process.stdout.write(formatQualityReportJson(report));
    return;
  }
  if (agg.perFileResults.size > 1) {
    for (const [path, results] of agg.perFileResults) {
      if (results.length > 0) {
        console.log(`\n=== ${path} ===\n${formatReport(results)}`);
      }
    }
  }
}

function printScanResults(sites: readonly MutationSite[]): void {
  console.log(`Found ${sites.length} mutation sites:\n`);
  for (const site of sites) printSite(site);
}

function printSite(site: MutationSite): void {
  console.log(`  ${site.filePath}:${site.line}:${site.column} ${site.description}`);
}

function verboseProgress(current: number, total: number, result: MutationResult): void {
  defaultProgress(current, total, result);
  console.log(`  - ${result.site.originalText}`);
  console.log(`  + ${result.site.mutatedText}`);
  if (result.testOutput) console.log(indent(result.testOutput));
  console.log();
}

function defaultProgress(current: number, total: number, result: MutationResult): void {
  const status = result.outcome.status.toUpperCase();
  const loc = `${result.site.filePath}:${result.site.line}`;
  console.log(`[${current}/${total}] ${status} ${loc} ${result.site.description}`);
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}
