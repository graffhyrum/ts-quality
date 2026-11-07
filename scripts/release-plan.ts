// Dry-run release plan: packs every tool package, checks the tarball, and writes a manifest.
// Usage: bun scripts/release-plan.ts <outDir> [--repo owner/name]
// Writes <outDir>/manifest.json and <outDir>/*.tgz. Never tags, uploads, or publishes.
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { packedProblems, type PackedManifest } from "./lib/packed.ts";
import { mustRun } from "./lib/run.ts";
import {
  releaseAssetUrl,
  releaseTag,
  tarballName,
  TOOL_PACKAGES,
} from "./lib/workspace.ts";

export type PlanEntry = {
  readonly dir: string;
  readonly name: string;
  readonly version: string;
  readonly tag: string;
  readonly tarball: string;
  readonly sha256: string;
  readonly url: string;
  readonly extraAssets: readonly string[];
};

const args = process.argv.slice(2);
const outDir = args.find((arg) => !arg.startsWith("--"));
const repoIndex = args.indexOf("--repo");
const repo = repoIndex >= 0 ? args[repoIndex + 1] : "OWNER/ts-quality";
if (!outDir || !repo) {
  console.error(
    "usage: bun scripts/release-plan.ts <outDir> [--repo owner/name]",
  );
  process.exit(2);
}
await main(path.resolve(outDir), repo);

async function main(out: string, repoName: string): Promise<void> {
  if (existsSync(out) && readdirSync(out).length > 0)
    throw new Error(`refusing to reuse non-empty ${out}`);
  mkdirSync(out, { recursive: true });
  const entries: PlanEntry[] = [];
  for (const tool of TOOL_PACKAGES)
    entries.push(await planPackage(tool.dir, tool.extraAssets, out, repoName));
  await Bun.write(
    path.join(out, "manifest.json"),
    `${JSON.stringify({ repo: repoName, entries }, null, 2)}\n`,
  );
  for (const entry of entries)
    console.log(
      `release-plan: ${entry.tag} ${entry.tarball} ${entry.sha256.slice(0, 12)}`,
    );
}

async function planPackage(
  dir: string,
  extraAssets: readonly string[],
  out: string,
  repoName: string,
): Promise<PlanEntry> {
  const pkg: PackedManifest = await Bun.file(
    path.join(dir, "package.json"),
  ).json();
  const tarball = tarballName(pkg.name, pkg.version);
  await mustRun(["bun", "pm", "pack", "--destination", out, "--quiet"], {
    cwd: dir,
  });
  const tarPath = path.join(out, tarball);
  if (!existsSync(tarPath)) throw new Error(`expected ${tarball} from ${dir}`);
  await assertTarball(tarPath, pkg.name, pkg.version);
  const tag = releaseTag(dir, pkg.version);
  return {
    dir,
    name: pkg.name,
    version: pkg.version,
    tag,
    tarball,
    sha256: new Bun.CryptoHasher("sha256")
      .update(await Bun.file(tarPath).arrayBuffer())
      .digest("hex"),
    url: releaseAssetUrl(repoName, tag, tarball),
    extraAssets: extraAssets.flatMap((asset) =>
      expandAsset(path.join(dir, asset)),
    ),
  };
}

async function assertTarball(
  tarPath: string,
  name: string,
  version: string,
): Promise<void> {
  const files = (await mustRun(["tar", "-tzf", tarPath], { capture: true }))
    .split("\n")
    .filter(Boolean);
  const manifest: PackedManifest = JSON.parse(
    await mustRun(["tar", "-xOzf", tarPath, "package/package.json"], {
      capture: true,
    }),
  );
  const problems = [
    ...(manifest.name === name && manifest.version === version
      ? []
      : ["packed name/version mismatch"]),
    ...packedProblems(files, manifest),
  ];
  if (problems.length > 0)
    throw new Error(`${path.basename(tarPath)}: ${problems.join("; ")}`);
}

function expandAsset(assetPath: string): string[] {
  if (!existsSync(assetPath))
    throw new Error(
      `missing release asset ${assetPath}; run the package gates first`,
    );
  if (!statSync(assetPath).isDirectory()) return [assetPath];
  return readdirSync(assetPath).map((file) => path.join(assetPath, file));
}
