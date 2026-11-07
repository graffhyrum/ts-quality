// Fail-closed release readiness rules. Pure: callers gather git/changeset facts.

export type PackageFacts = {
  readonly dir: string;
  readonly name: string;
  readonly version: string;
  /** Tag names in the repo (imported `<dir>/v<x>` and new `<dir>-v<x>`). */
  readonly tags: readonly string[];
  /** Commit the new-format tag for this version points at, if it exists. */
  readonly currentTagTarget: string | null;
  /** True when the package directory differs from the commit of its newest prior release. */
  readonly changedSinceLastRelease: boolean;
};

export type RepoFacts = {
  readonly pendingChangesets: readonly string[];
  readonly head: string;
  readonly ref: string;
  readonly clean: boolean;
};

export type Verdict =
  | { readonly kind: "release"; readonly dir: string }
  | { readonly kind: "already-released"; readonly dir: string }
  | { readonly kind: "unchanged"; readonly dir: string };

export function releasedVersions(
  dir: string,
  tags: readonly string[],
): string[] {
  const base = dir.split("/").at(-1) ?? dir;
  return tags.flatMap((tag) => {
    const match = new RegExp(
      `^${escape(base)}(?:/|-)v(\\d+\\.\\d+\\.\\d+(?:-[\\w.]+)?)$`,
    ).exec(tag);
    return match?.[1] ? [match[1]] : [];
  });
}

export function compareSemver(a: string, b: string): number {
  const [pa, pb] = [a, b].map(
    (v) => v.split("-")[0]?.split(".").map(Number) ?? [],
  );
  for (let i = 0; i < 3; i++) {
    const diff = (pa?.[i] ?? 0) - (pb?.[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function repoProblems(repo: RepoFacts): string[] {
  return [
    ...(repo.ref === "refs/heads/main"
      ? []
      : [`releases run from refs/heads/main, not ${repo.ref}`]),
    ...(repo.clean ? [] : ["working tree is not clean"]),
    ...repo.pendingChangesets.map(
      (file) =>
        `pending changeset ${file}: merge the Version Packages PR first`,
    ),
  ];
}

export function packageVerdict(
  pkg: PackageFacts,
  head: string,
): Verdict | { readonly kind: "problem"; readonly message: string } {
  const base = pkg.dir.split("/").at(-1) ?? pkg.dir;
  if (pkg.tags.includes(`${base}/v${pkg.version}`)) {
    return {
      kind: "problem",
      message: `${pkg.name}@${pkg.version} was already released from the original repo (tag ${base}/v${pkg.version}); bump the version`,
    };
  }
  if (pkg.currentTagTarget !== null) {
    return pkg.currentTagTarget === head || !pkg.changedSinceLastRelease
      ? { kind: "already-released", dir: pkg.dir }
      : {
          kind: "problem",
          message: `${base}-v${pkg.version} exists at ${pkg.currentTagTarget} but the package changed since; bump the version`,
        };
  }
  const newer = releasedVersions(pkg.dir, pkg.tags).filter(
    (v) => compareSemver(v, pkg.version) >= 0,
  );
  if (newer.length > 0) {
    return {
      kind: "problem",
      message: `${pkg.name}@${pkg.version} is not above released ${newer.join(", ")}`,
    };
  }
  return pkg.changedSinceLastRelease
    ? { kind: "release", dir: pkg.dir }
    : { kind: "unchanged", dir: pkg.dir };
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
