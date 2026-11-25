// Single source of truth for the workspaces this repo gates, packs, and exports.

import { join } from "node:path";

export type ToolPackage = {
  readonly dir: string;
  readonly gates: readonly string[];
  /** Extra release assets (relative to the package dir) produced by its gates. */
  readonly extraAssets: readonly string[];
};

export const TOOL_PACKAGES: readonly ToolPackage[] = [
  { dir: "packages/rule-validator", gates: ["vet", "check"], extraAssets: [] },
  {
    dir: "packages/stepdown-rule",
    gates: ["vet", "lint", "compile:release"],
    // Platform binaries and SHA256SUMS only. The old repo's install.sh/install.ps1 hardcode
    // graffhyrum/stepdown-rule releases/latest and are not shipped from this repo.
    extraAssets: ["dist/release"],
  },
  { dir: "packages/crap4ts", gates: ["vet", "fmt:check"], extraAssets: [] },
  { dir: "packages/deslop-please-ts", gates: ["vet"], extraAssets: [] },
  // build before the template so the mutate4ts bin (dist/index.js) exists for its gate.
  {
    dir: "packages/mutate4ts",
    gates: ["vet", "fmt:check", "build"],
    extraAssets: [],
  },
];

export const TEMPLATE = {
  dir: "templates/ts-template",
  gates: ["vet", "build"],
} as const;

export const GATED_DIRS: readonly {
  readonly dir: string;
  readonly gates: readonly string[];
}[] = [...TOOL_PACKAGES, TEMPLATE];

/**
 * Extra gates (beyond each package's own `vet` script) that the root `bun vet`
 * orchestrator runs per package. Kept here so vet-all does not duplicate the
 * gate list from each package.json; `vet` itself is always run first.
 */
export const EXTRA_GATES: Readonly<Record<string, readonly string[]>> = {
  "packages/rule-validator": ["check"],
  "packages/stepdown-rule": ["lint", "compile:release"],
  "packages/crap4ts": ["fmt:check"],
  "packages/mutate4ts": ["fmt:check", "build"],
  "templates/ts-template": ["build"],
};

/**
 * Discover every workspace package directory that defines a `vet` script, derived
 * from the `workspaces` field of the root package.json. This keeps `bun vet` at
 * the root from silently skipping a package that was added to the workspaces but
 * not to a hand-maintained list.
 */
export async function discoverWorkspaceDirs(
  rootDir: string = process.cwd(),
): Promise<string[]> {
  const rootManifest = (await Bun.file(
    join(rootDir, "package.json"),
  ).json()) as { workspaces?: string[] };
  const patterns = rootManifest.workspaces ?? [];
  const dirs = new Set<string>();
  for (const pattern of patterns) {
    const globPattern = pattern.endsWith("package.json")
      ? pattern
      : `${pattern.replace(/\/+$/, "")}/package.json`;
    const glob = new Bun.Glob(globPattern);
    for (const match of glob.scanSync({ cwd: rootDir })) {
      const dir = match.replace(/\/package\.json$/, "");
      const manifest = (await Bun.file(
        join(rootDir, dir, "package.json"),
      ).json()) as { scripts?: { vet?: string } };
      if (manifest.scripts?.vet) dirs.add(dir);
    }
  }
  return [...dirs].sort();
}

/** File name `bun pm pack` writes for a package: scope `@a/b` becomes `a-b`. */
export function tarballName(name: string, version: string): string {
  return `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
}

export function releaseTag(dir: string, version: string): string {
  return `${dir.split("/").at(-1)}-v${version}`;
}

export function releaseAssetUrl(
  repo: string,
  tag: string,
  file: string,
): string {
  return `https://github.com/${repo}/releases/download/${tag}/${file}`;
}
