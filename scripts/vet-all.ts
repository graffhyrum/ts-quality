// Runs each workspace's own `vet` script in its own directory and process, so
// per-package bunfig.toml thresholds and test module caches stay isolated, then
// runs any extra gates declared in EXTRA_GATES.
// Usage: bun scripts/vet-all.ts [--plain-tests] [dir-suffix...]
//   --plain-tests runs plain sequential `bun test` per package (catches cross-file mock leaks
//   that the parallel coverage runs hide).
import { discoverWorkspaceDirs, EXTRA_GATES } from "./lib/workspace.ts";
import { run } from "./lib/run.ts";

const args = process.argv.slice(2);
const plainTests = args.includes("--plain-tests");
const only = args.filter((arg) => !arg.startsWith("--"));

const failures: string[] = [];
const dirs = await discoverWorkspaceDirs();
for (const target of dirs) {
  if (only.length > 0 && !only.some((name) => target.endsWith(name))) continue;
  const gates = ["vet", ...(EXTRA_GATES[target] ?? [])];
  const commands = plainTests
    ? [["bun", "test"]]
    : gates.map((gate) => ["bun", "run", gate]);
  for (const argv of commands) {
    const { exitCode } = await run(argv, { cwd: target });
    console.log(`vet-all: ${target} ${argv.join(" ")} -> ${exitCode}`);
    if (exitCode !== 0) failures.push(`${target} ${argv.join(" ")}`);
  }
}
if (failures.length > 0) {
  console.error(`vet-all: failed: ${failures.join(", ")}`);
  process.exit(1);
}
