import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readBaselineFile,
  applyRenamesInMemory,
  serializeBaseline,
  writeBaselineIfChanged,
  buildSeedBaseline,
  pruneMissingKeys,
  assertBaselineAbsent,
  assertBaselinePresent,
  allowedCount,
} from "./baseline.ts";
import { readPathLines, readRenamePairs } from "./read-inputs.ts";
import { buildUpdatedBaseline } from "./baseline-update.ts";
import { UsageError } from "./path-key.ts";

describe("file-contract baseline IO", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "m4t-base-io-"));
    writeFileSync(join(dir, "new.ts"), "export const x = 1;\n");
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("drops zero counts when reading baseline", async () => {
    const path = join(dir, "zero.json");
    writeFileSync(path, JSON.stringify({ version: 1, files: { "a.ts": 0, "b.ts": 2 } }));
    const doc = await readBaselineFile(path);
    expect(doc?.files).toEqual({ "b.ts": 2 });
  });

  test("rejects baseline file with UTF-8 BOM", async () => {
    const path = join(dir, "bom-baseline.json");
    writeFileSync(path, "{}", "utf8");
    const originalFile = Bun.file;
    Bun.file = ((input: string | URL | ArrayBuffer) => {
      const resolved = String(input);
      if (resolved.endsWith("bom-baseline.json")) {
        return { text: async () => '\uFEFF{"version":1,"files":{}}' } as ReturnType<
          typeof Bun.file
        >;
      }
      return originalFile(resolved);
    }) as typeof Bun.file;
    try {
      await expect(readBaselineFile(path)).rejects.toThrow("BOM");
    } finally {
      Bun.file = originalFile;
    }
  });

  test("missing baseline file returns null", async () => {
    const missing = join(dir, "missing-baseline.json");
    expect(await readBaselineFile(missing)).toBeNull();
  });

  test("reads and writes canonical baseline", async () => {
    const path = join(dir, "base.json");
    const doc = { version: 1 as const, files: { "src/a.ts": 2 } };
    await writeBaselineIfChanged(path, doc);
    const before = await Bun.file(path).text();
    await writeBaselineIfChanged(path, doc);
    const after = await Bun.file(path).text();
    expect(after).toBe(before);
    const parsed = await readBaselineFile(path);
    expect(parsed).toEqual(doc);
    expect(serializeBaseline(doc)).toContain('"version": 1');
    const sorted = serializeBaseline({
      version: 1,
      files: { "b.ts": 1, "a.ts": 2 },
    });
    expect(sorted.indexOf('"a.ts"')).toBeLessThan(sorted.indexOf('"b.ts"'));
  });

  test("rejects invalid baseline bytes", async () => {
    const path = join(dir, "bad.json");
    writeFileSync(path, "{not json");
    await expect(readBaselineFile(path)).rejects.toThrow(UsageError);
  });

  test("applyRenamesInMemory applies sorted rename batches", async () => {
    const cwd = process.cwd();
    process.chdir(dir);
    writeFileSync(join(dir, "new-a.ts"), "export const a = 1;\n");
    writeFileSync(join(dir, "new-b.ts"), "export const b = 1;\n");
    try {
      const next = await applyRenamesInMemory({ version: 1, files: { "a.ts": 1, "b.ts": 2 } }, [
        { from: "b.ts", to: "new-b.ts" },
        { from: "a.ts", to: "new-a.ts" },
      ]);
      expect(next.files).toEqual({ "new-a.ts": 1, "new-b.ts": 2 });
    } finally {
      process.chdir(cwd);
    }
  });

  test("applyRenamesInMemory noops without rename pairs", async () => {
    const doc = { version: 1 as const, files: { "a.ts": 1 } };
    const next = await applyRenamesInMemory(doc, []);
    expect(next).toEqual(doc);
  });

  test("applyRenamesInMemory skips renames for keys outside baseline", async () => {
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const next = await applyRenamesInMemory({ version: 1, files: {} }, [
        { from: "missing.ts", to: "new.ts" },
      ]);
      expect(next.files).toEqual({});
    } finally {
      process.chdir(cwd);
    }
  });

  test("applyRenamesInMemory moves keys", async () => {
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const baseline = { version: 1 as const, files: { "old.ts": 2 } };
      const next = await applyRenamesInMemory(baseline, [{ from: "old.ts", to: "new.ts" }]);
      expect(next.files).toEqual({ "new.ts": 2 });
    } finally {
      process.chdir(cwd);
    }
  });

  test("readPathLines skips empty lines", async () => {
    const path = join(dir, "paths.txt");
    writeFileSync(path, "a.ts\n\nb.ts\r\n");
    const lines = await readPathLines(path, "paths");
    expect(lines).toEqual(["a.ts", "b.ts"]);
  });

  test("readRenamePairs parses tab lines", async () => {
    const path = join(dir, "renames.txt");
    writeFileSync(path, "old.ts\tnew.ts\n");
    const pairs = await readRenamePairs(path, "renames");
    expect(pairs).toEqual([{ from: "old.ts", to: "new.ts" }]);
  });

  test("buildUpdatedBaseline shrinks counts", async () => {
    const baseline = { version: 1 as const, files: { "src/a.ts": 4 } };
    const violations = new Map([["src/a.ts", 2]]);
    const unknown = await buildUpdatedBaseline(
      baseline,
      violations,
      new Set(["src/other.ts"]),
      false,
    );
    expect(unknown.files["src/a.ts"]).toBe(4);
    const next = await buildUpdatedBaseline(baseline, violations, new Set(["src/a.ts"]), false);
    expect(next.files["src/a.ts"]).toBe(2);
    const seed = buildSeedBaseline(violations);
    expect(seed.files["src/a.ts"]).toBe(2);
  });

  test("buildUpdatedBaseline drops zero and skips unknown keys", async () => {
    const baseline = { version: 1 as const, files: { "src/a.ts": 4, "src/other.ts": 1 } };
    const violations = new Map([["src/a.ts", 0]]);
    const next = await buildUpdatedBaseline(baseline, violations, new Set(["src/a.ts"]), false);
    expect(next.files["src/a.ts"]).toBeUndefined();
    expect(next.files["src/other.ts"]).toBe(1);
  });

  test("buildUpdatedBaseline prunes missing files on full scan", async () => {
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      writeFileSync(join(dir, "gone.ts"), "export const g = 1;\n");
      const baseline = {
        version: 1 as const,
        files: { "new.ts": 2, "missing.ts": 3, "gone.ts": 1 },
      };
      await Bun.$`rm -f ${join(dir, "gone.ts")}`;
      const violations = new Map([["new.ts", 1]]);
      const next = await buildUpdatedBaseline(baseline, violations, new Set(["new.ts"]), true);
      expect(next.files).toEqual({ "new.ts": 1 });
    } finally {
      process.chdir(cwd);
    }
  });

  test("baseline validation errors", async () => {
    const nullPath = join(dir, "null.json");
    writeFileSync(nullPath, "null");
    await expect(readBaselineFile(nullPath)).rejects.toThrow("invalid shape");
    const versionPath = join(dir, "shape.json");
    writeFileSync(versionPath, JSON.stringify({ version: 2, files: {} }));
    await expect(readBaselineFile(versionPath)).rejects.toThrow("unsupported version");
    const filesPath = join(dir, "files.json");
    writeFileSync(filesPath, JSON.stringify({ version: 1, files: [] }));
    await expect(readBaselineFile(filesPath)).rejects.toThrow("invalid files map");
    const missingFiles = join(dir, "missing-files.json");
    writeFileSync(missingFiles, JSON.stringify({ version: 1 }));
    await expect(readBaselineFile(missingFiles)).rejects.toThrow("invalid files map");
    const keyPath = join(dir, "key.json");
    writeFileSync(keyPath, JSON.stringify({ version: 1, files: { "": 1 } }));
    await expect(readBaselineFile(keyPath)).rejects.toThrow("invalid key");
    const countPath = join(dir, "count.json");
    writeFileSync(countPath, JSON.stringify({ version: 1, files: { "a.ts": -1 } }));
    await expect(readBaselineFile(countPath)).rejects.toThrow("invalid count");
  });

  test("rename errors and chained renames", async () => {
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      await expect(
        applyRenamesInMemory({ version: 1, files: { "a.ts": 1 } }, [
          { from: "a.ts", to: "b.ts" },
          { from: "b.ts", to: "a.ts" },
        ]),
      ).rejects.toThrow("cycle");
      await expect(
        applyRenamesInMemory({ version: 1, files: {} }, [{ from: "nope.ts", to: "new.ts" }]),
      ).resolves.toBeDefined();
      writeFileSync(join(dir, "dup.ts"), "export const d = 1;\n");
      await expect(
        applyRenamesInMemory({ version: 1, files: { "old.ts": 1, "dup.ts": 2 } }, [
          { from: "old.ts", to: "dup.ts" },
        ]),
      ).rejects.toThrow("already has a baseline key");
      await expect(
        applyRenamesInMemory({ version: 1, files: { "old.ts": 1 } }, [
          { from: "old.ts", to: "missing.ts" },
        ]),
      ).rejects.toThrow("does not exist");
      await expect(
        applyRenamesInMemory({ version: 1, files: {} }, [
          { from: "x.ts", to: "new.ts" },
          { from: "y.ts", to: "new.ts" },
        ]),
      ).rejects.toThrow("duplicate");
    } finally {
      process.chdir(cwd);
    }
  });

  test("pruneMissingKeys and assert helpers", async () => {
    const doc = { version: 1 as const, files: { "a.ts": 1, "b.ts": 2 } };
    expect(pruneMissingKeys(doc, new Set(["a.ts"])).files).toEqual({ "a.ts": 1 });
    const missing = join(dir, "nope-baseline.json");
    await assertBaselineAbsent(missing);
    const present = join(dir, "present-baseline.json");
    writeFileSync(present, "{}");
    await expect(assertBaselineAbsent(present)).rejects.toThrow("already exists");
    expect(() => assertBaselinePresent(null)).toThrow("missing");
    assertBaselinePresent(doc);
    expect(allowedCount(doc, "a.ts")).toBe(1);
    expect(allowedCount(null, "a.ts")).toBe(0);
  });
});
