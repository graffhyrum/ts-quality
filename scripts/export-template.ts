// Exports the COMMITTED templates/ts-template (HEAD) as a standalone project: no workspace links,
// no Git hooks. Refuses a dirty template directory and a non-empty destination.
// Usage: bun scripts/export-template.ts <emptyOutDir> <specs.json>
// specs.json maps each workspace dependency name to the specifier a standalone project installs
// (for releases: the manifest's asset URLs). The export carries no bun.lock; the first
// `bun install` in the exported project generates it against those specifiers, and that lockfile
// is committed so the project's CI `bun install --frozen-lockfile` holds.
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  dirtyPaths,
  hookSetupProblems,
  isExportable,
  rewriteWorkspaceSpecs,
} from "./lib/export.ts";
import { mustRun } from "./lib/run.ts";
import { TEMPLATE } from "./lib/workspace.ts";

const [outDir, specsPath] = process.argv.slice(2);
if (!outDir || !specsPath)
  throw new Error(
    "usage: bun scripts/export-template.ts <emptyOutDir> <specs.json>",
  );
await exportTemplate(path.resolve(outDir), await Bun.file(specsPath).json());

async function exportTemplate(
  dest: string,
  specs: Record<string, string>,
): Promise<void> {
  if (existsSync(dest) && readdirSync(dest).length > 0)
    throw new Error(`refusing to export into non-empty ${dest}`);
  const dirty = dirtyPaths(
    await git([
      "status",
      "--porcelain",
      "-z",
      "--untracked-files=all",
      "--",
      TEMPLATE.dir,
    ]),
  );
  if (dirty.length > 0)
    throw new Error(
      `refusing to export uncommitted template changes: ${dirty.join(", ")}`,
    );
  const files = (
    await git([
      "ls-tree",
      "-r",
      "-z",
      "--name-only",
      "HEAD",
      "--",
      `${TEMPLATE.dir}/`,
    ])
  )
    .split("\0")
    .filter(Boolean)
    .map((file) => path.relative(TEMPLATE.dir, file))
    .filter(isExportable);
  const pkg = rewriteWorkspaceSpecs(
    JSON.parse(await committed("package.json")),
    specs,
  );
  const hookProblems = hookSetupProblems(pkg);
  if (hookProblems.length > 0)
    throw new Error(
      `template would install git hooks: ${hookProblems.join("; ")}`,
    );
  mkdirSync(dest, { recursive: true });
  for (const file of files)
    await Bun.write(path.join(dest, file), await committedBytes(file));
  await Bun.write(
    path.join(dest, "package.json"),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );
  console.log(`export-template: ${files.length} committed files to ${dest}`);
}

async function committed(file: string): Promise<string> {
  return git(["show", `HEAD:${TEMPLATE.dir}/${file}`]);
}

async function committedBytes(file: string): Promise<Uint8Array> {
  const proc = Bun.spawn(["git", "show", `HEAD:${TEMPLATE.dir}/${file}`], {
    stdout: "pipe",
    stderr: "inherit",
  });
  const bytes = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
  if ((await proc.exited) !== 0) throw new Error(`git show failed for ${file}`);
  return bytes;
}

function git(args: readonly string[]): Promise<string> {
  return mustRun(["git", ...args], { capture: true });
}
