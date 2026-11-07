// Single source of truth for the workspaces this repo gates, packs, and exports.

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

/** File name `bun pm pack` writes for a package: scope `@a/b` becomes `a-b`. */
export function tarballName(name: string, version: string): string {
  return `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
}

/** Release tag: URL-safe, distinct from imported history tags such as `crap4ts/v2.1.3`. */
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
