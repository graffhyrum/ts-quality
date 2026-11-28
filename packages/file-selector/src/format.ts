import type { Selection } from "./name-status.ts";

export const SELECTOR_SCHEMA = "ts-quality/file-selector/v1";

/** Newline-separated path list. Empty selection is zero bytes. */
export function formatPathList(files: readonly string[]): string {
  if (files.length === 0) return "";
  return `${files.join("\n")}\n`;
}

/** One JSON document and a trailing newline. Key order is the schema order. */
export function formatJson(selection: Selection): string {
  return `${JSON.stringify({
    schema: SELECTOR_SCHEMA,
    files: selection.files,
    renames: selection.renames,
    deletes: selection.deletes,
  })}\n`;
}
