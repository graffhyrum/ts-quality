import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { buildScopedKeys, resolveSelectionMode } from "./selection";

describe("resolveSelectionMode", () => {
  test("defaults to full scan with no targeting", () => {
    expect(
      resolveSelectionMode({
        filesFlags: [],
        filesFromPresent: false,
        filesFromEmpty: false,
        legacyPresent: false,
      }),
    ).toBe("full");
  });

  test("treats empty files-from as full scan", () => {
    expect(
      resolveSelectionMode({
        filesFlags: [],
        filesFromPresent: true,
        filesFromEmpty: true,
        legacyPresent: false,
      }),
    ).toBe("full");
  });

  test("buildScopedKeys filters extensions missing paths and gitignore", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "crap-select-"));
    const prev = process.cwd();
    try {
      await mkdir(path.join(dir, "src"), { recursive: true });
      await writeFile(path.join(dir, "src/keep.ts"), "export const x = 1;\n");
      await writeFile(path.join(dir, ".gitignore"), "src/ignored.ts\n");
      await writeFile(path.join(dir, "src/ignored.ts"), "export const y = 1;\n");
      process.chdir(dir);
      const keys = await buildScopedKeys(
        ["src/keep.ts", "src/missing.ts", "README.md"],
        [],
        [],
        false,
      );
      expect(keys).toEqual(["src/keep.ts"]);
      const gitignored = await buildScopedKeys(
        ["src/ignored.ts"],
        [],
        await import("../gitignore").then((m) => m.loadGitignoreGlobs(".")),
        false,
      );
      expect(gitignored).toEqual([]);
    } finally {
      process.chdir(prev);
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("uses scoped mode when paths are present", () => {
    expect(
      resolveSelectionMode({
        filesFlags: ["src/a.ts"],
        filesFromPresent: false,
        filesFromEmpty: false,
        legacyPresent: false,
      }),
    ).toBe("scoped");
  });
});
