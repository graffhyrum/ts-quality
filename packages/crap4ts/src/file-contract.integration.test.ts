import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { QualityReport } from "./file-contract/types";

const CLI = [process.execPath, path.join(import.meta.dirname, "index.ts")];

const CLEAN_SOURCE = `export function cleanValue() {
  return 1;
}
`;

const DIRTY_SOURCE = `export function dirtyValue(n: number) {
  let x = 0;
  if (n > 0) x++;
  if (n > 1) x++;
  if (n > 2) x++;
  if (n > 3) x++;
  if (n > 4) x++;
  if (n > 5) x++;
  if (n > 6) x++;
  return x;
}
`;

type Project = { dir: string };

let project: Project | null = null;

beforeEach(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "crap4ts-contract-"));
  await mkdir(path.join(dir, "src"), { recursive: true });
  await mkdir(path.join(dir, ".quality"), { recursive: true });
  project = { dir };
});

afterEach(async () => {
  if (project) await rm(project.dir, { recursive: true, force: true });
  project = null;
});

describe("file-list contract", () => {
  test("empty --files-from equals full scan", async () => {
    const { dir } = await seedFlaggedTree();
    const full = await runIn(dir, [
      ...CLI,
      "-c",
      "coverage/coverage-final.json",
      "--report",
      "json",
    ]);
    const empty = await runIn(
      dir,
      [...CLI, "-c", "coverage/coverage-final.json", "--report", "json", "--files-from", "-"],
      "",
    );
    expect(empty.exit).toBe(full.exit);
    expect(empty.report?.totals).toEqual(full.report?.totals);
  });

  test("scoped clean file does not report dirty siblings", async () => {
    const { dir } = await seedFlaggedTree();
    const result = await runIn(dir, [
      ...CLI,
      "-c",
      "coverage/coverage-final.json",
      "--report",
      "json",
      "--files",
      "src/clean.ts",
    ]);
    expect(result.exit).toBe(0);
    expect(result.report?.files.map((f: { path: string }) => f.path)).toEqual(["src/clean.ts"]);
    expect(result.report?.totals.failed).toBe(0);
  });

  test("scoped dirty file fails without the other dirty file", async () => {
    const { dir } = await seedFlaggedTree();
    const result = await runIn(dir, [
      ...CLI,
      "-c",
      "coverage/coverage-final.json",
      "--report",
      "json",
      "--files",
      "src/dirty-a.ts",
    ]);
    expect(result.exit).toBe(1);
    expect(result.report?.totals.failed).toBe(1);
    expect(result.report?.files.some((f: { path: string }) => f.path === "src/dirty-b.ts")).toBe(
      false,
    );
  });

  test("2000 stdin paths filters extensions and missing files", async () => {
    const { dir } = await seedManyFiles(1998);
    const lines = [
      ...Array.from({ length: 1998 }, (_, i) => `src/file-${i}.ts`),
      "src/missing.ts",
      "README.md",
    ];
    const scopedOne = await runIn(dir, [
      ...CLI,
      "-c",
      "coverage/coverage-final.json",
      "--report",
      "json",
      "--files",
      "src/file-0.ts",
    ]);
    const bulk = await runIn(
      dir,
      [...CLI, "-c", "coverage/coverage-final.json", "--report", "json", "--files-from", "-"],
      `${lines.join("\n")}\n`,
    );
    expect(bulk.report?.files.length).toBe(1998);
    expect(bulk.exit).toBe(scopedOne.exit);
  });

  test("missing-only list exits 0 with files []", async () => {
    const { dir } = await seedFlaggedTree();
    const result = await runIn(dir, [
      ...CLI,
      "-c",
      "coverage/coverage-final.json",
      "--report",
      "json",
      "--files",
      "src/missing.ts",
    ]);
    expect(result.exit).toBe(0);
    expect(result.report?.files).toEqual([]);
  });

  test("unlisted dirty file does not fail scoped run", async () => {
    const { dir } = await seedFlaggedTree();
    const result = await runIn(dir, [
      ...CLI,
      "-c",
      "coverage/coverage-final.json",
      "--report",
      "json",
      "--files",
      "src/clean.ts",
    ]);
    expect(result.exit).toBe(0);
  });

  test("shrink-only baseline respects stored counts", async () => {
    const { dir } = await seedFlaggedTree();
    await writeFile(
      path.join(dir, ".quality/crap4ts-baseline.json"),
      `${JSON.stringify({ version: 1, files: { "src/dirty-a.ts": 2 } }, null, 2)}\n`,
    );
    const stillTwo = await runIn(dir, [
      ...CLI,
      "-c",
      "coverage/coverage-final.json",
      "--report",
      "json",
      "--files",
      "src/dirty-a.ts",
    ]);
    expect(stillTwo.exit).toBe(0);
    expect(stillTwo.report?.files[0]?.violations).toBe(1);
    expect(stillTwo.report?.files[0]?.baseline).toBe(2);
    const tripleDirty = `${DIRTY_SOURCE}\n${DIRTY_SOURCE.replaceAll("dirtyValue", "dirtyValueB")}\n${DIRTY_SOURCE.replaceAll("dirtyValue", "dirtyValueC")}\n`;
    await writeFile(path.join(dir, "src/dirty-a.ts"), tripleDirty);
    await writeCoverage(dir, ["src/dirty-a.ts"], { "src/dirty-a.ts": 0 });
    const over = await runIn(dir, [
      ...CLI,
      "-c",
      "coverage/coverage-final.json",
      "--report",
      "json",
      "--files",
      "src/dirty-a.ts",
    ]);
    expect(over.exit).toBe(1);
    expect(over.report?.files[0]?.violations).toBeGreaterThan(2);
    const baselineText = await Bun.file(path.join(dir, ".quality/crap4ts-baseline.json")).text();
    expect(baselineText).toContain('"src/dirty-a.ts": 2');
  });

  test("rename carry via --renames-from", async () => {
    const { dir } = await seedFlaggedTree();
    await writeFile(
      path.join(dir, ".quality/crap4ts-baseline.json"),
      `${JSON.stringify({ version: 1, files: { "old.ts": 2 } }, null, 2)}\n`,
    );
    await writeFile(path.join(dir, "new.ts"), DIRTY_SOURCE);
    await writeCoverage(dir, ["new.ts"], { "new.ts": 0 });
    const mapPath = path.join(dir, "renames.txt");
    await writeFile(mapPath, "old.ts\tnew.ts\n");
    const before = await runIn(dir, [
      ...CLI,
      "-c",
      "coverage/coverage-final.json",
      "--report",
      "json",
      "--files",
      "new.ts",
      "--renames-from",
      mapPath,
    ]);
    expect(before.exit).toBe(0);
    expect(before.report?.files[0]?.path).toBe("new.ts");
    expect(before.report?.files[0]?.baseline).toBe(2);
    let onDisk = await Bun.file(path.join(dir, ".quality/crap4ts-baseline.json")).text();
    expect(onDisk).toContain("old.ts");
    await runIn(dir, [
      ...CLI,
      "-c",
      "coverage/coverage-final.json",
      "--files",
      "new.ts",
      "--renames-from",
      mapPath,
      "--update-baseline",
    ]);
    onDisk = await Bun.file(path.join(dir, ".quality/crap4ts-baseline.json")).text();
    expect(onDisk).toContain("new.ts");
    expect(onDisk).not.toContain("old.ts");
  });

  test("--update-baseline shrinks on-disk count", async () => {
    const { dir } = await seedFlaggedTree();
    await writeFile(
      path.join(dir, ".quality/crap4ts-baseline.json"),
      `${JSON.stringify({ version: 1, files: { "src/dirty-a.ts": 2 } }, null, 2)}\n`,
    );
    const oneViolationSource = `export function dirtyValue() {
  let x = 0;
  if (x > 0) x++;
  if (x > 1) x++;
  if (x > 2) x++;
  if (x > 3) x++;
  return x;
}
`;
    await writeFile(path.join(dir, "src/dirty-a.ts"), oneViolationSource);
    await writeCoverage(dir, ["src/dirty-a.ts"], { "src/dirty-a.ts": 0 });
    const check = await runIn(dir, [
      ...CLI,
      "-c",
      "coverage/coverage-final.json",
      "--report",
      "json",
      "--files",
      "src/dirty-a.ts",
      "--update-baseline",
    ]);
    expect(check.exit).toBe(0);
    const onDisk = await Bun.file(path.join(dir, ".quality/crap4ts-baseline.json")).text();
    expect(onDisk).toMatch(/"src\/dirty-a\.ts": 1/);
  });

  test("baseline present ignores project-threshold for exit", async () => {
    const { dir } = await seedFlaggedTree();
    await writeFile(
      path.join(dir, ".quality/crap4ts-baseline.json"),
      `${JSON.stringify({ version: 1, files: { "src/dirty-a.ts": 9, "src/dirty-b.ts": 9 } }, null, 2)}\n`,
    );
    const result = await runIn(dir, [
      ...CLI,
      "-c",
      "coverage/coverage-final.json",
      "--project-threshold",
      "0",
      "--report",
      "json",
    ]);
    expect(result.exit).toBe(0);
  });
});

