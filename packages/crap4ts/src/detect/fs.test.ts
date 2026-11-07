import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { bunFileSystem } from "./fs";

describe("bunFileSystem", () => {
  test("reads a file that exists and returns null when it does not", async () => {
    const dir = mkdtempSync(join(tmpdir(), "crap-fs-"));
    const file = join(dir, "a.ts");
    try {
      expect(await bunFileSystem.exists(file)).toBe(false);
      expect(await bunFileSystem.readText(file)).toBeNull();
      expect(await bunFileSystem.realPath(file)).toBe(file);
      await Bun.write(file, "export const n = 1;\n");
      expect(await bunFileSystem.exists(file)).toBe(true);
      expect(await bunFileSystem.readText(file)).toBe("export const n = 1;\n");
      expect(await bunFileSystem.realPath(file)).toBe(realpathSync(file));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
