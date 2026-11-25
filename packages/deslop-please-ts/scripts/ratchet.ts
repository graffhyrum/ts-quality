import { type } from "arktype";
import { capture } from "./capture.ts";
import type { VetReport } from "./vet.ts";

const BASELINE_PATH = "vet-ratchet.json";

const BaselineSchema = type({
  version: "'1'",
  failures: "Record<string, number.integer >= 0>",
});

const VetReportSchema = type({
  results: type({
    label: "string>0",
    exitCode: "number.integer",
  }).array(),
});

export type Baseline = typeof BaselineSchema.infer;

export type Comparison = {
  readonly next: Baseline;
  readonly improvements: readonly string[];
  readonly regressions: readonly string[];
};

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`ratchet: ${message}\n`);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const known = new Set(["--check", "--init"]);
  const unknown = args.filter((arg) => !known.has(arg));
  if (unknown.length > 0 || args.length > 1) {
    process.stderr.write("usage: bun run ratchet [--check | --init]\n");
    process.exitCode = 2;
    return;
  }

  if (args.includes("--init")) {
    await initializeBaseline();
    return;
  }

  const baseline = await loadBaseline();
  const report = await runVetReport();
  const comparison = compareReport(report, baseline);
  const before = totalFailures(baseline);
  const after = totalFailures(comparison.next);

  if (comparison.regressions.length > 0) {
    for (const regression of comparison.regressions) {
      process.stderr.write(`ratchet: regression: ${regression}\n`);
    }
    process.stderr.write(
      "ratchet: fix the regression or make the change smaller; the baseline was not changed\n",
    );
    process.exitCode = 1;
    return;
  }

  if (comparison.improvements.length > 0) {
    if (args.includes("--check")) {
      for (const improvement of comparison.improvements) {
        process.stdout.write(`ratchet: baseline can tighten: ${improvement}\n`);
      }
      process.stderr.write(
        `ratchet: baseline is stale; run bun run ratchet and commit ${BASELINE_PATH}\n`,
      );
      process.exitCode = 1;
      return;
    }

    await writeBaseline(comparison.next);
    for (const improvement of comparison.improvements) {
      process.stdout.write(`ratchet: tightened ${improvement}\n`);
    }
  }

  process.stdout.write(`ratchet: ${before} -> ${after} failing vet gate(s)\n`);
  if (before > 0 && after === 0) {
    process.stdout.write(
      "ratchet: graduated; vet is now the permanent gate. Remove the baseline and ratchet hook\n",
    );
  }
}

async function initializeBaseline(): Promise<void> {
  if (await Bun.file(BASELINE_PATH).exists()) {
    process.stderr.write(
      `ratchet: ${BASELINE_PATH} already exists; refusing to loosen it\n`,
    );
    process.exitCode = 1;
    return;
  }

  const report = await runVetReport();
  const baseline: Baseline = {
    version: "1",
    failures: countFailures(report.results),
  };
  await writeBaseline(baseline);
  process.stdout.write(
    `ratchet: initialized with ${totalFailures(baseline)} failing vet gate(s)\n`,
  );
}

async function loadBaseline(): Promise<Baseline> {
  const file = Bun.file(BASELINE_PATH);
  if (!(await file.exists())) {
    throw new Error(
      `ratchet: ${BASELINE_PATH} is missing; run bun run ratchet:init once`,
    );
  }
  return parseBaseline(await file.text());
}

export function parseBaseline(text: string): Baseline {
  const parsed: unknown = JSON.parse(text);
  const result = BaselineSchema(parsed);
  if (result instanceof type.errors) {
    throw new TypeError(
      `ratchet: invalid ${BASELINE_PATH}: ${result.toString()}`,
    );
  }
  return result;
}

export function compareReport(
  report: VetReport,
  baseline: Baseline,
): Comparison {
  const current = countFailures(report.results);
  const nextFailures: Record<string, number> = { ...baseline.failures };
  const improvements: string[] = [];
  const regressions: string[] = [];

  for (const label of Object.keys(current).sort()) {
    const count = current[label];
    if (count === undefined) continue;
    const allowed = baseline.failures[label] ?? 0;
    if (count > allowed) {
      regressions.push(`${label}: ${allowed} -> ${count}`);
      continue;
    }
    nextFailures[label] = count;
    if (count < allowed) improvements.push(`${label}: ${allowed} -> ${count}`);
  }

  for (const label of Object.keys(baseline.failures).sort()) {
    if (label in current) continue;
    const allowed = baseline.failures[label];
    if (allowed === undefined) continue;
    delete nextFailures[label];
    improvements.push(`${label}: ${allowed} -> 0`);
  }

  return {
    next: { version: "1", failures: nextFailures },
    improvements,
    regressions,
  };
}

function countFailures(results: VetReport["results"]): Record<string, number> {
  const failures: Record<string, number> = {};
  for (const result of results) {
    if (result.exitCode === 0) continue;
    failures[result.label] = (failures[result.label] ?? 0) + 1;
  }
  return failures;
}

function totalFailures(baseline: Baseline): number {
  return Object.values(baseline.failures).reduce(
    (total, count) => total + count,
    0,
  );
}

async function runVetReport(): Promise<VetReport> {
  const run = await capture(["bun", "scripts/vet.ts", "--all", "--json"]);
  if (run.exitCode > 1) {
    if (run.stderr.length > 0) process.stderr.write(run.stderr);
    throw new Error(`ratchet: vet report failed (exit ${run.exitCode})`);
  }
  if (run.stdout.trim().length === 0) {
    if (run.stderr.length > 0) process.stderr.write(run.stderr);
    throw new Error("ratchet: vet produced no report");
  }
  return parseVetReport(run.stdout);
}

export function parseVetReport(text: string): VetReport {
  const parsed: unknown = JSON.parse(text);
  const result = VetReportSchema(parsed);
  if (result instanceof type.errors) {
    throw new TypeError(`ratchet: invalid vet report: ${result.toString()}`);
  }
  return result;
}

async function writeBaseline(baseline: Baseline): Promise<void> {
  const failures = Object.fromEntries(
    Object.entries(baseline.failures).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
  await Bun.write(
    BASELINE_PATH,
    `${JSON.stringify({ version: baseline.version, failures }, null, 2)}\n`,
  );
}
