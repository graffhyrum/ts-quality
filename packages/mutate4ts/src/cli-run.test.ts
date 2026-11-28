import { test, expect, describe, beforeAll, afterAll, spyOn } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Fiber } from "effect";
import { FileError } from "./file-ops.ts";
import * as cliRun from "./cli-run.ts";
import {
  filterReportedViolations,
  emitOutput,
  runScanMode,
  finalizeRun,
  buildMultiFileProgram,
  runMain,
  runFromArgv,
  main,
  registerMutationInterrupt,
} from "./cli-run.ts";
import type { ParsedCli } from "./cli.ts";
import { createAggregatedRun, mergeResults, recordFileResults } from "./mutation-count.ts";
import { buildQualityReport } from "./file-contract/quality-report.ts";

describe("cli-run helpers", () => {
  let stdoutWrite: typeof process.stdout.write;

  beforeAll(() => {
    stdoutWrite = process.stdout.write;
    process.stdout.write = (() => true) as never;
  });

  afterAll(() => {
    process.stdout.write = stdoutWrite;
  });

  test("filterReportedViolations keeps only selected keys", () => {
    const violations = new Map([
      ["a.ts", 1],
      ["b.ts", 2],
    ]);
    const filtered = filterReportedViolations(violations, new Set(["a.ts"]));
    expect([...filtered.entries()]).toEqual([["a.ts", 1]]);
  });

  test("emitOutput writes json report", () => {
    const report = buildQualityReport(new Map([["a.ts", 0]]), null, 0);
    let written = "";
    const original = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      written += chunk;
      return true;
    }) as never;
    try {
      emitOutput(
        {
          report: "json",
        } as never,
        report,
        createAggregatedRun(),
      );
    } finally {
      process.stdout.write = original;
    }
    expect(written).toContain("quality-report/v1");
  });

  test("buildMultiFileProgram handles empty file list", async () => {
    await Effect.runPromise(
      buildMultiFileProgram(
        {
          testCommand: ["true"],
          report: "json",
          lines: undefined,
          verbose: false,
          timeoutFactor: 2,
        } as unknown as ParsedCli,
        [],
      ),
    );
  });

  test("buildMultiFileProgram runs a single fixture file", async () => {
    await Effect.runPromise(
      buildMultiFileProgram(
        {
          testCommand: ["true"],
          report: "json",
          lines: [2],
          verbose: false,
          timeoutFactor: 2,
        } as unknown as ParsedCli,
        ["test/fixtures/sample.ts"],
      ),
    );
  });

  test("finalizeRun without baseline fails on survivors", async () => {
    const agg = createAggregatedRun();
    mergeResults(agg.violationsByFile, "a.ts", [
      {
        site: {
          filePath: "a.ts",
          line: 1,
          column: 1,
          description: "d",
          originalText: "t",
          mutatedText: "f",
          span: { start: 0, end: 1 },
          category: { kind: "literal", from: "true", to: "false" },
        },
        outcome: { status: "survived" },
        durationMs: 1,
        testOutput: "",
      },
    ]);
    const result = await finalizeRun(
      {
        report: "json",
        seed: false,
        updateBaseline: false,
        baselinePath: ".quality/x.json",
      } as ParsedCli,
      null,
      false,
      agg,
      ["a.ts"],
    );
    expect(result.exitCode).toBe(1);
  });

  test("runScanMode prints sites for one file", async () => {
    const logs: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => void logs.push(args.join(" "));
    try {
      await runScanMode({ lines: undefined } as ParsedCli, ["test/fixtures/sample.ts"]);
    } finally {
      console.log = log;
    }
    expect(logs.join("\n")).toContain("mutation sites");
  });

  describe("finalizeRun with baseline file", () => {
    let dir: string;
    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "m4t-finalize-"));
      mkdirSync(join(dir, ".quality"), { recursive: true });
      writeFileSync(
        join(dir, ".quality/mutate4ts-baseline.json"),
        `${JSON.stringify({ version: 1, files: { "a.ts": 2 } }, null, 2)}\n`,
      );
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    test("allows stored survivors", async () => {
      const cwd = process.cwd();
      process.chdir(dir);
      const agg = createAggregatedRun();
      agg.violationsByFile.set("a.ts", 1);
      try {
        const result = await finalizeRun(
          {
            report: "json",
            seed: false,
            updateBaseline: false,
            baselinePath: ".quality/mutate4ts-baseline.json",
          } as ParsedCli,
          { version: 1, files: { "a.ts": 2 } },
          false,
          agg,
          ["a.ts"],
        );
        expect(result.exitCode).toBe(0);
      } finally {
        process.chdir(cwd);
      }
    });

    test("seed writes a new baseline file", async () => {
      const cwd = process.cwd();
      process.chdir(dir);
      rmSync(join(dir, ".quality/mutate4ts-baseline.json"));
      const agg = createAggregatedRun();
      agg.violationsByFile.set("a.ts", 1);
      let written = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        written += chunk;
        return true;
      }) as never;
      try {
        const result = await finalizeRun(
          {
            report: "json",
            seed: true,
            updateBaseline: false,
            baselinePath: ".quality/mutate4ts-baseline.json",
          } as ParsedCli,
          null,
          true,
          agg,
          ["a.ts"],
        );
        expect(result.exitCode).toBe(0);
        expect(readFileSync(".quality/mutate4ts-baseline.json", "utf8")).toContain('"a.ts": 1');
        const report = JSON.parse(written) as {
          ok: boolean;
          exitCode: number;
          files: { status: string; baseline: number }[];
        };
        expect(report.ok).toBe(true);
        expect(report.exitCode).toBe(0);
        expect(report.files[0]?.status).toBe("ok");
        expect(report.files[0]?.baseline).toBe(1);
      } finally {
        process.stdout.write = original;
        process.chdir(cwd);
      }
    });

    test("seed exits 3 when mutants errored", async () => {
      const agg = createAggregatedRun();
      recordFileResults(agg, "a.ts", [
        {
          site: {
            filePath: "a.ts",
            line: 1,
            column: 1,
            description: "d",
            originalText: "t",
            mutatedText: "f",
            span: { start: 0, end: 1 },
            category: { kind: "literal", from: "true", to: "false" },
          },
          outcome: { status: "error", message: "e" },
          durationMs: 1,
          testOutput: "",
        },
      ]);
      const result = await finalizeRun(
        {
          report: "json",
          seed: true,
          updateBaseline: false,
          baselinePath: ".quality/mutate4ts-baseline.json",
        } as ParsedCli,
        null,
        true,
        agg,
        ["a.ts"],
      );
      expect(result.exitCode).toBe(3);
    });

    test("shrinks baseline on update", async () => {
      const cwd = process.cwd();
      process.chdir(dir);
      const agg = createAggregatedRun();
      agg.violationsByFile.set("a.ts", 1);
      try {
        const result = await finalizeRun(
          {
            report: "json",
            seed: false,
            updateBaseline: true,
            baselinePath: ".quality/mutate4ts-baseline.json",
          } as ParsedCli,
          { version: 1, files: { "a.ts": 2 } },
          false,
          agg,
          ["a.ts"],
        );
        expect(result.exitCode).toBe(0);
        expect(readFileSync(".quality/mutate4ts-baseline.json", "utf8")).toContain('"a.ts": 1');
      } finally {
        process.chdir(cwd);
      }
    });
  });

  test("runFromArgv requires baseline for update", async () => {
    let code: number | undefined;
    const exit = spyOn(process, "exit").mockImplementation(((c?: number) => {
      code = c;
      throw new Error("exit");
    }) as never);
    const error = spyOn(console, "error").mockImplementation(() => {});
    await expect(
      runFromArgv([
        "bun",
        "mutate4ts",
        "--update-baseline",
        "--report",
        "json",
        "--baseline",
        ".quality/does-not-exist-baseline.json",
      ]),
    ).rejects.toThrow("exit");
    expect(code).toBe(2);
    exit.mockRestore();
    error.mockRestore();
  });

  test("runFromArgv rejects invalid seed usage", async () => {
    let code: number | undefined;
    const exit = spyOn(process, "exit").mockImplementation(((c?: number) => {
      code = c;
      throw new Error("exit");
    }) as never);
    const error = spyOn(console, "error").mockImplementation(() => {});
    await expect(runFromArgv(["bun", "mutate4ts", "--seed", "--files", "a.ts"])).rejects.toThrow(
      "exit",
    );
    expect(code).toBe(2);
    exit.mockRestore();
    error.mockRestore();
  });

  test("runMain scan mode resolves scoped targets", async () => {
    const logs: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => void logs.push(args.join(" "));
    try {
      await runMain({
        ...({
          testCommand: ["true"],
          verbose: false,
          timeoutFactor: 2,
          filesFlags: ["test/fixtures/sample.ts"],
          filesFrom: undefined,
          renamesFrom: undefined,
          report: "human",
          baselinePath: ".quality/mutate4ts-baseline.json",
          updateBaseline: false,
          seed: false,
          legacySourceFile: undefined,
        } as unknown as ParsedCli),
        scan: true,
        lines: undefined,
      } as ParsedCli);
    } finally {
      console.log = log;
    }
    expect(logs.join("\n")).toContain("mutation sites");
  });

  test("emitOutput prints multi-file human reports", () => {
    const agg = createAggregatedRun();
    agg.perFileResults.set("a.ts", [
      {
        site: {
          filePath: "a.ts",
          line: 1,
          column: 1,
          description: "d",
          originalText: "t",
          mutatedText: "f",
          span: { start: 0, end: 1 },
          category: { kind: "literal", from: "true", to: "false" },
        },
        outcome: { status: "killed", exitCode: 0 },
        durationMs: 1,
        testOutput: "",
      },
    ]);
    agg.perFileResults.set("b.ts", [
      {
        site: {
          filePath: "b.ts",
          line: 1,
          column: 1,
          description: "d",
          originalText: "t",
          mutatedText: "f",
          span: { start: 0, end: 1 },
          category: { kind: "literal", from: "true", to: "false" },
        },
        outcome: { status: "killed", exitCode: 0 },
        durationMs: 1,
        testOutput: "",
      },
    ]);
    const logs: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => void logs.push(args.join(" "));
    try {
      emitOutput({ report: "human" } as ParsedCli, buildQualityReport(new Map(), null, 0), agg);
    } finally {
      console.log = log;
    }
    expect(logs.join("\n")).toContain("=== a.ts ===");
  });

  test("runMain completes scoped json mutation run", async () => {
    let code: number | undefined;
    const exit = spyOn(process, "exit").mockImplementation(((c?: number) => {
      code = c;
      throw new Error("exit");
    }) as never);
    const err = spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(
        runMain({
          scan: false,
          testCommand: ["bun", "-e", "process.exit(0)"],
          lines: [2],
          verbose: false,
          timeoutFactor: 2,
          filesFlags: ["test/fixtures/sample.ts"],
          filesFrom: undefined,
          renamesFrom: undefined,
          report: "json",
          baselinePath: ".quality/mutate4ts-baseline.json",
          updateBaseline: false,
          seed: false,
          legacySourceFile: undefined,
        } satisfies ParsedCli),
      ).rejects.toThrow("exit");
      expect(code).toBe(1);
    } finally {
      exit.mockRestore();
      err.mockRestore();
    }
  });

  test("buildMultiFileProgram supports verbose human output", async () => {
    const logs: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => void logs.push(args.join(" "));
    try {
      await Effect.runPromise(
        buildMultiFileProgram(
          {
            testCommand: ["bun", "-e", "process.exit(0)"],
            report: "human",
            lines: [2],
            verbose: true,
            timeoutFactor: 2,
          } as unknown as ParsedCli,
          ["test/fixtures/sample.ts"],
        ),
      );
    } finally {
      console.log = log;
    }
    expect(logs.join("\n")).toContain("SURVIVED");
  });

  test("runMain exits when mutation pipeline fails", async () => {
    let code: number | undefined;
    const exit = spyOn(process, "exit").mockImplementation(((c?: number) => {
      code = c;
      throw new Error("exit");
    }) as never);
    const err = spyOn(console, "error").mockImplementation(() => {});
    const fail = spyOn(cliRun, "buildMultiFileProgram").mockReturnValue(
      Effect.fail(new FileError({ path: "x.ts", cause: new Error("boom") })),
    );
    try {
      await expect(
        runMain({
          scan: false,
          testCommand: ["true"],
          lines: [2],
          verbose: false,
          timeoutFactor: 2,
          filesFlags: ["test/fixtures/sample.ts"],
          filesFrom: undefined,
          renamesFrom: undefined,
          report: "human",
          baselinePath: ".quality/mutate4ts-baseline.json",
          updateBaseline: false,
          seed: false,
          legacySourceFile: undefined,
        } satisfies ParsedCli),
      ).rejects.toThrow("exit");
      expect(code).toBeGreaterThan(0);
    } finally {
      fail.mockRestore();
      exit.mockRestore();
      err.mockRestore();
    }
  });

  test("finalizeRun blocks baseline update when violations increase", async () => {
    const agg = createAggregatedRun();
    agg.violationsByFile.set("a.ts", 5);
    const result = await finalizeRun(
      {
        report: "json",
        seed: false,
        updateBaseline: true,
        baselinePath: ".quality/x.json",
      } as ParsedCli,
      { version: 1, files: { "a.ts": 1 } },
      false,
      agg,
      ["a.ts"],
    );
    expect(result.exitCode).toBe(1);
  });

  test("runScanMode lists multiple fixture files", async () => {
    const logs: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => void logs.push(args.join(" "));
    try {
      await runScanMode({ lines: [2] } as unknown as ParsedCli, [
        "test/fixtures/sample.ts",
        "test/fixtures/unary.ts",
      ]);
    } finally {
      console.log = log;
    }
    expect(logs.join("\n")).toContain("sample.ts");
  });

  test("main delegates to parsed argv handling", async () => {
    const run = spyOn(cliRun, "runMain").mockResolvedValue(undefined);
    await main();
    expect(run).toHaveBeenCalled();
    run.mockRestore();
  });

  test("runMain applies in-memory baseline renames", async () => {
    const dir = mkdtempSync(join(tmpdir(), "m4t-rename-"));
    mkdirSync(join(dir, ".quality"), { recursive: true });
    writeFileSync(join(dir, "src.ts"), "export const x = !true;\n");
    writeFileSync(join(dir, "legacy.ts"), "export const y = 1;\n");
    writeFileSync(
      join(dir, ".quality/mutate4ts-baseline.json"),
      JSON.stringify({ version: 1, files: { "legacy.ts": 1 } }),
    );
    writeFileSync(join(dir, "renames.txt"), "legacy.ts\tsrc.ts\n");
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      await runMain({
        scan: true,
        testCommand: ["true"],
        lines: undefined,
        verbose: false,
        timeoutFactor: 2,
        filesFlags: ["src.ts"],
        filesFrom: undefined,
        renamesFrom: "renames.txt",
        report: "human",
        baselinePath: ".quality/mutate4ts-baseline.json",
        updateBaseline: false,
        seed: false,
        legacySourceFile: undefined,
      } satisfies ParsedCli);
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("runFromArgv maps unexpected failures to json exit 2", async () => {
    let code: number | undefined;
    const exit = spyOn(process, "exit").mockImplementation(((c?: number) => {
      code = c;
      throw new Error("exit");
    }) as never);
    const err = spyOn(console, "error").mockImplementation(() => {});
    const broken = spyOn(cliRun, "runMain").mockRejectedValueOnce(new Error("boom"));
    try {
      await expect(
        runFromArgv(["bun", "mutate4ts", "--report", "json", "--files", "test/fixtures/sample.ts"]),
      ).rejects.toThrow("exit");
      expect(code).toBe(2);
    } finally {
      broken.mockRestore();
      exit.mockRestore();
      err.mockRestore();
    }
  });

  test("buildMultiFileProgram skips empty mutation sites", async () => {
    await Effect.runPromise(
      buildMultiFileProgram(
        {
          testCommand: ["true"],
          report: "json",
          lines: [9999],
          verbose: false,
          timeoutFactor: 2,
        } as unknown as ParsedCli,
        ["test/fixtures/sample.ts"],
      ),
    );
  });

  test("runScanMode exits when scan fails", async () => {
    let code: number | undefined;
    const exit = spyOn(process, "exit").mockImplementation(((c?: number) => {
      code = c;
      throw new Error("exit");
    }) as never);
    const err = spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(runScanMode({ lines: undefined } as ParsedCli, ["nope.ts"])).rejects.toThrow(
        "exit",
      );
      expect(code).toBeGreaterThan(0);
    } finally {
      exit.mockRestore();
      err.mockRestore();
    }
  });

  test("registerMutationInterrupt ignores duplicate SIGINT", () => {
    const fiber = Effect.runFork(Effect.never);
    registerMutationInterrupt(fiber);
    process.emit("SIGINT");
    process.emit("SIGINT");
    Effect.runFork(Fiber.interrupt(fiber));
  });

  test("runScanMode handles empty target list", async () => {
    const logs: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => void logs.push(args.join(" "));
    try {
      await runScanMode({ lines: undefined } as ParsedCli, []);
    } finally {
      console.log = log;
    }
    expect(logs.join("\n")).toContain("No mutation sites");
  });
});
