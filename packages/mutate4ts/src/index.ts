#!/usr/bin/env bun
import { Effect, Exit, Fiber } from "effect";
import { parseCliOptions, exitWithUsage } from "./cli.ts";
import type { ResolvedOptions } from "./cli.ts";
import { scanFile, readFile } from "./scan.ts";
import type { ScanError } from "./scan.ts";
import { runBaseline } from "./baseline.ts";
import type { BaselineFailedError, SpawnError } from "./baseline.ts";
import { executeMutations } from "./execute.ts";
import type { MutationResult } from "./execute.ts";
import type { FileError } from "./file-ops.ts";
import { formatReport } from "./report.ts";
import { computeTimeoutMs } from "./timeout.ts";
import { exitCodeFor, fatalOutcome } from "./exit-code.ts";
import type { MutationSite } from "./mutations/registry.ts";

const BACKUP_SUFFIX = ".mutate4ts-backup";

function backupPath(filePath: string): string {
  return `${filePath}${BACKUP_SUFFIX}`;
}

function recoverCrash(filePath: string): void {
  const bp = backupPath(filePath);
  try {
    if (!Bun.file(bp).size) return;
  } catch {
    return;
  }
  try {
    const original = Bun.file(bp);
    // sync restore
    const data = Bun.file(bp);
    // Use Bun.write (async) but block via spawnSync? Instead do sync fs.
  } catch {
    return;
  }
}

function main(): void {
  const opts = parseCliOptions(Bun.argv);
  validateSourceFile(opts.sourceFile);
  // Crash recovery: a previous run may have been killed mid-mutation, leaving
  // the source file holding a mutant. Restore it from the backup if present.
  try {
    const bp = backupPath(opts.sourceFile);
    if (Bun.file(bp).size > 0) {
      const original = Bun.file(bp);
      // synchronous restore via Bun.write is async; block with Atomics? Use fs.writeFileSync.
      const { writeFileSync, readFileSync, unlinkSync } = require("node:fs");
      const bytes = readFileSync(bp);
      writeFileSync(opts.sourceFile, bytes);
      try {
        unlinkSync(bp);
      } catch {}
      console.error(`mutate4ts: restored ${opts.sourceFile} from crash backup`);
    }
  } catch {
    // no backup or unreadable; proceed
  }
  const program = opts.scan ? buildScanProgram(opts) : buildTestProgram(opts);
  const fiber = Effect.runFork(program);
  let interrupted = false;
  const restoreAndExit = () => {
    try {
      const bp = backupPath(opts.sourceFile);
      const { readFileSync, writeFileSync, unlinkSync } = require("node:fs");
      if (Bun.file(bp).size > 0) {
        const bytes = readFileSync(bp);
        writeFileSync(opts.sourceFile, bytes);
        try {
          unlinkSync(bp);
        } catch {}
      }
    } catch {}
  };
  process.on("SIGINT", () => {
    if (interrupted) return;
    interrupted = true;
    restoreAndExit();
    Effect.runFork(Fiber.interrupt(fiber));
  });
  process.on("SIGTERM", () => {
    if (interrupted) return;
    interrupted = true;
    restoreAndExit();
    process.exit(143);
  });
  fiber.addObserver((exit) => {
    if (!Exit.isFailure(exit)) return;
    const { exitCode, message } = fatalOutcome(exit.cause);
    if (message !== null) console.error(message);
    process.exit(exitCode);
  });
}

function validateSourceFile(filePath: string): void {
  if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx"))
    exitWithUsage(`File must be a .ts or .tsx file: ${filePath}`);
}

function buildScanProgram(opts: ResolvedOptions): Effect.Effect<void, ScanError> {
  return scanFile(opts.sourceFile, opts.lines).pipe(Effect.map(printScanResults));
}

function buildTestProgram(
  opts: ResolvedOptions,
): Effect.Effect<void, FileError | ScanError | BaselineFailedError | SpawnError> {
  return Effect.gen(function* () {
    const sites = yield* scanFile(opts.sourceFile, opts.lines);
    if (sites.length === 0) {
      yield* Effect.sync(() => console.log("No mutation sites found."));
      return;
    }
    yield* runMutationTesting(opts, sites);
  });
}

function runMutationTesting(
  opts: ResolvedOptions,
  sites: readonly MutationSite[],
): Effect.Effect<void, FileError | ScanError | BaselineFailedError | SpawnError> {
  return Effect.gen(function* () {
    const original = yield* readFile(opts.sourceFile);
    // Persist a backup so a killed process can be recovered on the next run.
    yield* Effect.sync(() => {
      const { writeFileSync } = require("node:fs");
      writeFileSync(backupPath(opts.sourceFile), original);
    });
    const baseline = yield* runBaseline(opts.testCommand);
    yield* runMutations(opts, sites, original, opts.testCommand, baseline.durationMs).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          try {
            const { unlinkSync } = require("node:fs");
            unlinkSync(backupPath(opts.sourceFile));
          } catch {}
        }),
      ),
    );
  });
}

function runMutations(
  opts: ResolvedOptions,
  sites: readonly MutationSite[],
  original: string,
  command: readonly string[],
  baselineDurationMs: number,
): Effect.Effect<void, FileError> {
  const timeoutMs = computeTimeoutMs(baselineDurationMs, opts.timeoutFactor);
  return executeMutations({
    sites,
    filePath: opts.sourceFile,
    originalSource: original,
    testCommand: command,
    timeoutMs,
    onProgress: opts.verbose ? verboseProgress : defaultProgress,
  }).pipe(
    Effect.map((results) => {
      console.log(`\n${formatReport(results)}`);
      exitWithScore(results);
    }),
  );
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

function exitWithScore(results: readonly MutationResult[]): void {
  process.exit(exitCodeFor(results));
}

main();
