import { spawn } from "bun";

type Step = { label: string; argv: string[] };

const steps: Step[] = [
  { label: "lint", argv: ["bun", "run", "lint"] },
  { label: "fmt", argv: ["bun", "run", "fmt"] },
  { label: "check", argv: ["bun", "run", "check"] },
  { label: "rule-validator", argv: ["bun", "run", "rule-validator"] },
  { label: "stepdown-rule", argv: ["bun", "run", "stepdown-rule"] },
  { label: "fmt", argv: ["bun", "run", "fmt"] },
  { label: "gate", argv: ["bun", "run", "gate"] },
];

for (const step of steps) {
  const proc = spawn({
    cmd: step.argv,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    process.stderr.write(`vet: step "${step.label}" failed (exit ${exitCode})\n`);
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    process.exit(exitCode === 0 ? 1 : exitCode);
  }
}

process.exit(0);
