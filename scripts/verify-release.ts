// Post-publication proof (run only after a maintainer publishes the drafts):
// downloads every asset from its public release URL, re-hashes it against the manifest, then
// installs each tool tarball by URL into an empty project and runs its bin with --help.
// Usage: bun scripts/verify-release.ts <planDir> <emptyWorkDir>
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { mustRun } from "./lib/run.ts";
import type { PlanManifest } from "./release-plan.ts";

const [planDir, workArg] = process.argv.slice(2);
if (!planDir || !workArg)
  throw new Error(
    "usage: bun scripts/verify-release.ts <planDir> <emptyWorkDir>",
  );
const manifest: PlanManifest = await Bun.file(
  path.join(planDir, "manifest.json"),
).json();
if (manifest.kind !== "release")
  throw new Error("verify-release needs a release manifest");
const work = path.resolve(workArg);
if (existsSync(work) && readdirSync(work).length > 0)
  throw new Error(`refusing non-empty ${work}`);
mkdirSync(work, { recursive: true });

for (const entry of manifest.entries) {
  for (const asset of entry.assets) {
    const url = `https://github.com/${manifest.repo}/releases/download/${entry.tag}/${asset.name}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    const hash = new Bun.CryptoHasher("sha256")
      .update(await res.arrayBuffer())
      .digest("hex");
    if (hash !== asset.sha256)
      throw new Error(`${url} sha256 ${hash} != manifest ${asset.sha256}`);
    console.log(`verify-release: ${asset.name} sha256 ok`);
  }
  const project = path.join(work, entry.tag);
  mkdirSync(project);
  await Bun.write(
    path.join(project, "package.json"),
    `${JSON.stringify({ name: "verify", private: true })}\n`,
  );
  await mustRun(["bun", "add", "-d", entry.url], { cwd: project });
  const pkg = await Bun.file(
    path.join(project, "node_modules", entry.name, "package.json"),
  ).json();
  for (const bin of Object.keys(typeof pkg.bin === "object" ? pkg.bin : {})) {
    await mustRun([path.join(project, "node_modules", ".bin", bin), "--help"], {
      cwd: project,
    });
    console.log(`verify-release: ${entry.name} bin ${bin} runs`);
  }
}
