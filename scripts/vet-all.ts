// Runs each workspace's own gates in its own directory and process, so per-package
// bunfig.toml thresholds and test module caches stay isolated.
// Usage: bun scripts/vet-all.ts [--plain-tests] [dir-suffix...]
//   --plain-tests runs plain sequential `bun test` per package (catches cross-file mock leaks
//   that the parallel coverage runs hide).
import { GATED_DIRS } from "./lib/workspace.ts";
import { run } from "./lib/run.ts";

const args = process.argv.slice(2);
const plainTests = args.includes("--plain-tests");
const only = args.filter((arg) => !arg.startsWith("--"));

const failures: string[] = [];
for (const target of GATED_DIRS) {
  if (only.length > 0 && !only.some((name) => target.dir.endsWith(name)))
    continue;
  const commands = plainTests
    ? [["bun", "test"]]
    : target.gates.map((gate) => ["bun", "run", gate]);
  for (const argv of commands) {
    const { exitCode } = await run(argv, { cwd: target.dir });
    console.log(`vet-all: ${target.dir} ${argv.join(" ")} -> ${exitCode}`);
    if (exitCode !== 0) failures.push(`${target.dir} ${argv.join(" ")}`);
  }
}
if (failures.length > 0) {
  console.error(`vet-all: failed: ${failures.join(", ")}`);
  process.exit(1);
}
