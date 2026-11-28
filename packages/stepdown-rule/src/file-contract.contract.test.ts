import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CLI = path.join(import.meta.dir, "cli.ts");

const dirtySource = `function hashPassword(password: string): string {
	return \`hashed_\${password}\`;
}
function validateEmail(email: string): boolean {
	return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
}
function createUser(email: string, password: string) {
	const hashed = hashPassword(password);
	return { email, password: hashed };
}
function _main() {
	const user = createUser("a@b.com", "x");
	return validateEmail(user.email);
}
const cleanData = (data: string): string => data.trim();
const _processData = (data: string) => cleanData(data).toUpperCase();
`;

const cleanSource = `function _main() {
	const user = createUser("a@b.com", "x");
	return validateEmail(user.email);
}
function createUser(email: string, password: string) {
	return { email, password: hashPassword(password) };
}
function validateEmail(email: string): boolean {
	return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
}
function hashPassword(password: string): string {
	return \`hashed_\${password}\`;
}
const _processData = (data: string) => cleanData(data).toUpperCase();
const cleanData = (data: string): string => data.trim();
`;

type RunResult = { exitCode: number; stdout: string; stderr: string };

async function runStepdown(cwd: string, args: string[], stdin?: string): Promise<RunResult> {
  const proc = Bun.spawn({
    cmd: ["bun", "run", CLI, ...args],
    cwd,
    env: { ...process.env, NO_COLOR: "1" },
    stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

async function initProject(root: string): Promise<void> {
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "clean.ts"), cleanSource);
  await writeFile(path.join(root, "src", "dirty-a.ts"), dirtySource);
  await writeFile(path.join(root, "src", "dirty-b.ts"), dirtySource);
}

function parseReport(stdout: string) {
  return JSON.parse(stdout) as {
    schema: string;
    tool: string;
    exitCode: number;
    ok: boolean;
    files: Array<{ path: string; violations: number; baseline: number; status: string }>;
    totals: { files: number; violations: number; failed: number };
  };
}

describe("file-scoped contract", () => {
  let root: string;
  const previousCwd = process.cwd();

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "sd-contract-"));
    await initProject(root);
  });

  afterEach(async () => {
    process.chdir(previousCwd);
    await rm(root, { recursive: true, force: true });
  });

  it("full scan matches itself and empty files-from stdin", async () => {
    const full = await runStepdown(root, ["analyze", "--report", "json"]);
    const emptyList = await runStepdown(
      root,
      ["analyze", "--report", "json", "--files-from", "-"],
      "",
    );
    const fullReport = parseReport(full.stdout);
    const emptyReport = parseReport(emptyList.stdout);
    expect(emptyList.exitCode).toBe(full.exitCode);
    expect(emptyReport.exitCode).toBe(fullReport.exitCode);
    expect(emptyReport.files.map((f) => f.path).sort()).toEqual(
      fullReport.files.map((f) => f.path).sort(),
    );
  });

  it("scoped --files only reports the selected file", async () => {
    const dirtyOne = await runStepdown(root, [
      "analyze",
      "--report",
      "json",
      "--files",
      "src/dirty-a.ts",
    ]);
    const cleanOnly = await runStepdown(root, [
      "analyze",
      "--report",
      "json",
      "--files",
      "src/clean.ts",
    ]);
    const dirtyReport = parseReport(dirtyOne.stdout);
    const cleanReport = parseReport(cleanOnly.stdout);
    expect(dirtyOne.exitCode).toBe(1);
    expect(dirtyReport.totals.failed).toBe(1);
    expect(dirtyReport.files.some((f) => f.path === "src/dirty-b.ts")).toBe(false);
    expect(cleanOnly.exitCode).toBe(0);
    expect(cleanReport.files.some((f) => f.path.includes("dirty"))).toBe(false);
  });

  it("accepts a 2000-line files-from list on stdin", async () => {
    const lines: string[] = [];
    for (let i = 0; i < 1998; i++) lines.push("src/clean.ts");
    lines.push("src/does-not-exist.ts");
    lines.push("README.md");
    const stdin = `${lines.join("\n")}\n`;
    const many = await runStepdown(
      root,
      ["analyze", "--report", "json", "--files-from", "-"],
      stdin,
    );
    const single = await runStepdown(root, [
      "analyze",
      "--report",
      "json",
      "--files",
      "src/clean.ts",
    ]);
    const manyReport = parseReport(many.stdout);
    expect(many.exitCode).toBe(single.exitCode);
    expect(manyReport.files).toHaveLength(1);
    expect(manyReport.files[0]?.path).toBe("src/clean.ts");
  });

  it("missing-only scoped list exits 0 with files []", async () => {
    const missing = await runStepdown(root, [
      "analyze",
      "--report",
      "json",
      "--files",
      "src/does-not-exist.ts",
    ]);
    const report = parseReport(missing.stdout);
    expect(missing.exitCode).toBe(0);
    expect(report.files).toEqual([]);
  });

  it("legacy pattern with zero matches is exit 2 with no JSON under --report json", async () => {
    const run = await runStepdown(root, ["analyze", "--report", "json", "src/no-match-*.ts"]);
    expect(run.exitCode).toBe(2);
    expect(run.stdout).toBe("");
  });

  it("legacy pattern with zero matches is exit 3 in default mode", async () => {
    const run = await runStepdown(root, ["analyze", "src/no-match-*.ts"]);
    expect(run.exitCode).toBe(3);
  });

  it("unlisted file violations do not fail a scoped run", async () => {
    await writeFile(path.join(root, "src", "hidden-dirty.ts"), dirtySource);
    const baselinePath = path.join(root, ".quality", "stepdown-rule-baseline.json");
    await mkdir(path.dirname(baselinePath), { recursive: true });
    await writeFile(baselinePath, `{"version":1,"files":{"src/clean.ts":0}}\n`);
    const scoped = await runStepdown(root, [
      "analyze",
      "--report",
      "json",
      "--files",
      "src/clean.ts",
      "--baseline",
      baselinePath,
    ]);
    expect(scoped.exitCode).toBe(0);
  });

  it("doctor rejects contract flags with exit 2", async () => {
    const doctor = await runStepdown(root, ["doctor", "--files", "src/clean.ts"]);
    expect(doctor.exitCode).toBe(2);
  });

  it("rejects --report json together with --json", async () => {
    const both = await runStepdown(root, ["analyze", "--report", "json", "--json"]);
    expect(both.exitCode).toBe(2);
    expect(both.stdout).toBe("");
  });

  it("rejects --report json together with --format json", async () => {
    const both = await runStepdown(root, ["analyze", "--report", "json", "--format", "json"]);
    expect(both.exitCode).toBe(2);
    expect(both.stdout).toBe("");
  });

  describe("shrink-only baseline", () => {
    let baselinePath: string;

    beforeEach(async () => {
      baselinePath = path.join(root, ".quality", "stepdown-rule-baseline.json");
      await mkdir(path.dirname(baselinePath), { recursive: true });
      await writeFile(
        baselinePath,
        `${JSON.stringify({ version: 1, files: { "src/dirty-a.ts": 4, "src/dirty-b.ts": 4 } }, null, 2)}\n`,
      );
    });

    it("at baseline count passes without updating the file", async () => {
      const run = await runStepdown(root, [
        "analyze",
        "--report",
        "json",
        "--files",
        "src/dirty-a.ts",
        "--baseline",
        baselinePath,
      ]);
      const report = parseReport(run.stdout);
      expect(run.exitCode).toBe(0);
      expect(report.files[0]?.status).toBe("ok");
      expect(report.files[0]?.baseline).toBe(4);
    });

    it("above baseline fails and does not write on --update-baseline", async () => {
      await writeFile(
        path.join(root, "src", "dirty-a.ts"),
        `${dirtySource}\nfunction extraCallee() { return 1; }\nfunction extraCaller() { return extraCallee(); }\n`,
      );
      const before = await readFile(baselinePath, "utf8");
      const run = await runStepdown(root, [
        "analyze",
        "--report",
        "json",
        "--files",
        "src/dirty-a.ts",
        "--baseline",
        baselinePath,
        "--update-baseline",
      ]);
      expect(run.exitCode).toBe(1);
      expect(parseReport(run.stdout).files[0]?.status).toBe("fail");
      expect(await readFile(baselinePath, "utf8")).toBe(before);
    });

    it("below baseline passes without update and shrinks with --update-baseline", async () => {
      await writeFile(path.join(root, "src", "dirty-a.ts"), cleanSource);
      const without = await runStepdown(root, [
        "analyze",
        "--report",
        "json",
        "--files",
        "src/dirty-a.ts",
        "--baseline",
        baselinePath,
      ]);
      expect(without.exitCode).toBe(0);
      expect(JSON.parse(await readFile(baselinePath, "utf8")).files["src/dirty-a.ts"]).toBe(4);

      const withUpdate = await runStepdown(root, [
        "analyze",
        "--report",
        "json",
        "--files",
        "src/dirty-a.ts",
        "--baseline",
        baselinePath,
        "--update-baseline",
      ]);
      expect(withUpdate.exitCode).toBe(0);
      const parsed = JSON.parse(await readFile(baselinePath, "utf8")) as {
        files: Record<string, number>;
      };
      expect(parsed.files["src/dirty-a.ts"]).toBeUndefined();
    });

    it("new violating file fails and is not added on update", async () => {
      await writeFile(path.join(root, "src", "c.ts"), dirtySource);
      const before = await readFile(baselinePath, "utf8");
      const run = await runStepdown(root, [
        "analyze",
        "--report",
        "json",
        "--files",
        "src/c.ts",
        "--baseline",
        baselinePath,
        "--update-baseline",
      ]);
      expect(run.exitCode).toBe(1);
      expect(await readFile(baselinePath, "utf8")).toBe(before);
    });

    it("new clean file passes with no new key", async () => {
      await writeFile(path.join(root, "src", "c.ts"), cleanSource);
      const run = await runStepdown(root, [
        "analyze",
        "--report",
        "json",
        "--files",
        "src/c.ts",
        "--baseline",
        baselinePath,
      ]);
      expect(run.exitCode).toBe(0);
      expect(JSON.parse(await readFile(baselinePath, "utf8")).files["src/c.ts"]).toBeUndefined();
    });

    it("carries rename in memory and on --update-baseline", async () => {
      await writeFile(baselinePath, `{"version":1,"files":{"old.ts":4}}\n`);
      await writeFile(path.join(root, "src", "new.ts"), dirtySource);
      const renameMap = path.join(root, "renames.txt");
      await writeFile(renameMap, `old.ts\tsrc/new.ts\n`);

      const check = await runStepdown(root, [
        "analyze",
        "--report",
        "json",
        "--files",
        "src/new.ts",
        "--renames-from",
        renameMap,
        "--baseline",
        baselinePath,
      ]);
      expect(check.exitCode).toBe(0);
      expect(parseReport(check.stdout).files[0]?.baseline).toBe(4);
      expect(await readFile(baselinePath, "utf8")).toContain("old.ts");

      const update = await runStepdown(root, [
        "analyze",
        "--report",
        "json",
        "--files",
        "src/new.ts",
        "--renames-from",
        renameMap,
        "--baseline",
        baselinePath,
        "--update-baseline",
      ]);
      expect(update.exitCode).toBe(0);
      const text = await readFile(baselinePath, "utf8");
      expect(text).toContain("src/new.ts");
      expect(text).not.toContain("old.ts");
    });

    it("rename with too many violations fails without writing", async () => {
      await writeFile(baselinePath, `{"version":1,"files":{"old.ts":4}}\n`);
      await writeFile(
        path.join(root, "src", "new.ts"),
        `${dirtySource}\nfunction extraCallee() { return 1; }\nfunction extraCaller() { return extraCallee(); }\n`,
      );
      const renameMap = path.join(root, "renames.txt");
      await writeFile(renameMap, `old.ts\tsrc/new.ts\n`);
      const before = await readFile(baselinePath, "utf8");
      const run = await runStepdown(root, [
        "analyze",
        "--report",
        "json",
        "--files",
        "src/new.ts",
        "--renames-from",
        renameMap,
        "--baseline",
        baselinePath,
        "--update-baseline",
      ]);
      expect(run.exitCode).toBe(1);
      expect(await readFile(baselinePath, "utf8")).toBe(before);
    });

    it("partial --update-baseline keeps unselected keys", async () => {
      await writeFile(path.join(root, "src", "dirty-a.ts"), cleanSource);
      await runStepdown(root, [
        "analyze",
        "--report",
        "json",
        "--files",
        "src/dirty-a.ts",
        "--baseline",
        baselinePath,
        "--update-baseline",
      ]);
      const parsed = JSON.parse(await readFile(baselinePath, "utf8")) as {
        files: Record<string, number>;
      };
      expect(parsed.files["src/dirty-b.ts"]).toBe(4);
      expect(parsed.files["src/dirty-a.ts"]).toBeUndefined();
    });

    it("full --update-baseline drops keys for deleted files", async () => {
      await rm(path.join(root, "src", "dirty-b.ts"));
      const run = await runStepdown(root, [
        "analyze",
        "--report",
        "json",
        "--baseline",
        baselinePath,
        "--update-baseline",
      ]);
      expect(run.exitCode).toBe(0);
      const parsed = JSON.parse(await readFile(baselinePath, "utf8")) as {
        files: Record<string, number>;
      };
      expect(parsed.files["src/dirty-b.ts"]).toBeUndefined();
    });

    it("--seed exits 2 when the baseline exists", async () => {
      const run = await runStepdown(root, ["analyze", "--seed"]);
      expect(run.exitCode).toBe(2);
    });

    it("--seed with --files exits 2", async () => {
      await rm(baselinePath);
      const run = await runStepdown(root, ["analyze", "--seed", "--files", "src/clean.ts"]);
      expect(run.exitCode).toBe(2);
    });

    it("--update-baseline without a baseline file exits 2", async () => {
      await rm(baselinePath);
      const run = await runStepdown(root, ["analyze", "--report", "json", "--update-baseline"]);
      expect(run.exitCode).toBe(2);
      expect(run.stdout).toBe("");
    });
  });

  it("analyze --seed without --report json exits 0 when violations exist", async () => {
    const baselinePath = path.join(root, ".quality", "stepdown-rule-baseline.json");
    const seed = await runStepdown(root, ["analyze", "--seed", "--baseline", baselinePath]);
    expect(seed.exitCode).toBe(0);
    await expect(readFile(baselinePath, "utf8")).resolves.toContain("dirty-a");
  });

  it("agents analyze --report json is not rejected by agents envelope", async () => {
    const run = await runStepdown(root, [
      "agents",
      "analyze",
      "--report",
      "json",
      "--files",
      "src/clean.ts",
    ]);
    expect(run.exitCode).toBe(0);
    const report = parseReport(run.stdout);
    expect(report.schema).toBe("ts-quality/quality-report/v1");
  });

  it("invalid --report value exits 2", async () => {
    const run = await runStepdown(root, ["analyze", "--report", "xml", "--files", "src/clean.ts"]);
    expect(run.exitCode).toBe(2);
    expect(run.stdout).toBe("");
  });

  it("fix counts violations after fix for --report json", async () => {
    const before = await runStepdown(root, [
      "analyze",
      "--report",
      "json",
      "--files",
      "src/dirty-a.ts",
    ]);
    expect(before.exitCode).toBe(1);
    expect(parseReport(before.stdout).files[0]?.violations).toBeGreaterThan(0);

    const fixed = await runStepdown(root, ["fix", "--report", "json", "--files", "src/dirty-a.ts"]);
    const report = parseReport(fixed.stdout);
    expect(fixed.exitCode).toBe(0);
    expect(report.files[0]?.violations).toBe(0);
  });
});
