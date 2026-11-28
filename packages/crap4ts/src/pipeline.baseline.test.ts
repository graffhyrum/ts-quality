import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { runPipeline } from "./pipeline";
import type { Config } from "./types";

const DIRTY = `export function dirtyValue(n: number) {
  let x = 0;
  if (n > 0) x++; if (n > 1) x++; if (n > 2) x++; if (n > 3) x++;
  if (n > 4) x++; if (n > 5) x++; if (n > 6) x++;
  return x;
}
`;

describe("runPipeline baseline update", () => {
  test("reports JSON for an empty scoped list", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "crap-empty-"));
    const prev = process.cwd();
    const logs: string[] = [];
    const log = console.log;
    console.log = (m?: unknown) => logs.push(String(m));
    try {
      await mkdir(path.join(dir, "coverage"), { recursive: true });
      await writeFile(path.join(dir, "coverage/coverage-final.json"), "{}");
      process.chdir(dir);
      const code = await runPipeline(
        pipelineConfig({
          reportJson: true,
          targeting: {
            filesFlags: ["src/missing.ts"],
            filesFromPaths: [],
            filesFromPresent: false,
            filesFromEmpty: false,
            legacyFiles: [],
            legacyPresent: false,
            renamesFrom: undefined,
            renamePairs: [],
          },
        }),
      );
      expect(code).toBe(0);
      expect(logs[0]).toContain('"files":[]');
    } finally {
      console.log = log;
      process.chdir(prev);
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("seeds baseline on a full scan", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "crap-seed-"));
    const prev = process.cwd();
    try {
      await seedProjectTree(dir, { "src/dirty-a.ts": 0 });
      process.chdir(dir);
      const code = await runPipeline(
        pipelineConfig({
          seed: true,
          reportJson: true,
          targeting: {
            filesFlags: [],
            filesFromPaths: [],
            filesFromPresent: false,
            filesFromEmpty: false,
            legacyFiles: [],
            legacyPresent: false,
            renamesFrom: undefined,
            renamePairs: [],
          },
        }),
      );
      expect(code).toBe(0);
      const baseline = await Bun.file(".quality/crap4ts-baseline.json").text();
      expect(baseline).toContain("src/dirty-a.ts");
    } finally {
      process.chdir(prev);
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("full scan with no discoverable sources exits 2", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "crap-nosrc-"));
    const prev = process.cwd();
    const errors: string[] = [];
    const err = console.error;
    console.error = (m?: unknown) => errors.push(String(m));
    try {
      await mkdir(path.join(dir, "coverage"), { recursive: true });
      await writeFile(path.join(dir, "coverage/coverage-final.json"), "{}");
      process.chdir(dir);
      const code = await runPipeline(pipelineConfig({ include: "nope/**/*.ts" }));
      expect(code).toBe(2);
      expect(errors.join("\n")).toContain("No source files found");
    } finally {
      console.error = err;
      process.chdir(prev);
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("shrinks baseline for a selected file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "crap-pipe-baseline-"));
    const prev = process.cwd();
    try {
      await mkdir(path.join(dir, "src"), { recursive: true });
      await mkdir(path.join(dir, ".quality"), { recursive: true });
      await mkdir(path.join(dir, "coverage"), { recursive: true });
      await writeFile(path.join(dir, "src/dirty-a.ts"), DIRTY);
      await writeFile(
        path.join(dir, ".quality/crap4ts-baseline.json"),
        `${JSON.stringify({ version: 1, files: { "src/dirty-a.ts": 3 } }, null, 2)}\n`,
      );
      const statementMap: Record<string, unknown> = {};
      const s: Record<string, number> = {};
      for (let i = 0; i < 12; i++) {
        statementMap[String(i)] = {
          start: { line: i + 1, column: 0 },
          end: { line: i + 1, column: 1 },
        };
        s[String(i)] = 0;
      }
      await writeFile(
        path.join(dir, "coverage/coverage-final.json"),
        JSON.stringify({ "src/dirty-a.ts": { path: "src/dirty-a.ts", statementMap, s } }),
      );
      process.chdir(dir);
      const code = await runPipeline(
        pipelineConfig({
          updateBaseline: true,
          targeting: {
            filesFlags: ["src/dirty-a.ts"],
            filesFromPaths: [],
            filesFromPresent: false,
            filesFromEmpty: false,
            legacyFiles: [],
            legacyPresent: false,
            renamesFrom: undefined,
            renamePairs: [],
          },
        }),
      );
      expect(code).toBe(0);
      const baseline = await Bun.file(".quality/crap4ts-baseline.json").text();
      expect(baseline).toMatch(/"src\/dirty-a\.ts": 1/);
    } finally {
      process.chdir(prev);
      await rm(dir, { recursive: true, force: true });
    }
  });
});

async function seedProjectTree(dir: string, hits: Record<string, number>): Promise<void> {
  await mkdir(path.join(dir, "src"), { recursive: true });
  await mkdir(path.join(dir, "coverage"), { recursive: true });
  await writeFile(path.join(dir, "src/dirty-a.ts"), DIRTY);
  const statementMap: Record<string, unknown> = {};
  const s: Record<string, number> = {};
  for (let i = 0; i < 12; i++) {
    statementMap[String(i)] = {
      start: { line: i + 1, column: 0 },
      end: { line: i + 1, column: 1 },
    };
    s[String(i)] = 0;
  }
  const cov: Record<string, unknown> = {};
  for (const [file, ratio] of Object.entries(hits)) {
    cov[file] = { path: file, statementMap, s: { ...s, "0": ratio > 0 ? 1 : 0 } };
  }
  await writeFile(path.join(dir, "coverage/coverage-final.json"), JSON.stringify(cov));
}

function pipelineConfig(overrides: Partial<Config>): Config {
  return {
    coveragePath: path.resolve("coverage/coverage-final.json"),
    format: "istanbul",
    threshold: 30,
    projectThreshold: 0,
    output: "table",
    outputFile: undefined,
    sort: "score",
    showAll: true,
    onlyCrappyDeprecated: false,
    include: "**/*.{ts,tsx,js,jsx}",
    exclude: "**/node_modules/**",
    files: [],
    init: false,
    skipGitignore: true,
    quiet: true,
    reportJson: false,
    baselinePath: ".quality/crap4ts-baseline.json",
    updateBaseline: false,
    seed: false,
    targeting: {
      filesFlags: [],
      filesFromPaths: [],
      filesFromPresent: false,
      filesFromEmpty: false,
      legacyFiles: [],
      legacyPresent: false,
      renamesFrom: undefined,
      renamePairs: [],
    },
    ...overrides,
  };
}
