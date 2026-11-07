// Creates DRAFT GitHub releases for manifest entries whose tag does not exist yet.
// Drafts are invisible to the public and create no tag until a maintainer publishes them,
// which is the human review step. Usage (CI only): bun scripts/draft-releases.ts <planDir> <sha>
import path from "node:path";
import { mustRun, run } from "./lib/run.ts";
import type { PlanEntry } from "./release-plan.ts";

const [planDir, sha] = process.argv.slice(2);
if (!planDir || !sha) {
  console.error("usage: bun scripts/draft-releases.ts <planDir> <sha>");
  process.exit(2);
}
const { repo, entries }: { repo: string; entries: PlanEntry[] } =
  await Bun.file(path.join(planDir, "manifest.json")).json();
for (const entry of entries) await draft(repo, entry, planDir, sha);

async function draft(
  repo: string,
  entry: PlanEntry,
  dir: string,
  target: string,
): Promise<void> {
  const existing = await run(
    ["gh", "release", "view", entry.tag, "--repo", repo],
    {
      capture: true,
    },
  );
  if (existing.exitCode === 0) {
    console.log(`draft-releases: ${entry.tag} already exists; skipped`);
    return;
  }
  const assets = [path.join(dir, entry.tarball), ...entry.extraAssets];
  await mustRun([
    "gh",
    "release",
    "create",
    entry.tag,
    ...assets,
    "--repo",
    repo,
    "--draft",
    "--target",
    target,
    "--title",
    `${entry.name} ${entry.version}`,
    "--notes",
    `${entry.name} ${entry.version}\n\nInstall: \`bun add -d ${entry.url}\`\n\nsha256 ${entry.sha256}`,
  ]);
  console.log(`draft-releases: drafted ${entry.tag}`);
}
