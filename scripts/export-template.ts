// Exports templates/ts-template as a standalone project.
// Usage: bun scripts/export-template.ts <outDir> <specs.json>
// specs.json maps each workspace package name to the specifier a standalone
// project should install (release tarball URL, registry version, or git tag).
import { mkdirSync } from "node:fs";
import path from "node:path";

const TEMPLATE_DIR = "templates/ts-template";

const [outDir, specsPath] = process.argv.slice(2);
if (!outDir || !specsPath) {
	console.error("usage: bun scripts/export-template.ts <outDir> <specs.json>");
	process.exit(2);
}
const specs: Record<string, string> = await Bun.file(specsPath).json();
await exportTemplate(outDir, specs);

async function exportTemplate(dest: string, specMap: Record<string, string>): Promise<void> {
	const files = await trackedFiles();
	for (const file of files) await copyFile(file, dest);
	await rewriteManifest(path.join(dest, "package.json"), specMap);
	console.log(`exported ${files.length} files to ${dest}`);
}

async function trackedFiles(): Promise<string[]> {
	const proc = Bun.spawn(["git", "ls-files", "-z", "--", "."], { cwd: TEMPLATE_DIR, stdout: "pipe" });
	const out = await new Response(proc.stdout).text();
	if ((await proc.exited) !== 0) throw new Error("git ls-files failed");
	return out.split("\0").filter((f) => f.length > 0 && f !== "bun.lock");
}

async function copyFile(file: string, dest: string): Promise<void> {
	const target = path.join(dest, file);
	mkdirSync(path.dirname(target), { recursive: true });
	await Bun.write(target, Bun.file(path.join(TEMPLATE_DIR, file)));
}

async function rewriteManifest(manifestPath: string, specMap: Record<string, string>): Promise<void> {
	const pkg = await Bun.file(manifestPath).json();
	for (const field of ["dependencies", "devDependencies"]) {
		const deps: Record<string, string> | undefined = pkg[field];
		if (!deps) continue;
		for (const [name, spec] of Object.entries(deps)) {
			if (!spec.startsWith("workspace:")) continue;
			const replacement = specMap[name];
			if (!replacement) throw new Error(`no export specifier for workspace dependency ${name}`);
			deps[name] = replacement;
		}
	}
	await Bun.write(manifestPath, `${JSON.stringify(pkg, null, 2)}\n`);
}
