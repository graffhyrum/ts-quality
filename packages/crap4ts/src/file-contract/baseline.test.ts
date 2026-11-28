import { describe, expect, test } from "bun:test";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  allowedCount,
  applyRenamesInMemory,
  assertBaselineAbsent,
  assertBaselinePresent,
  buildSeedBaseline,
  parseBaselineText,
  pruneMissingKeys,
  readBaselineFile,
  serializeBaseline,
  writeBaselineIfChanged,
} from "./baseline";
import { computeUpdatedBaseline } from "./violations";

describe("baseline file-contract", () => {
  test("parseBaselineText rejects BOM", () => {
    expect(() => parseBaselineText("\uFEFF{}")).toThrow("UTF-8 BOM");
  });

  test("allowedCount returns zero for missing keys and null baselines", () => {
    expect(allowedCount(null, "src/a.ts")).toBe(0);
    expect(allowedCount({ version: 1, files: { "src/a.ts": 2 } }, "src/b.ts")).toBe(0);
    expect(allowedCount({ version: 1, files: { "src/a.ts": 2 } }, "src/a.ts")).toBe(2);
  });

  test("returns null when the baseline file is absent", async () => {
    expect(await readBaselineFile(path.join(tmpdir(), "missing-baseline.json"))).toBeNull();
  });

  test("creates parent directories when writing a nested baseline", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "crap-baseline-nested-"));
    try {
      const file = path.join(dir, ".quality", "nested", "base.json");
      await writeBaselineIfChanged(file, { version: 1, files: { "src/a.ts": 1 } });
      expect(await Bun.file(file).exists()).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("skips baseline rewrite when bytes are unchanged", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "crap-baseline-skip-"));
    try {
      const file = path.join(dir, "base.json");
      const doc = { version: 1 as const, files: { "src/a.ts": 1 } };
      const text = serializeBaseline(doc);
      await writeFile(file, text);
      await writeBaselineIfChanged(file, doc);
      expect(await Bun.file(file).text()).toBe(text);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("reads and writes canonical baseline JSON", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "crap-baseline-"));
    try {
      const file = path.join(dir, ".quality/crap4ts-baseline.json");
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, `${serializeBaseline({ version: 1, files: { "src/a.ts": 2 } })}\n`);
      const doc = await readBaselineFile(file);
      expect(doc?.files["src/a.ts"]).toBe(2);
      await writeBaselineIfChanged(file, { version: 1, files: { "src/a.ts": 1 } });
      const updated = await readBaselineFile(file);
      expect(updated?.files["src/a.ts"]).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("empty rename list is a no-op", async () => {
    const result = await applyRenamesInMemory({ version: 1, files: { "a.ts": 1 } }, []);
    expect(result.files).toEqual({ "a.ts": 1 });
  });

  test("parseBaselineText omits zero violation counts", () => {
    const doc = parseBaselineText(
      `${JSON.stringify({ version: 1, files: { "src/a.ts": 2, "src/b.ts": 0 } })}\n`,
    );
    expect(doc.files).toEqual({ "src/a.ts": 2 });
  });

  test("serializeBaseline sorts keys by UTF-16 code units", () => {
    const text = serializeBaseline({
      version: 1,
      files: { a: 1, B: 2, _x: 3, "src/z.ts": 4 },
    });
    const bAt = text.indexOf('"B"');
    const underscoreAt = text.indexOf('"_x"');
    const aAt = text.indexOf('"a"');
    expect(bAt).toBeGreaterThan(-1);
    expect(underscoreAt).toBeGreaterThan(-1);
    expect(aAt).toBeGreaterThan(-1);
    expect(bAt).toBeLessThan(underscoreAt);
    expect(underscoreAt).toBeLessThan(aAt);
  });

  test("applyRenamesInMemory sorts rename pairs before applying", async () => {
    const cwd = process.cwd();
    const dir = await mkdtemp(path.join(tmpdir(), "crap-rename-sort-"));
    try {
      process.chdir(dir);
      await writeFile("a2.ts", "export const a = 1;\n");
      await writeFile("z2.ts", "export const z = 1;\n");
      const moved = await applyRenamesInMemory({ version: 1, files: { "z.ts": 3, "a.ts": 1 } }, [
        { from: "z.ts", to: "z2.ts" },
        { from: "a.ts", to: "a2.ts" },
      ]);
      expect(moved.files).toEqual({ "a2.ts": 1, "z2.ts": 3 });
    } finally {
      process.chdir(cwd);
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("applyRenamesInMemory moves keys", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "crap-rename-"));
    try {
      const target = path.join(dir, "new.ts");
      await writeFile(target, "export const x = 1;\n");
      const cwd = process.cwd();
      process.chdir(dir);
      const moved = await applyRenamesInMemory({ version: 1, files: { "old.ts": 2 } }, [
        { from: "old.ts", to: "new.ts" },
      ]);
      expect(moved.files["new.ts"]).toBe(2);
      expect(moved.files["old.ts"]).toBeUndefined();
      process.chdir(cwd);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("computeUpdatedBaseline blocks increases", () => {
    const base = { version: 1 as const, files: { "src/a.ts": 1 } };
    expect(
      computeUpdatedBaseline(base, ["src/a.ts"], new Map([["src/a.ts", 2]]), false, new Set()),
    ).toBeNull();
    expect(
      computeUpdatedBaseline(base, ["src/c.ts"], new Map([["src/c.ts", 1]]), false, new Set()),
    ).toBeNull();
  });

  test("buildSeedBaseline keeps positive counts only", () => {
    const doc = buildSeedBaseline(
      new Map([
        ["src/a.ts", 2],
        ["src/b.ts", 0],
      ]),
    );
    expect(doc.files).toEqual({ "src/a.ts": 2 });
  });

  test("rejects invalid baseline documents", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "crap-baseline-bad-"));
    try {
      const file = path.join(dir, "bad.json");
      await writeFile(file, "not json");
      await expect(readBaselineFile(file)).rejects.toThrow("invalid JSON");
      await writeFile(file, "null");
      await expect(readBaselineFile(file)).rejects.toThrow("invalid shape");
      await writeFile(file, `${JSON.stringify({ version: 2, files: {} })}\n`);
      await expect(readBaselineFile(file)).rejects.toThrow("unsupported version");
      await writeFile(file, `${JSON.stringify({ version: 1, files: [] })}\n`);
      await expect(readBaselineFile(file)).rejects.toThrow("invalid files map");
      await writeFile(file, `${JSON.stringify({ version: 1, files: { "src/a.ts": -1 } })}\n`);
      await expect(readBaselineFile(file)).rejects.toThrow("invalid count");
      await writeFile(file, `${JSON.stringify({ version: 1, files: { "src/a.ts": 1.5 } })}\n`);
      await expect(readBaselineFile(file)).rejects.toThrow("invalid count");
      await writeFile(file, `${JSON.stringify({ version: 1, files: { "": 1 } })}\n`);
      await expect(readBaselineFile(file)).rejects.toThrow("invalid key");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("prunes missing keys on full scan updates", () => {
    const pruned = pruneMissingKeys(
      { version: 1, files: { "gone.ts": 1, "stay.ts": 2 } },
      new Set(["stay.ts"]),
    );
    expect(pruned.files).toEqual({ "stay.ts": 2 });
  });

  test("assertBaseline helpers enforce presence rules", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "crap-assert-"));
    try {
      const file = path.join(dir, "base.json");
      await writeFile(file, `${serializeBaseline({ version: 1, files: { "a.ts": 1 } })}\n`);
      await assertBaselineAbsent(path.join(dir, "missing.json"));
      expect(() => assertBaselinePresent(null)).toThrow("baseline file missing");
      const doc = await readBaselineFile(file);
      assertBaselinePresent(doc);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rejects rename onto an existing baseline key", async () => {
    const cwd = process.cwd();
    const dir = await mkdtemp(path.join(tmpdir(), "crap-rename-dup-key-"));
    try {
      process.chdir(dir);
      await writeFile("b.ts", "export const x = 1;\n");
      await expect(
        applyRenamesInMemory({ version: 1, files: { "a.ts": 1, "b.ts": 2 } }, [
          { from: "a.ts", to: "b.ts" },
        ]),
      ).rejects.toThrow("already has a baseline key");
    } finally {
      process.chdir(cwd);
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("applyRenamePair no-ops when from is absent", async () => {
    const cwd = process.cwd();
    const dir = await mkdtemp(path.join(tmpdir(), "crap-rename-noop-"));
    try {
      process.chdir(dir);
      await writeFile("new.ts", "export const x = 1;\n");
      const moved = await applyRenamesInMemory({ version: 1, files: {} }, [
        { from: "old.ts", to: "new.ts" },
      ]);
      expect(moved.files).toEqual({});
    } finally {
      process.chdir(cwd);
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rejects rename cycles and duplicate target keys", async () => {
    const cwd = process.cwd();
    const dir = await mkdtemp(path.join(tmpdir(), "crap-rename-cycle-"));
    try {
      process.chdir(dir);
      await writeFile("a.ts", "export const a = 1;\n");
      await writeFile("b.ts", "export const b = 1;\n");
      await expect(
        applyRenamesInMemory({ version: 1, files: { "a.ts": 1, "b.ts": 1 } }, [
          { from: "a.ts", to: "b.ts" },
          { from: "b.ts", to: "a.ts" },
        ]),
      ).rejects.toThrow("cycle");
      await expect(
        applyRenamesInMemory({ version: 1, files: { "a.ts": 1 } }, [
          { from: "a.ts", to: "missing.ts" },
        ]),
      ).rejects.toThrow("does not exist");
    } finally {
      process.chdir(cwd);
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("assertBaselineAbsent rejects existing files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "crap-assert-absent-"));
    try {
      const file = path.join(dir, "base.json");
      await writeFile(file, "{}");
      await expect(assertBaselineAbsent(file)).rejects.toThrow("already exists");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rename graph validation errors", async () => {
    const cwd = process.cwd();
    const dir = await mkdtemp(path.join(tmpdir(), "crap-rename-bad-"));
    try {
      process.chdir(dir);
      await writeFile("b.ts", "export const b = 1;\n");
      await expect(
        applyRenamesInMemory({ version: 1, files: { "a.ts": 1, "c.ts": 1 } }, [
          { from: "a.ts", to: "b.ts" },
          { from: "c.ts", to: "b.ts" },
        ]),
      ).rejects.toThrow("duplicate to");
    } finally {
      process.chdir(cwd);
      await rm(dir, { recursive: true, force: true });
    }
  });
});
