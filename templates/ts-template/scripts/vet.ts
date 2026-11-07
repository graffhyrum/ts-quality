import { capture, type Capture } from "./capture.ts";

type Step = {
  readonly label: string;
  readonly argv: readonly string[];
};

const steps: readonly Step[] = [
  { label: "fmt", argv: ["bun", "run", "fmt:check"] },
  { label: "audit", argv: ["bun", "audit"] },
  { label: "typecheck", argv: ["bun", "run", "typecheck"] },
  { label: "lint", argv: ["bun", "run", "lint"] },
  { label: "rule-validator", argv: ["bun", "run", "rule-validator"] },
  { label: "stepdown", argv: ["bun", "run", "stepdown"] },
  { label: "crap4ts", argv: ["bun", "run", "crap4ts"] },
  { label: "mutate4ts", argv: ["bun", "run", "mutate4ts"] },
  { label: "test", argv: ["bun", "run", "test:coverage"] },
];

await runGate(steps);

async function runGate(gateSteps: readonly Step[]): Promise<void> {
  for (const step of gateSteps) {
    await runStep(step);
  }
  process.exit(0);
}

async function runStep(step: Step): Promise<void> {
  const result = await capture(step.argv);
  if (result.exitCode === 0) return;
  reportFailure(step.label, result);
  process.exit(result.exitCode);
}

function reportFailure(label: string, result: Capture): void {
  process.stderr.write(
    `vet: step "${label}" failed (exit ${result.exitCode})\n`,
  );
  if (result.stdout.length > 0) process.stdout.write(result.stdout);
  if (result.stderr.length > 0) process.stderr.write(result.stderr);
}
