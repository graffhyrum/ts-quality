import { describe, expect, test } from "bun:test";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { parsePathLines, parseRenamePairs, readPathLines, readRenamePairs } from "./read-inputs";
import { UsageError } from "./path-key";

describe("read-inputs", () => {
  test("parsePathLines rejects BOM and NUL bytes", () => {
    expect(() => parsePathLines("\uFEFFsrc/a.ts\n", "--files-from")).toThrow("UTF-8 BOM");
    expect(() => parsePathLines("src/a.ts\0\n", "--files-from")).toThrow("contains NUL");
  });

  test("parseRenamePairs rejects BOM", () => {
    expect(() => parseRenamePairs("\uFEFFa.ts\tb.ts\n", "--renames-from")).toThrow("UTF-8 BOM");
  });

  test("rejects missing files-from path", async () => {
    await expect(readPathLines("does-not-exist.txt", "--files-from")).rejects.toThrow(
      "cannot read",
    );
  });

  test("rejects NUL bytes in files-from", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "crap-nul-"));
    try {
      const file = path.join(dir, "paths.txt");
      await writeFile(file, "src/a.ts\0\n");
      await expect(readPathLines(file, "--files-from")).rejects.toThrow("contains NUL");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("reads path lines from a file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "crap-read-"));
    try {
      const file = path.join(dir, "paths.txt");
      await writeFile(file, "src/a.ts\r\n\nsrc/b.ts\n");
      expect(await readPathLines(file, "--files-from")).toEqual(["src/a.ts", "src/b.ts"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("reads rename pairs", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "crap-renames-"));
    try {
      const file = path.join(dir, "renames.txt");
      await writeFile(file, "old.ts\tnew.ts\n");
      expect(await readRenamePairs(file, "--renames-from")).toEqual([
        { from: "old.ts", to: "new.ts" },
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rejects missing renames-from path", async () => {
    await expect(readRenamePairs("missing-renames.txt", "--renames-from")).rejects.toThrow(
      "cannot read",
    );
  });

  test("rejects invalid rename lines", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "crap-renames-bad-"));
    try {
      const file = path.join(dir, "renames.txt");
      await writeFile(file, "broken-line\n");
      await expect(readRenamePairs(file, "--renames-from")).rejects.toThrow(UsageError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
