import type { Glob } from "bun";
import { isGitignored } from "../gitignore";
import type { FileSystem } from "../detect/types";
import { bunFileSystem } from "../detect/fs";
import { hasExplicitListExtension } from "./extensions";
import { absolutePathForKey, normalizeBaselineKey } from "./path-key";

export type SelectionMode = "full" | "scoped";

export type FileSelection = {
  mode: SelectionMode;
  scopedKeys: string[];
};

export type TargetingInputs = {
  filesFlags: string[];
  filesFromPresent: boolean;
  filesFromEmpty: boolean;
  legacyPresent: boolean;
};

export function resolveSelectionMode(inputs: TargetingInputs): SelectionMode {
  const hasFiles = inputs.filesFlags.length > 0;
  const hasLegacy = inputs.legacyPresent;
  const hasFilesFrom = inputs.filesFromPresent;
  if (!hasFiles && !hasFilesFrom && !hasLegacy) {
    return "full";
  }
  if (hasFilesFrom && !hasFiles && !hasLegacy && inputs.filesFromEmpty) {
    return "full";
  }
  return "scoped";
}

export async function buildScopedKeys(
  literalPaths: string[],
  legacyPaths: string[],
  gitignoreGlobs: Glob[],
  skipGitignore: boolean,
  fs: FileSystem = bunFileSystem,
): Promise<string[]> {
  const raw = new Set<string>();
  for (const path of literalPaths) {
    raw.add(normalizeBaselineKey(path));
  }
  for (const path of legacyPaths) {
    raw.add(normalizeBaselineKey(path));
  }
  const keys = [...raw].sort((a, b) => a.localeCompare(b));
  const out: string[] = [];
  for (const key of keys) {
    if (!hasExplicitListExtension(key)) continue;
    if (!(await fs.exists(absolutePathForKey(key)))) continue;
    if (!skipGitignore && isGitignored(gitignoreGlobs, key)) continue;
    out.push(key);
  }
  return out;
}
