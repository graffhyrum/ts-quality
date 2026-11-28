import { hasExplicitListExtension } from "./extensions.ts";
import { comparePath } from "./path-key.ts";
import { pathExists } from "./read-inputs.ts";

export type SelectionMode = "full" | "scoped";

export type FileSelection = {
  mode: SelectionMode;
  scopedKeys: string[];
  legacySourcePresent: boolean;
};

export type TargetingInputs = {
  filesFlags: string[];
  filesFromPresent: boolean;
  filesFromEmpty: boolean;
  legacySourcePresent: boolean;
};

export function resolveSelectionMode(inputs: TargetingInputs): SelectionMode {
  const hasFiles = inputs.filesFlags.length > 0;
  const hasLegacy = inputs.legacySourcePresent;
  const hasFilesFrom = inputs.filesFromPresent;
  if (!hasFiles && !hasFilesFrom && !hasLegacy) {
    return "full";
  }
  if (hasFilesFrom && !hasFiles && !hasLegacy && inputs.filesFromEmpty) {
    return "full";
  }
  return "scoped";
}

export async function buildScopedKeys(literalPaths: string[]): Promise<string[]> {
  const raw = [...new Set(literalPaths)].sort(comparePath);
  const out: string[] = [];
  for (const key of raw) {
    if (!hasExplicitListExtension(key)) continue;
    if (!(await pathExists(key))) continue;
    out.push(key);
  }
  return out;
}
