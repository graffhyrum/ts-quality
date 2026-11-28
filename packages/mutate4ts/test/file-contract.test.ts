import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const projectRoot = join(import.meta.dir, "..");
const cli = join(projectRoot, "src/index.ts");

const PASS_TEST = "bun -e process.exit(0)";

function run(args: readonly string[], cwd: string, stdin?: string) {
  const proc = Bun.spawnSync(["bun", "run", cli, ...args], {
    cwd,
    stdin: stdin ? Buffer.from(stdin, "utf8") : undefined,
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

function parseReport(stdout: string) {
  return JSON.parse(stdout.trim()) as {
    exitCode: number;
    ok: boolean;
    files: { path: string; violations: number; baseline: number; status: string }[];
    totals: { files: number; violations: number; failed: number };
    tool: string;
    schema: string;
  };
}

function writeProject(dir: string, files: Record<string, string>): void {
  writeFileSync(join(dir, "package.json"), '{ "name": "contract-fixture" }\n');
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
}

/** Two boolean literals on lines 2 and 5 for --lines 2,5. */
const DIRTY_TWO = [
  "export function a() {",
  "  return true;",
  "}",
  "export function b() {",
  "  return false;",
  "}",
].join("\n");

const CLEAN = "export type T = { readonly n: number };\n";

function baselinePath(dir: string): string {
  return join(dir, ".quality/mutate4ts-baseline.json");
}

describe("file-list contract", () => {
  describe("empty list and full scan", () => {
    let dir: string;
    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "m4t-contract-full-"));
      writeProject(dir, {
        "src/dirty-a.ts": DIRTY_TWO,
        "src/dirty-b.ts": "export function c() { return 1 > 0; }\n",
        "src/clean.ts": CLEAN,
        "src/clean.test.ts": 'import "./clean.ts";\n',
        "README.md": "# x\n",
      });
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    test("single dirty file matches legacy one-file run", () => {
      const legacy = run(
        ["--report", "json", "--test-command", PASS_TEST, "--lines", "2", "src/dirty-a.ts"],
        dir,
      );
      const scoped = run(
        [
          "--report",
          "json",
          "--test-command",
          PASS_TEST,
          "--lines",
          "2",
          "--files",
          "src/dirty-a.ts",
        ],
        dir,
      );
      expect(scoped.exitCode).toBe(legacy.exitCode);
      expect(parseReport(scoped.stdout)).toEqual(parseReport(legacy.stdout));
    });

    test("empty files-from stdin performs a full scan", () => {
      const full = run(["--report", "json", "--test-command", PASS_TEST, "--lines", "2"], dir);
      const fromStdin = run(
        ["--report", "json", "--test-command", PASS_TEST, "--lines", "2", "--files-from", "-"],
        dir,
        "",
      );
      expect(fromStdin.exitCode).toBe(full.exitCode);
      expect(parseReport(fromStdin.stdout).totals.files).toBe(
        parseReport(full.stdout).totals.files,
      );
    });

    test("scoped clean file only", () => {
      const result = run(
        ["--report", "json", "--test-command", PASS_TEST, "--files", "src/clean.ts"],
        dir,
      );
      expect(result.exitCode).toBe(0);
      const doc = parseReport(result.stdout);
      expect(doc.files.map((f) => f.path)).toEqual(["src/clean.ts"]);
      expect(doc.files.some((f) => f.path.includes("dirty"))).toBe(false);
    });

    test("scoped one dirty file", () => {
      const result = run(
        [
          "--report",
          "json",
          "--test-command",
          PASS_TEST,
          "--lines",
          "2",
          "--files",
          "src/dirty-a.ts",
        ],
        dir,
      );
      expect(result.exitCode).toBe(1);
      const doc = parseReport(result.stdout);
      expect(doc.totals.failed).toBe(1);
      expect(doc.files.some((f) => f.path === "src/dirty-b.ts")).toBe(false);
    });

    test("no-argument run reports discovery set only", () => {
      const plainDir = mkdtempSync(join(tmpdir(), "m4t-discovery-"));
      writeProject(plainDir, {
        "src/clean.ts": CLEAN,
        "src/dirty-a.ts": CLEAN,
        "src/dirty-b.ts": CLEAN,
        "src/clean.test.ts": 'import "./clean.ts";\n',
        "README.md": "# x\n",
      });
      const result = run(["--report", "json", "--test-command", PASS_TEST], plainDir);
      const doc = parseReport(result.stdout);
      const paths = doc.files.map((f) => f.path).sort();
      expect(paths).toEqual(["src/clean.ts", "src/dirty-a.ts", "src/dirty-b.ts"]);
      expect(paths).not.toContain("src/clean.test.ts");
      expect(paths).not.toContain("README.md");
      rmSync(plainDir, { recursive: true, force: true });
    });
  });

  describe("files-from with many paths", () => {
    let dir: string;
    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "m4t-contract-2k-"));
      const files: Record<string, string> = { "README.md": "#\n" };
      files["src/f0.ts"] = DIRTY_TWO;
      for (let i = 1; i < 1998; i++) {
        files[`src/f${i}.ts`] = CLEAN;
      }
      writeProject(dir, files);
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    test("accepts 2000 stdin paths", async () => {
      const lines = [
        ...Array.from({ length: 1998 }, (_, i) => `src/f${i}.ts`),
        "src/missing.ts",
        "README.md",
      ];
      const single = run(
        ["--report", "json", "--test-command", PASS_TEST, "--files", "src/f0.ts", "--lines", "2"],
        dir,
      );
      const many = run(
        ["--report", "json", "--test-command", PASS_TEST, "--lines", "2", "--files-from", "-"],
        dir,
        `${lines.join("\n")}\n`,
      );
      const doc = parseReport(many.stdout);
      expect(doc.files.length).toBe(1998);
      expect(doc.files.some((f) => f.path === "README.md")).toBe(false);
      expect(doc.files.some((f) => f.path === "src/missing.ts")).toBe(false);
      expect(many.exitCode).toBe(single.exitCode);
    });

    test("missing-only list exits 0 with empty files", () => {
      const result = run(["--report", "json", "--files", "src/missing.ts"], dir);
      expect(result.exitCode).toBe(0);
      expect(parseReport(result.stdout).files).toEqual([]);
    });
  });

  describe("shrink-only baseline", () => {
    let dir: string;
    const base = () => ({
      version: 1,
      files: { "src/a.ts": 2, "src/b.ts": 0 },
    });

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "m4t-contract-shrink-"));
      writeProject(dir, {
        "src/a.ts": DIRTY_TWO,
        "src/b.ts": CLEAN,
        "src/c.ts": "export function z() { return true; }\n",
      });
      mkdirSync(join(dir, ".quality"), { recursive: true });
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    function writeBase(doc: { version: number; files: Record<string, number> }) {
      writeFileSync(baselinePath(dir), `${JSON.stringify(doc, null, 2)}\n`);
    }

    test("a.ts still at 2 violations", () => {
      writeBase(base());
      const result = run(
        ["--report", "json", "--test-command", PASS_TEST, "--lines", "2", "src/a.ts"],
        dir,
      );
      expect(result.exitCode).toBe(0);
      const row = parseReport(result.stdout).files[0]!;
      expect(row).toMatchObject({ path: "src/a.ts", violations: 2, baseline: 2, status: "ok" });
      expect(readFileSync(baselinePath(dir), "utf8")).toContain('"src/a.ts": 2');
    });

    test("a.ts at 3 violations fails and does not update", () => {
      writeBase(base());
      const before = readFileSync(baselinePath(dir), "utf8");
      const result = run(
        [
          "--report",
          "json",
          "--test-command",
          PASS_TEST,
          "--lines",
          "2,5",
          "--update-baseline",
          "src/a.ts",
        ],
        dir,
      );
      expect(result.exitCode).toBe(1);
      expect(parseReport(result.stdout).files[0]!.status).toBe("fail");
      expect(readFileSync(baselinePath(dir), "utf8")).toBe(before);
    });

    test("shrink stored count with --update-baseline", () => {
      writeBase({ version: 1, files: { "src/a.ts": 4 } });
      writeFileSync(join(dir, "src/a.ts"), "export function a() {\n  return true;\n}\n");
      const result = run(
        [
          "--report",
          "json",
          "--test-command",
          PASS_TEST,
          "--lines",
          "2",
          "--update-baseline",
          "src/a.ts",
        ],
        dir,
      );
      expect(result.exitCode).toBe(0);
      expect(parseReport(result.stdout).files[0]!.violations).toBe(2);
      expect(readFileSync(baselinePath(dir), "utf8")).toContain('"src/a.ts": 2');
    });

    test("new file with violation fails without key", () => {
      writeBase(base());
      const result = run(
        ["--report", "json", "--test-command", PASS_TEST, "--lines", "1", "--files", "src/c.ts"],
        dir,
      );
      expect(result.exitCode).toBe(1);
    });

    test("rename carry without update-baseline", () => {
      writeBase({ version: 1, files: { "old.ts": 2 } });
      writeFileSync(join(dir, "new.ts"), DIRTY_TWO);
      const pairs = join(dir, "renames.txt");
      writeFileSync(pairs, "old.ts\tnew.ts\n");
      const result = run(
        [
          "--report",
          "json",
          "--test-command",
          PASS_TEST,
          "--lines",
          "2",
          "--renames-from",
          pairs,
          "--files",
          "new.ts",
        ],
        dir,
      );
      expect(result.exitCode).toBe(0);
      const row = parseReport(result.stdout).files[0]!;
      expect(row.path).toBe("new.ts");
      expect(row.baseline).toBe(2);
      expect(readFileSync(baselinePath(dir), "utf8")).toContain("old.ts");
    });

    test("--seed and --update-baseline usage errors", () => {
      writeBase(base());
      expect(run(["--seed", "--files", "src/a.ts"], dir).exitCode).toBe(2);
      rmSync(baselinePath(dir));
      expect(
        run(["--report", "json", "--update-baseline", "--files", "src/a.ts"], dir).exitCode,
      ).toBe(2);
    });
  });

  describe("unlisted survivor does not fail scoped run", () => {
    let dir: string;
    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "m4t-contract-scope-"));
      writeProject(dir, {
        "src/dirty.ts": DIRTY_TWO,
        "src/clean.ts": CLEAN,
      });
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    test("only selected file affects exit", () => {
      const result = run(
        ["--report", "json", "--test-command", PASS_TEST, "--files", "src/clean.ts"],
        dir,
      );
      expect(result.exitCode).toBe(0);
      expect(parseReport(result.stdout).files).toEqual([
        { path: "src/clean.ts", violations: 0, baseline: 0, status: "ok" },
      ]);
    });
  });

  test("--scan rejects --report json", () => {
    const dir = mkdtempSync(join(tmpdir(), "m4t-scan-json-"));
    writeProject(dir, { "src/a.ts": CLEAN });
    const result = run(["--scan", "--report", "json", "src/a.ts"], dir);
    rmSync(dir, { recursive: true, force: true });
    expect(result.exitCode).toBe(2);
  });

  test("--files-from - reads stdin paths", () => {
    const dir = mkdtempSync(join(tmpdir(), "m4t-stdin-"));
    writeProject(dir, { "src/a.ts": CLEAN });
    const result = run(
      ["--report", "json", "--test-command", PASS_TEST, "--files-from", "-"],
      dir,
      "src/a.ts\n",
    );
    rmSync(dir, { recursive: true, force: true });
    expect(result.exitCode).toBe(0);
    expect(parseReport(result.stdout).files[0]?.path).toBe("src/a.ts");
  });
});
