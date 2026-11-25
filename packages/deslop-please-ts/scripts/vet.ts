import { capture, type Capture } from "./capture.ts";

export type Step = {
  readonly label: string;
  readonly argv: readonly string[];
};

export type StepResult = {
  readonly label: string;
  readonly exitCode: number;
};

export type VetReport = {
  readonly results: readonly StepResult[];
};

export const steps: readonly Step[] = [
  { label: "fmt", argv: ["bun", "run", "fmt"] },
  { label: "audit", argv: ["bun", "audit"] },
  { label: "typecheck", argv: ["bun", "run", "typecheck"] },
  { label: "lint", argv: ["bun", "run", "lint"] },
  { label: "lint:boundaries", argv: ["bun", "run", "lint:boundaries"] },
  { label: "rule-validator", argv: ["bun", "run", "rule-validator"] },
  { label: "stepdown", argv: ["bun", "run", "stepdown"] },
  { label: "crap4ts", argv: ["bun", "run", "crap4ts"] },
  { label: "mutate4ts", argv: ["bun", "run", "mutate4ts"] },
  { label: "test", argv: ["bun", "run", "test:coverage"] },
];

if (import.meta.main) {
  await main();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const known = new Set(["--all", "--json"]);
  const unknown = args.filter((arg) => !known.has(arg));
  if (unknown.length > 0) {
    process.stderr.write(`vet: unknown option ${unknown.join(", ")}\n`);
    process.exitCode = 2;
    return;
  }

  const stopOnFailure = !args.includes("--all");
  const json = args.includes("--json");
  const results = await runGate(steps, stopOnFailure, json);
  if (json) console.log(JSON.stringify({ results } satisfies VetReport));
  process.exitCode = results.some((result) => result.exitCode !== 0) ? 1 : 0;
}

export async function runGate(
  gateSteps: readonly Step[],
  stopOnFailure = true,
  quiet = false,
): Promise<readonly StepResult[]> {
  const results: StepResult[] = [];
  for (const step of gateSteps) {
    const result = await runStep(step, quiet);
    results.push({ label: step.label, exitCode: result.exitCode });
    if (result.exitCode === 0) continue;
    if (stopOnFailure) break;
  }
  return results;
}

async function runStep(step: Step, quiet: boolean): Promise<Capture> {
  const result = await capture(step.argv);
  if (result.exitCode === 0 || quiet) return result;
  reportFailure(step.label, result);
  return result;
}

function reportFailure(label: string, result: Capture): void {
  process.stderr.write(
    `vet: step "${label}" failed (exit ${result.exitCode})\n`,
  );
  if (result.stdout.length > 0) process.stdout.write(result.stdout);
  if (result.stderr.length > 0) process.stderr.write(result.stderr);
}
