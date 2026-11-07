import { rmSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import path from "path";
import type { FileSystem } from "./detect/types";
import { runPipeline } from "./pipeline";
import { CrapError, type Config } from "./types";

function makeFs(files: Record<string, string>): FileSystem {
  return {
    exists: async (p) => Object.hasOwn(files, p),
    readText: async (p) => files[p] ?? null,
    realPath: async (p) => p,
  };
}

function config(overrides: Partial<Config> = {}): Config {
  return {
    coveragePath: path.resolve("cov.json"),
    format: "istanbul",
    threshold: 30,
    projectThreshold: 5,
    output: "json",
    outputFile: undefined,
    sort: "score",
    showAll: true,
    onlyCrappyDeprecated: false,
    include: "**/*.ts",
    exclude: "**/node_modules/**",
    files: ["src/a.ts"],
    init: false,
    skipGitignore: true,
    quiet: false,
    ...overrides,
  };
}

describe("runPipeline filesystem", () => {
  test("reads explicit sources and coverage from the injected filesystem", async () => {
    const sourcePath = path.resolve("src/a.ts");
    const covPath = path.resolve("cov.json");
    const logs: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      const code = await runPipeline(
        config(),
        makeFs({
          [sourcePath]: "function fromFake() { return 1; }\n",
          [covPath]: "{}",
        }),
      );
      expect(code).toBe(0);
      expect(logs.join("\n")).toContain("fromFake");
    } finally {
      console.log = log;
    }
  });

  test("missing coverage throws CrapError", async () => {
    const sourcePath = path.resolve("src/a.ts");
    await expect(
      runPipeline(config(), makeFs({ [sourcePath]: "function fromFake() { return 1; }\n" })),
    ).rejects.toThrow(CrapError);
  });

  test("a file present on disk is ignored when the injected filesystem says it is absent", async () => {
    const code = await runPipeline(config({ files: ["src/pipeline.ts"] }), makeFs({}));
    expect(code).toBe(2);
  });

  test("--only-crappy prints the deprecation warning", async () => {
    const sourcePath = path.resolve("src/a.ts");
    const covPath = path.resolve("cov.json");
    const warnings: string[] = [];
    const warn = console.warn;
    console.warn = (message?: unknown) => {
      warnings.push(String(message));
    };
    try {
      const code = await runPipeline(
        config({ onlyCrappyDeprecated: true, output: "json" }),
        makeFs({
          [sourcePath]: "function fromFake() { return 1; }\n",
          [covPath]: "{}",
        }),
      );
      expect(code).toBe(0);
      expect(warnings[0]).toBe(
        "--only-crappy is deprecated (now the default). Use --all to show all functions.",
      );
    } finally {
      console.warn = warn;
    }
  });

  test("an empty file list scans the include glob", async () => {
    const sourcePath = path.resolve("src/detect/fs.ts");
    const covPath = path.resolve("cov.json");
    const code = await runPipeline(
      config({
        files: [],
        include: "src/detect/fs.ts",
        exclude: "**/does-not-match/**",
        output: "table",
        showAll: true,
      }),
      makeFs({
        [sourcePath]: "export function covered() { return 1; }\n",
        [covPath]: "{}",
      }),
    );
    expect(code).toBe(0);
  });

  test("sort name, complexity, and coverage change the json order", async () => {
    const sourcePath = path.resolve("src/a.ts");
    const covPath = path.resolve("cov.json");
    const source = "function zzz() { if (x) return 1; return 2; }\nfunction aaa() { return 1; }\n";
    const names = async (sort: Config["sort"]) => {
      const logs: string[] = [];
      const log = console.log;
      console.log = (message?: unknown) => {
        logs.push(String(message));
      };
      try {
        await runPipeline(
          config({ sort, output: "json", showAll: true }),
          makeFs({ [sourcePath]: source, [covPath]: "{}" }),
        );
      } finally {
        console.log = log;
      }
      const parsed = JSON.parse(logs.join("\n")) as { functions: Array<{ name: string }> };
      return parsed.functions.map((fn) => fn.name);
    };
    expect(await names("name")).toEqual(["aaa", "zzz"]);
    expect(await names("complexity")).toEqual(["zzz", "aaa"]);
    expect(await names("coverage")).toEqual(["zzz", "aaa"]);
    expect(await names("score")).toEqual(["zzz", "aaa"]);
  });

  test("html output is written to the requested file", async () => {
    const sourcePath = path.resolve("src/a.ts");
    const covPath = path.resolve("cov.json");
    const dest = path.resolve("crap-report-test.html");
    try {
      const code = await runPipeline(
        config({ output: "html", outputFile: dest, showAll: true }),
        makeFs({
          [sourcePath]: "function fromFake() { return 1; }\n",
          [covPath]: "{}",
        }),
      );
      expect(code).toBe(0);
      const html = await Bun.file(dest).text();
      expect(html).toContain("<html");
      expect(html).toContain("fromFake");
    } finally {
      rmSync(dest, { force: true });
    }
  });
});
