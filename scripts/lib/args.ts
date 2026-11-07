import { parseArgs } from "node:util";

export type PlanArgs = {
  readonly outDir: string;
  readonly repo: string;
  readonly mode: "dry-run" | "release";
};

const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

/** Parses `<outDir> [--repo owner/name] [--release]` in any order; strict repo for releases. */
export function parsePlanArgs(argv: readonly string[]): PlanArgs {
  const { values, positionals } = parseArgs({
    args: [...argv],
    options: {
      repo: { type: "string" },
      release: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
  });
  const [outDir, ...extra] = positionals;
  if (!outDir || extra.length > 0)
    throw new Error(
      "usage: release-plan <outDir> [--repo owner/name] [--release]",
    );
  const mode = values.release ? "release" : "dry-run";
  const repo = values.repo ?? (mode === "release" ? "" : "OWNER/ts-quality");
  if (mode === "release" && !REPO.test(repo))
    throw new Error(`--release needs --repo owner/name, got "${repo}"`);
  if (values.repo !== undefined && !REPO.test(values.repo))
    throw new Error(`invalid --repo "${values.repo}"`);
  return { outDir, repo, mode };
}

const ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function assetNameProblems(paths: readonly string[]): string[] {
  const names = paths.map((p) => p.split("/").at(-1) ?? "");
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  return [
    ...names
      .filter((n) => !ASSET_NAME.test(n))
      .map((n) => `unsafe asset name "${n}"`),
    ...dupes.map((n) => `duplicate asset name ${n}`),
  ];
}
