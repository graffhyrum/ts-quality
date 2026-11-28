import { test, expect, describe, spyOn } from "bun:test";
import { parseCliOptions, validateCliContract, exitWithJsonError } from "./cli.ts";
import type { ParsedCli } from "./cli.ts";
import { UsageError } from "./file-contract/path-key.ts";

function argv(...args: string[]): string[] {
  return ["bun", "script.ts", ...args];
}

describe("parseCliOptions", () => {
  test("parses positional sourceFile argument", () => {
    const opts = parseCliOptions(argv("src/index.ts"));
    expect(opts.legacySourceFile).toBe("src/index.ts");
  });

  test("parses --scan flag", () => {
    const opts = parseCliOptions(argv("--scan", "src/index.ts"));
    expect(opts.scan).toBe(true);
  });

  test("parses --test-command", () => {
    const opts = parseCliOptions(argv("--test-command", "npm test", "src/index.ts"));
    expect(opts.testCommand).toEqual(["npm", "test"]);
  });

  test("parses --lines into number array", () => {
    const opts = parseCliOptions(argv("--lines", "1,5,10", "src/index.ts"));
    expect(opts.lines).toEqual([1, 5, 10]);
  });

  test("parses --timeout-factor", () => {
    const opts = parseCliOptions(argv("--timeout-factor", "3", "src/index.ts"));
    expect(opts.timeoutFactor).toBe(3);
  });

  test("parses --verbose flag", () => {
    const opts = parseCliOptions(argv("--verbose", "src/index.ts"));
    expect(opts.verbose).toBe(true);
  });

  test("applies defaults", () => {
    const opts = parseCliOptions(argv("src/index.ts"));
    expect(opts.scan).toBe(false);
    expect(opts.testCommand).toEqual(["bun", "test"]);
    expect(opts.timeoutFactor).toBe(2);
    expect(opts.verbose).toBe(false);
  });

  test("parses file-list and baseline flags", () => {
    const opts = parseCliOptions(
      argv(
        "--files",
        "a.ts",
        "--files=b.ts",
        "--files-from",
        "list.txt",
        "--report",
        "json",
        "--baseline",
        ".quality/x.json",
        "--update-baseline",
        "--seed",
      ),
    );
    expect(opts.filesFlags).toEqual(["a.ts", "b.ts"]);
    expect(opts.filesFrom).toBe("list.txt");
    expect(opts.report).toBe("json");
    expect(opts.baselinePath).toBe(".quality/x.json");
    expect(opts.updateBaseline).toBe(true);
    expect(opts.seed).toBe(true);
    expect(opts.legacySourceFile).toBeUndefined();
  });
});

describe("validateCliContract", () => {
  const base: ParsedCli = {
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
  };

  test("rejects incompatible seed flags", () => {
    expect(() => validateCliContract({ ...base, seed: true, updateBaseline: true })).toThrow(
      UsageError,
    );
    expect(() => validateCliContract({ ...base, seed: true, filesFlags: ["a.ts"] })).toThrow(
      UsageError,
    );
  });

  test("rejects --scan with --report json", () => {
    expect(() => validateCliContract({ ...base, scan: true, report: "json" })).toThrow(UsageError);
  });

  test("rejects stdin for both path lists", () => {
    expect(() => validateCliContract({ ...base, filesFrom: "-", renamesFrom: "-" })).toThrow(
      UsageError,
    );
  });
});

describe("exit paths", () => {
  class ExitSignal extends Error {
    constructor(readonly code: number | undefined) {
      super(`exit ${code}`);
    }
  }

  function captureExit(run: () => unknown): { code: number | undefined; out: string; err: string } {
    const logs: string[] = [];
    const errors: string[] = [];
    const exit = spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new ExitSignal(code);
    }) as never);
    const log = spyOn(console, "log").mockImplementation(
      (...a: unknown[]) => void logs.push(a.join(" ")),
    );
    const error = spyOn(console, "error").mockImplementation(
      (...a: unknown[]) => void errors.push(a.join(" ")),
    );
    try {
      run();
      throw new Error("expected process.exit to be called");
    } catch (e) {
      if (!(e instanceof ExitSignal)) throw e;
      return { code: e.code, out: logs.join("\n"), err: errors.join("\n") };
    } finally {
      exit.mockRestore();
      log.mockRestore();
      error.mockRestore();
    }
  }

  test("--help prints usage and exits 0", () => {
    const { code, out } = captureExit(() => parseCliOptions(argv("--help")));
    expect(code).toBe(0);
    expect(out).toStartWith("Usage: mutate4ts [options] [sourceFile]");
  });

  test("invalid --lines value prints error and usage to stderr, exits 2", () => {
    const { code, err } = captureExit(() =>
      parseCliOptions(argv("--lines", "1,x", "src/index.ts")),
    );
    expect(code).toBe(2);
    expect(err).toContain("Error: Invalid --lines value: 1,x");
    expect(err).toContain("Usage: mutate4ts");
  });

  test("unknown flag exits 2", () => {
    const { code, err } = captureExit(() => parseCliOptions(argv("--nope")));
    expect(code).toBe(2);
    expect(err).toContain("Unknown flag: --nope");
  });

  test("exitWithJsonError exits 2", () => {
    const { code, err } = captureExit(() => exitWithJsonError("bad json mode"));
    expect(code).toBe(2);
    expect(err).toContain("bad json mode");
  });

  test("--files without value exits 2", () => {
    const { code, err } = captureExit(() => parseCliOptions(argv("--files")));
    expect(code).toBe(2);
    expect(err).toContain("--files requires a path");
  });

  test("unknown --report value exits 2", () => {
    const { code, err } = captureExit(() => parseCliOptions(argv("--report", "xml")));
    expect(code).toBe(2);
    expect(err).toContain("Unknown --report value");
  });

  test("invalid --timeout-factor exits 2", () => {
    const { code, err } = captureExit(() =>
      parseCliOptions(argv("--timeout-factor", "abc", "a.ts")),
    );
    expect(code).toBe(2);
    expect(err).toContain("Invalid number for --timeoutFactor: abc");
  });
});
