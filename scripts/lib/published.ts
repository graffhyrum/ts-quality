// Pure selection of the newest published release per tool, for template export specs.
import { compareSemver } from "./readiness.ts";

export type ReleaseInfo = {
  readonly tagName: string;
  readonly isDraft: boolean;
  readonly isPrerelease: boolean;
};

/** Newest non-draft, non-prerelease `<base>-v<semver>` release, or null. */
export function latestPublished(
  base: string,
  releases: readonly ReleaseInfo[],
): { tag: string; version: string } | null {
  const prefix = `${base}-v`;
  const candidates = releases
    .filter(
      (r) => !r.isDraft && !r.isPrerelease && r.tagName.startsWith(prefix),
    )
    .map((r) => ({ tag: r.tagName, version: r.tagName.slice(prefix.length) }))
    .filter((r) => /^\d+\.\d+\.\d+$/.test(r.version))
    .sort((a, b) => compareSemver(b.version, a.version));
  return candidates[0] ?? null;
}

/** sha256 that draft-releases wrote into the notes for an asset, or null. */
export function notedSha256(body: string, asset: string): string | null {
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    new RegExp(`\`${escaped}\` \`([0-9a-f]{64})\``).exec(body)?.[1] ?? null
  );
}

export type ReleaseLookup = "exists" | "absent" | "error";

/** Classifies `gh release view`: only the exact not-found message means absent; auth, network,
 * and rate-limit failures are errors so callers fail closed. */
export function classifyReleaseLookup(
  exitCode: number,
  stderr: string,
): ReleaseLookup {
  if (exitCode === 0) return "exists";
  return stderr.trim() === "release not found" ? "absent" : "error";
}

/** Problem with a downloaded tarball versus the sha256 in its release notes, or null on match. */
export function assetCheckProblem(
  expected: string | null,
  httpStatus: number,
  actual: string | null,
): string | null {
  if (expected === null) return "release notes record no sha256 for the asset";
  if (httpStatus !== 200 || actual === null) {
    return `download failed with HTTP ${httpStatus} (anonymous downloads need a public repo)`;
  }
  return actual === expected
    ? null
    : `sha256 ${actual} does not match notes ${expected}`;
}
