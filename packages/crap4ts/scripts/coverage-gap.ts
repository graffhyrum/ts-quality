import { reportCoverageGap } from "./coverage-report";

export function spawnCoverage(argv: string[]) {
  return Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
}

if (import.meta.main) process.exit(await reportCoverageGap(spawnCoverage));
