import { SelectorFailure } from "./failure.ts";

export type Change =
  | { readonly kind: "add"; readonly path: string }
  | { readonly kind: "modify"; readonly path: string }
  | { readonly kind: "delete"; readonly path: string }
  | { readonly kind: "typechange"; readonly path: string }
  | { readonly kind: "rename"; readonly from: string; readonly to: string }
  | { readonly kind: "copy"; readonly from: string; readonly to: string };

export type Rename = { readonly from: string; readonly to: string };

export type Selection = {
  readonly files: readonly string[];
  readonly renames: readonly Rename[];
  readonly deletes: readonly string[];
};

const RENAMED = /^([RC])(\d+)$/;
const SINGLE = /^([ADMT])$/;

const SINGLE_KIND = {
  A: "add",
  D: "delete",
  M: "modify",
  T: "typechange",
} as const;

/** Split git `-z` output. A trailing NUL does not produce an empty field. */
export function splitNul(bytes: Uint8Array): string[] {
  if (bytes.length === 0) return [];
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 0) continue;
    parts.push(decodeUtf8(bytes.subarray(start, i)));
    start = i + 1;
  }
  if (start < bytes.length) parts.push(decodeUtf8(bytes.subarray(start)));
  if (parts.at(-1) === "") parts.pop();
  return parts;
}

export function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new SelectorFailure(2, "file-selector: git output is not UTF-8");
  }
}

export function parseNameStatus(bytes: Uint8Array): Change[] {
  const parts = splitNul(bytes);
  const changes: Change[] = [];
  let index = 0;
  while (index < parts.length) {
    const status = parts[index];
    if (status === undefined) break;
    index += 1;
    const renamed = RENAMED.exec(status);
    if (renamed) {
      const letter = renamed[1];
      const from = take(parts, index);
      const to = take(parts, index + 1);
      index += 2;
      changes.push({
        kind: letter === "R" ? "rename" : "copy",
        from,
        to,
      });
      continue;
    }
    const single = SINGLE.exec(status);
    const letter = single?.[1];
    if (letter === undefined || !(letter in SINGLE_KIND)) {
      throw new SelectorFailure(
        2,
        `file-selector: unsupported git status ${status}`,
      );
    }
    const kind = SINGLE_KIND[letter as keyof typeof SINGLE_KIND];
    changes.push({ kind, path: take(parts, index) });
    index += 1;
  }
  return changes;
}

export function selectChanges(changes: readonly Change[]): Selection {
  const files: string[] = [];
  const renames: Rename[] = [];
  const deletes: string[] = [];
  for (const change of changes) {
    if (change.kind === "delete") {
      deletes.push(change.path);
      continue;
    }
    if (change.kind === "rename") {
      files.push(change.to);
      renames.push({ from: change.from, to: change.to });
      continue;
    }
    if (change.kind === "copy") {
      files.push(change.to);
      continue;
    }
    files.push(change.path);
  }
  return {
    files: uniqueSorted(files),
    renames: [...renames].sort(
      (a, b) => comparePath(a.to, b.to) || comparePath(a.from, b.from),
    ),
    deletes: uniqueSorted(deletes),
  };
}

export function toSelection(bytes: Uint8Array): Selection {
  const selection = selectChanges(parseNameStatus(bytes));
  assertPortablePaths(selection);
  return selection;
}

export function partialPaths(
  files: readonly string[],
  dirty: readonly string[],
): string[] {
  const dirtySet = new Set(dirty);
  return files.filter((file) => dirtySet.has(file));
}

export function assertPortablePaths(selection: Selection): void {
  const paths = [
    ...selection.files,
    ...selection.deletes,
    ...selection.renames.flatMap((rename) => [rename.from, rename.to]),
  ];
  for (const filePath of paths) {
    if (filePath.length === 0) {
      throw new SelectorFailure(2, "file-selector: git emitted an empty path");
    }
    if (
      filePath.includes("\n") ||
      filePath.includes("\r") ||
      filePath.includes("\0")
    ) {
      throw new SelectorFailure(
        2,
        "file-selector: a path contains a newline and cannot be passed to --files-from -",
      );
    }
    if (filePath.includes("\\")) {
      throw new SelectorFailure(
        2,
        `file-selector: path contains a backslash: ${filePath}`,
      );
    }
  }
}

function take(parts: readonly string[], index: number): string {
  const value = parts[index];
  if (value === undefined || value.length === 0) {
    throw new SelectorFailure(
      2,
      "file-selector: git name-status output ended early",
    );
  }
  return value;
}

function uniqueSorted(paths: readonly string[]): string[] {
  return [...new Set(paths)].sort(comparePath);
}

function comparePath(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
