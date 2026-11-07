// Packs tool packages, checks every tarball, and writes <outDir>/manifest.json.
//   bun scripts/release-plan.ts <outDir>                      dry run: all packages, kind "dry-run"
//   bun scripts/release-plan.ts <outDir> --release --repo o/r  fail-closed readiness, kind "release"
// Never tags, uploads, or publishes. Only a "release" manifest is accepted by draft-releases.
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { assetNameProblems, parsePlanArgs, type PlanArgs } from "./lib/args.ts";
import { changelogSection } from "./lib/changelog.ts";
import { packedProblems, type PackedManifest } from "./lib/packed.ts";
import {
  packageVerdict,
  repoProblems,
  type PackageFacts,
} from "./lib/readiness.ts";
import { mustRun, run } from "./lib/run.ts";
import {
  releaseAssetUrl,
  releaseTag,
  tarballName,
  TOOL_PACKAGES,
  type ToolPackage,
} from "./lib/workspace.ts";

export type Asset = {
  readonly path: string;
  readonly name: string;
  readonly sha256: string;
};
export type PlanEntry = {
  readonly dir: string;
  readonly name: string;
  readonly version: string;
  readonly tag: string;
  readonly url: string;
  readonly assets: readonly Asset[];
  readonly notes: string;
};
export type PlanManifest = {
  readonly kind: PlanArgs["mode"];
  readonly repo: string;
  readonly head: string;
  readonly entries: readonly PlanEntry[];
};

await main(parsePlanArgs(process.argv.slice(2)));

async function main(args: PlanArgs): Promise<void> {
  const out = path.resolve(args.outDir);
  if (existsSync(out) && readdirSync(out).length > 0)
    throw new Error(`refusing to reuse non-empty ${out}`);
  const head = (
    await mustRun(["git", "rev-parse", "HEAD"], { capture: true })
  ).trim();
  const tools =
    args.mode === "release" ? await releasableTools(head) : TOOL_PACKAGES;
  mkdirSync(out, { recursive: true });
  const entries: PlanEntry[] = [];
  for (const tool of tools)
    entries.push(await planPackage(tool, out, args.repo));
  const problems = assetNameProblems(
    entries.flatMap((e) => e.assets.map((a) => a.path)),
  );
  if (problems.length > 0) throw new Error(problems.join("; "));
  const manifest: PlanManifest = {
    kind: args.mode,
    repo: args.repo,
    head,
    entries,
  };
  await Bun.write(
    path.join(out, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  for (const e of entries)
    console.log(
      `release-plan (${args.mode}): ${e.tag} ${e.assets.length} assets`,
    );
}

async function releasableTools(head: string): Promise<ToolPackage[]> {
  const tags = (await mustRun(["git", "tag", "--list"], { capture: true }))
    .split("\n")
    .filter(Boolean);
  const status = await mustRun(["git", "status", "--porcelain"], {
    capture: true,
  });
  const ref =
    process.env.GITHUB_REF ??
    (
      await mustRun(["git", "symbolic-ref", "-q", "HEAD"], { capture: true })
    ).trim();
  const pending = readdirSync(".changeset").filter(
    (f) => f.endsWith(".md") && f !== "README.md",
  );
  const problems = repoProblems({
    pendingChangesets: pending,
    head,
    ref,
    clean: status.trim() === "",
  });
  const selected: ToolPackage[] = [];
  for (const tool of TOOL_PACKAGES) {
    const verdict = packageVerdict(await packageFacts(tool, tags), head);
    if (verdict.kind === "problem") problems.push(verdict.message);
    else if (verdict.kind === "release") selected.push(tool);
    else console.log(`release-plan: ${tool.dir} ${verdict.kind}`);
  }
  if (problems.length > 0)
    throw new Error(`not release-ready:\n- ${problems.join("\n- ")}`);
  return selected;
}

async function packageFacts(
  tool: ToolPackage,
  tags: readonly string[],
): Promise<PackageFacts> {
  const pkg: PackedManifest = await Bun.file(
    path.join(tool.dir, "package.json"),
  ).json();
  const tag = releaseTag(tool.dir, pkg.version);
  const target = tags.includes(tag)
    ? (await mustRun(["git", "rev-list", "-n1", tag], { capture: true })).trim()
    : null;
  const diff = target
    ? await run(["git", "diff", "--quiet", target, "HEAD", "--", tool.dir])
    : { exitCode: 1 };
  // Imported tags point at pre-migration commits with a different layout, so a package with
  // only imported tags always counts as changed.
  return {
    dir: tool.dir,
    name: pkg.name,
    version: pkg.version,
    tags,
    currentTagTarget: target,
    changedSinceLastRelease: diff.exitCode !== 0,
  };
}

async function planPackage(
  tool: ToolPackage,
  out: string,
  repo: string,
): Promise<PlanEntry> {
  const pkg: PackedManifest = await Bun.file(
    path.join(tool.dir, "package.json"),
  ).json();
  const tarball = tarballName(pkg.name, pkg.version);
  await mustRun(["bun", "pm", "pack", "--destination", out, "--quiet"], {
    cwd: tool.dir,
  });
  const tarPath = path.join(out, tarball);
  if (!existsSync(tarPath))
    throw new Error(`expected ${tarball} from ${tool.dir}`);
  await assertTarball(tarPath, pkg.name, pkg.version);
  const tag = releaseTag(tool.dir, pkg.version);
  const paths = [
    tarPath,
    ...tool.extraAssets.flatMap((a) => expandAsset(path.join(tool.dir, a))),
  ];
  const assets = await Promise.all(
    paths.map(async (p) => ({
      path: p,
      name: path.basename(p),
      sha256: await sha256(p),
    })),
  );
  const url = releaseAssetUrl(repo, tag, tarball);
  return {
    dir: tool.dir,
    name: pkg.name,
    version: pkg.version,
    tag,
    url,
    assets,
    notes: await notes(tool.dir, pkg, url, assets),
  };
}

async function notes(
  dir: string,
  pkg: PackedManifest,
  url: string,
  assets: readonly Asset[],
): Promise<string> {
  const changelogPath = path.join(dir, "CHANGELOG.md");
  const section = existsSync(changelogPath)
    ? changelogSection(await Bun.file(changelogPath).text(), pkg.version)
    : null;
  return [
    `# ${pkg.name} ${pkg.version}`,
    section ?? "_No CHANGELOG entry for this version._",
    "## Install",
    `\`bun add -d ${url}\``,
    "## Assets (sha256)",
    ...assets.map((a) => `- \`${a.name}\` \`${a.sha256}\``),
  ].join("\n\n");
}

async function sha256(file: string): Promise<string> {
  return new Bun.CryptoHasher("sha256")
    .update(await Bun.file(file).arrayBuffer())
    .digest("hex");
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
  return readdirSync(assetPath)
    .sort()
    .map((file) => path.join(assetPath, file));
}
