import { discoverFullScanKeys } from "./file-contract/discovery.ts";
import { normalizeBaselineKey } from "./file-contract/path-key.ts";
import { readPathLines } from "./file-contract/read-inputs.ts";
import {
  buildScopedKeys,
  resolveSelectionMode,
  type FileSelection,
  type TargetingInputs,
} from "./file-contract/selection.ts";
import type { ParsedCli } from "./cli.ts";

export async function resolveFileSelection(
  opts: ParsedCli,
): Promise<FileSelection & { targetKeys: string[] }> {
  const literal: string[] = [...opts.filesFlags];
  if (opts.legacySourceFile) {
    literal.push(normalizeBaselineKey(opts.legacySourceFile));
  }
  let filesFromEmpty = false;
  if (opts.filesFrom !== undefined) {
    if (opts.filesFrom === "-") {
      const fromFile = await readPathLines("-", "--files-from");
      filesFromEmpty = fromFile.length === 0;
      literal.push(...fromFile);
    } else {
      const rawText = await Bun.file(opts.filesFrom).text();
      filesFromEmpty = rawText.length === 0;
      const fromFile = await readPathLines(opts.filesFrom, "--files-from");
      literal.push(...fromFile);
    }
  }
  const inputs: TargetingInputs = {
    filesFlags: opts.filesFlags,
    filesFromPresent: opts.filesFrom !== undefined,
    filesFromEmpty,
    legacySourcePresent: opts.legacySourceFile !== undefined,
  };
  const mode = resolveSelectionMode(inputs);
  if (mode === "full") {
    const keys = await discoverFullScanKeys();
    return { mode, scopedKeys: [], legacySourcePresent: false, targetKeys: keys };
  }
  const scopedKeys = await buildScopedKeys(literal);
  return {
    mode: "scoped",
    scopedKeys,
    legacySourcePresent: opts.legacySourceFile !== undefined,
    targetKeys: scopedKeys,
  };
}
