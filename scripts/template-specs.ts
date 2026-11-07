// Builds specs.json for export-template from the newest PUBLISHED release of every tool, so a
// release of a subset of tools still maps the unchanged ones. Fails closed when any tool has no
// published release, the tarball asset is missing, or its download does not match the sha256
// recorded in the release notes.
// Usage: bun scripts/template-specs.ts <out.json> --repo owner/name
import { parseArgs } from "node:util";
import path from "node:path";
import { mustRun } from "./lib/run.ts";
import {
  latestPublished,
  notedSha256,
  type ReleaseInfo,
} from "./lib/published.ts";
import {
  releaseAssetUrl,
  tarballName,
  TOOL_PACKAGES,
} from "./lib/workspace.ts";

const { values, positionals } = parseArgs({
  options: { repo: { type: "string" } },
  allowPositionals: true,
});
const [out] = positionals;
if (
  !out ||
  !values.repo ||
  !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(values.repo)
) {
  throw new Error(
    "usage: bun scripts/template-specs.ts <out.json> --repo owner/name",
  );
}
const repo = values.repo;
const releases: ReleaseInfo[] = JSON.parse(
  await mustRun(
    [
      "gh",
      "release",
      "list",
      "--repo",
      repo,
      "--limit",
      "200",
      "--json",
      "tagName,isDraft,isPrerelease",
    ],
    { capture: true },
  ),
);
const specs: Record<string, string> = {};
const problems: string[] = [];
for (const tool of TOOL_PACKAGES) {
  const base = path.basename(tool.dir);
  const name: string = (
    await Bun.file(path.join(tool.dir, "package.json")).json()
  ).name;
  const latest = latestPublished(base, releases);
  if (!latest) {
    problems.push(`${name}: no published ${base}-v<version> release`);
    continue;
  }
  const asset = tarballName(name, latest.version);
  const body: string = JSON.parse(
    await mustRun(
      ["gh", "release", "view", latest.tag, "--repo", repo, "--json", "body"],
      { capture: true },
    ),
  ).body;
  const expected = notedSha256(body, asset);
  const url = releaseAssetUrl(repo, latest.tag, asset);
  const res = await fetch(url);
  const actual = res.ok
    ? new Bun.CryptoHasher("sha256")
        .update(await res.arrayBuffer())
        .digest("hex")
    : null;
  if (!expected || actual !== expected) {
    problems.push(
      `${name}: ${url} HTTP ${res.status}, sha256 ${actual ?? "-"} vs notes ${expected ?? "missing"}`,
    );
    continue;
  }
  specs[name] = url;
}
if (problems.length > 0)
  throw new Error(`template specs incomplete:\n- ${problems.join("\n- ")}`);
await Bun.write(out, `${JSON.stringify(specs, null, 2)}\n`);
console.log(
  `template-specs: ${Object.keys(specs).length} tools mapped to published releases`,
);
