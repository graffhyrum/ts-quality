import { test, expect, describe, beforeAll, afterAll, spyOn } from "bun:test";
import * as readInputs from "./file-contract/read-inputs.ts";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveFileSelection } from "./resolve-targeting.ts";
import type { ParsedCli } from "./cli.ts";

const baseOpts = (): ParsedCli => ({
  scan: false,
  testCommand: ["bun", "test"],
  lines: undefined,
  verbose: false,
  timeoutFactor: 2,
  filesFlags: [],
  filesFrom: undefined,
  renamesFrom: undefined,
  report: "human",
  baselinePath: ".quality/mutate4ts-baseline.json",
  updateBaseline: false,
  seed: false,
  legacySourceFile: undefined,
});

describe("resolveFileSelection", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "m4t-target-"));
    writeFileSync(join(dir, "package.json"), "{}\n");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src/a.ts"), "export const x = 1;\n");
    writeFileSync(join(dir, "src/a.test.ts"), 'import "./a.ts";\n');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("scoped via --files", async () => {
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const sel = await resolveFileSelection({ ...baseOpts(), filesFlags: ["src/a.ts"] });
      expect(sel.mode).toBe("scoped");
      expect(sel.targetKeys).toEqual(["src/a.ts"]);
    } finally {
      process.chdir(cwd);
    }
  });

  test("full scan with no targeting", async () => {
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const sel = await resolveFileSelection(baseOpts());
      expect(sel.mode).toBe("full");
      expect(sel.targetKeys).toContain("src/a.ts");
    } finally {
      process.chdir(cwd);
    }
  });

  test("legacy source file joins scoped list", async () => {
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const sel = await resolveFileSelection({
        ...baseOpts(),
        filesFlags: [],
        legacySourceFile: "src/a.ts",
      });
      expect(sel.legacySourcePresent).toBe(true);
      expect(sel.targetKeys).toEqual(["src/a.ts"]);
    } finally {
      process.chdir(cwd);
    }
  });

  test("--files-from stdin lists paths", async () => {
    const cwd = process.cwd();
    process.chdir(dir);
    const lines = spyOn(readInputs, "readPathLines").mockResolvedValue(["src/a.ts"]);
    try {
      const sel = await resolveFileSelection({
        ...baseOpts(),
        filesFrom: "-",
      });
      expect(lines).toHaveBeenCalledWith("-", "--files-from");
      expect(sel.mode).toBe("scoped");
      expect(sel.targetKeys).toEqual(["src/a.ts"]);
    } finally {
      lines.mockRestore();
      process.chdir(cwd);
    }
  });

  test("--files-from file with only blank lines triggers full scan", async () => {
    writeFileSync(join(dir, "blanks.txt"), "\n\n\r\n");
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const sel = await resolveFileSelection({
        ...baseOpts(),
        filesFrom: "blanks.txt",
      });
      expect(sel.mode).toBe("full");
    } finally {
      process.chdir(cwd);
    }
  });

  test("--files-from file and empty file triggers full scan", async () => {
    writeFileSync(join(dir, "list.txt"), "src/a.ts\n");
    writeFileSync(join(dir, "empty.txt"), "");
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const fromFile = await resolveFileSelection({
        ...baseOpts(),
        filesFrom: "list.txt",
      });
      expect(fromFile.mode).toBe("scoped");
      expect(fromFile.targetKeys).toEqual(["src/a.ts"]);
      const empty = await resolveFileSelection({
        ...baseOpts(),
        filesFrom: "empty.txt",
      });
      expect(empty.mode).toBe("full");
    } finally {
      process.chdir(cwd);
    }
  });
});
