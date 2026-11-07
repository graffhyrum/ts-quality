// Creates DRAFT GitHub releases from a "release" manifest. Drafts are not public and create no
// tag until a maintainer publishes them. Usage (CI): bun scripts/draft-releases.ts <planDir>
import path from "node:path";
import { assetNameProblems } from "./lib/args.ts";
import { mustRun, run } from "./lib/run.ts";
import type { PlanEntry, PlanManifest } from "./release-plan.ts";

const planDir = process.argv[2];
if (!planDir) throw new Error("usage: bun scripts/draft-releases.ts <planDir>");
const manifest: PlanManifest = await Bun.file(
  path.join(planDir, "manifest.json"),
).json();
if (manifest.kind !== "release")
  throw new Error(
    `refusing a ${manifest.kind} manifest; run release-plan --release`,
  );
const head = (
  await mustRun(["git", "rev-parse", "HEAD"], { capture: true })
).trim();
if (manifest.head !== head)
  throw new Error(`manifest built at ${manifest.head}, checkout is ${head}`);
const problems = assetNameProblems(
  manifest.entries.flatMap((e) => e.assets.map((a) => a.path)),
);
if (problems.length > 0) throw new Error(problems.join("; "));
for (const entry of manifest.entries)
  await draft(manifest.repo, entry, head, planDir);

async function draft(
  repo: string,
  entry: PlanEntry,
  target: string,
  dir: string,
): Promise<void> {
  const existing = await run(
    ["gh", "release", "view", entry.tag, "--repo", repo],
    { capture: true },
  );
  if (existing.exitCode === 0)
    throw new Error(
      `${entry.tag} already has a release; readiness should have excluded it`,
    );
  const notesPath = path.join(dir, `${entry.tag}.notes.md`);
  await Bun.write(notesPath, `${entry.notes}\n`);
  await mustRun([
    "gh",
    "release",
    "create",
    entry.tag,
    ...entry.assets.map((a) => a.path),
    "--repo",
    repo,
    "--draft",
    "--target",
    target,
    "--title",
    `${entry.name} ${entry.version}`,
    "--notes-file",
    notesPath,
  ]);
  console.log(`draft-releases: drafted ${entry.tag}`);
}
