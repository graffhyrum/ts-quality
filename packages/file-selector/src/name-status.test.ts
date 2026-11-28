import { describe, expect, test } from "bun:test";
import { SelectorFailure } from "./failure.ts";
import { parseNameStatus, partialPaths, toSelection } from "./name-status.ts";

function z(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("parseNameStatus", () => {
  test("reads modify, rename, and delete records from git -z output", () => {
    const selection = toSelection(z("M\0a.ts\0R100\0b.ts\0c.ts\0D\0d.ts\0"));
    expect(selection.files).toEqual(["a.ts", "c.ts"]);
    expect(selection.renames).toEqual([{ from: "b.ts", to: "c.ts" }]);
    expect(selection.deletes).toEqual(["d.ts"]);
  });

  test("a copy is a new path and does not carry a rename", () => {
    const selection = toSelection(z("C100\0old.ts\0new.ts\0"));
    expect(selection.files).toEqual(["new.ts"]);
    expect(selection.renames).toEqual([]);
    expect(selection.deletes).toEqual([]);
  });

  test("an unsupported status is an operational error", () => {
    expect(() => parseNameStatus(z("U\0a.ts\0"))).toThrow(SelectorFailure);
  });

  test("a truncated rename is an operational error", () => {
    expect(() => parseNameStatus(z("R100\0only-old.ts\0"))).toThrow(
      SelectorFailure,
    );
  });

  test("a path that contains a newline cannot be a line-oriented list", () => {
    expect(() => toSelection(z("M\0a\nb.ts\0"))).toThrow(SelectorFailure);
  });

  test("a path that starts with U+FEFF keeps that character", () => {
    expect(toSelection(z("M\0\uFEFFold.ts\0")).files).toEqual(["\uFEFFold.ts"]);
  });
});

describe("partialPaths", () => {
  test("keeps only emitted paths whose worktree differs", () => {
    expect(
      partialPaths(["a.ts", "b.ts"], ["b.ts", "untracked-looking.ts"]),
    ).toEqual(["b.ts"]);
  });
});
