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
