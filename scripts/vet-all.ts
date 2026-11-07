// Runs each workspace's own gates in its own directory and process, so per-package
// bunfig.toml coverage thresholds and test module caches stay isolated.
type Gate = { readonly dir: string; readonly scripts: readonly string[] };

const gates: readonly Gate[] = [
	{ dir: "packages/rule-validator", scripts: ["vet", "check"] },
	{ dir: "packages/stepdown-rule", scripts: ["vet", "lint", "compile:release"] },
	{ dir: "packages/crap4ts", scripts: ["vet", "fmt:check"] },
	{ dir: "packages/mutate4ts", scripts: ["vet", "fmt:check", "build"] },
	{ dir: "templates/ts-template", scripts: ["vet", "build"] },
];

const only = process.argv.slice(2);
const failures: string[] = [];
for (const gate of gates) {
	if (only.length > 0 && !only.some((name) => gate.dir.endsWith(name))) continue;
	for (const script of gate.scripts) {
		const proc = Bun.spawn(["bun", "run", script], { cwd: gate.dir, stdout: "inherit", stderr: "inherit" });
		const code = await proc.exited;
		console.log(`vet-all: ${gate.dir} ${script} -> ${code}`);
		if (code !== 0) failures.push(`${gate.dir} ${script}`);
	}
}
if (failures.length > 0) {
	console.error(`vet-all: failed: ${failures.join(", ")}`);
	process.exit(1);
}