async function seedFlaggedTree(): Promise<Project> {
  const dir = project!.dir;
  await writeFile(path.join(dir, "src/clean.ts"), CLEAN_SOURCE);
  await writeFile(path.join(dir, "src/dirty-a.ts"), DIRTY_SOURCE);
  await writeFile(path.join(dir, "src/dirty-b.ts"), DIRTY_SOURCE);
  await writeCoverage(dir, ["src/clean.ts", "src/dirty-a.ts", "src/dirty-b.ts"], {
    "src/clean.ts": 1,
    "src/dirty-a.ts": 0,
    "src/dirty-b.ts": 0,
  });
  return { dir };
}

async function seedManyFiles(count: number): Promise<Project> {
  const dir = project!.dir;
  const files: string[] = [];
  const hits: Record<string, number> = {};
  for (let i = 0; i < count; i++) {
    const rel = `src/file-${i}.ts`;
    files.push(rel);
    await writeFile(path.join(dir, rel), CLEAN_SOURCE);
    hits[rel] = 1;
  }
  await writeCoverage(dir, files, hits);
  return { dir };
}

async function writeCoverage(
  dir: string,
  files: string[],
  hitRatio: Record<string, number>,
): Promise<void> {
  const cov: Record<string, unknown> = {};
  for (const rel of files) {
    const abs = path.join(dir, rel);
    const lines = (await Bun.file(abs).text()).split("\n").length;
    const statementMap: Record<
      string,
      { start: { line: number; column: number }; end: { line: number; column: number } }
    > = {};
    const s: Record<string, number> = {};
    for (let line = 1; line <= lines; line++) {
      const id = String(line - 1);
      statementMap[id] = {
        start: { line, column: 0 },
        end: { line, column: 1 },
      };
      s[id] = (hitRatio[rel] ?? 0) > 0 ? 1 : 0;
    }
    cov[rel] = {
      path: rel,
      statementMap,
      s,
    };
  }
  await mkdir(path.join(dir, "coverage"), { recursive: true });
  await writeFile(
    path.join(dir, "coverage/coverage-final.json"),
    `${JSON.stringify(cov, null, 2)}\n`,
  );
}

type RunResult = { exit: number; stdout: string; stderr: string; report?: QualityReport };

async function runIn(dir: string, argv: string[], stdin: string = ""): Promise<RunResult> {
  const proc = Bun.spawn(argv, {
    cwd: dir,
    stdin: new Blob([stdin]),
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const report = parseReport(stdout);
  return { exit, stdout, stderr, report };
}

function parseReport(stdout: string): QualityReport | undefined {
  const line = stdout
    .split("\n")
    .find((l) => l.startsWith("{") && l.includes("ts-quality/quality-report"));
  if (!line) return undefined;
  return JSON.parse(line) as QualityReport;
}
