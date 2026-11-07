// Exports templates/ts-template as a standalone project (no workspace links, no hooks).
// Usage: bun scripts/export-template.ts <emptyOutDir> <specs.json>
// specs.json maps each workspace dependency name to the specifier a standalone project
// installs (for releases: the manifest's asset URLs). The export carries no bun.lock;
// the consumer's first `bun install` generates one against those specifiers, and CI in the
// generated repo then runs `bun install --frozen-lockfile` against that committed lockfile.
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  hookSetupProblems,
  isExportable,
  rewriteWorkspaceSpecs,
} from "./lib/export.ts";
import { mustRun } from "./lib/run.ts";
import { TEMPLATE } from "./lib/workspace.ts";

const [outDir, specsPath] = process.argv.slice(2);
if (!outDir || !specsPath) {
  console.error(
    "usage: bun scripts/export-template.ts <emptyOutDir> <specs.json>",
  );
  process.exit(2);
}
await exportTemplate(path.resolve(outDir), await Bun.file(specsPath).json());

async function exportTemplate(
  dest: string,
  specs: Record<string, string>,
): Promise<void> {
  if (existsSync(dest) && readdirSync(dest).length > 0)
    throw new Error(`refusing to export into non-empty ${dest}`);
  const files = (await trackedFiles()).filter(isExportable);
  const pkg = rewriteWorkspaceSpecs(
    await Bun.file(path.join(TEMPLATE.dir, "package.json")).json(),
    specs,
  );
  const hookProblems = hookSetupProblems(pkg);
  if (hookProblems.length > 0)
    throw new Error(
      `template would install git hooks: ${hookProblems.join("; ")}`,
    );
  mkdirSync(dest, { recursive: true });
  for (const file of files)
    await Bun.write(
      path.join(dest, file),
      Bun.file(path.join(TEMPLATE.dir, file)),
    );
  await Bun.write(
    path.join(dest, "package.json"),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );
  console.log(`export-template: ${files.length} files to ${dest}`);
}

async function trackedFiles(): Promise<string[]> {
  const out = await mustRun(["git", "ls-files", "-z", "--", "."], {
    cwd: TEMPLATE.dir,
    capture: true,
  });
  return out.split("\0").filter((file) => file.length > 0);
}
