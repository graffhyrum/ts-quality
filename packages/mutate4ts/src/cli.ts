import { normalizeBaselineKey, UsageError } from "./file-contract/path-key.ts";

export type ReportMode = "human" | "json";

export type ParsedCli = {
  readonly scan: boolean;
  readonly testCommand: readonly string[];
  readonly lines: readonly number[] | undefined;
  readonly verbose: boolean;
  readonly timeoutFactor: number;
  readonly filesFlags: string[];
  readonly filesFrom: string | undefined;
  readonly renamesFrom: string | undefined;
  readonly report: ReportMode;
  readonly baselinePath: string;
  readonly updateBaseline: boolean;
  readonly seed: boolean;
  readonly legacySourceFile: string | undefined;
};

function parseCliOptions(argv: readonly string[]): ParsedCli {
  const raw = preprocessArgv(argv.slice(2));
  return resolveParsed(raw);
}

type RawCli = {
  scan?: boolean;
  testCommand?: string;
  lines?: number[];
  verbose?: boolean;
  timeoutFactor?: number;
  files?: string[];
  filesFrom?: string;
  renamesFrom?: string;
  report?: string;
  baseline?: string;
  updateBaseline?: boolean;
  seed?: boolean;
  sourceFile?: string;
};

function resolveParsed(raw: RawCli): ParsedCli {
  if (raw.report !== undefined && raw.report !== "json") {
    exitWithUsage(`Unknown --report value: ${raw.report}`);
  }
  return {
    scan: raw.scan ?? false,
    testCommand: (raw.testCommand ?? "bun test").split(" "),
    lines: raw.lines,
    verbose: raw.verbose ?? false,
    timeoutFactor: raw.timeoutFactor ?? 2,
    filesFlags: (raw.files ?? []).map((p) => normalizeBaselineKey(p)),
    filesFrom: raw.filesFrom,
    renamesFrom: raw.renamesFrom,
    report: raw.report === "json" ? "json" : "human",
    baselinePath: raw.baseline ?? ".quality/mutate4ts-baseline.json",
    updateBaseline: raw.updateBaseline ?? false,
    seed: raw.seed ?? false,
    legacySourceFile: raw.sourceFile,
  };
}

function preprocessArgv(args: readonly string[]): RawCli {
  const result: RawCli = {};
  let i = 0;
  while (i < args.length) {
    i = processArg(args, i, result);
  }
  return result;
}

function processArg(args: readonly string[], i: number, result: RawCli): number {
  const arg = args[i];
  if (arg === undefined) return i;
  if (arg === "--scan") return setBool(result, "scan", i);
  if (arg === "--verbose") return setBool(result, "verbose", i);
  if (arg === "--update-baseline") return setBool(result, "updateBaseline", i);
  if (arg === "--seed") return setBool(result, "seed", i);
  if (arg === "--test-command") return setString(args, result, "testCommand", i);
  if (arg === "--lines") return setLines(args, result, i);
  if (arg === "--timeout-factor") return setNumber(args, result, "timeoutFactor", i);
  if (arg === "--files-from") return setString(args, result, "filesFrom", i);
  if (arg === "--renames-from") return setString(args, result, "renamesFrom", i);
  if (arg === "--baseline") return setString(args, result, "baseline", i);
  if (arg === "--report") return setString(args, result, "report", i);
  if (arg.startsWith("--files=")) {
    pushFile(result, arg.slice("--files=".length));
    return i + 1;
  }
  if (arg === "--files") {
    const next = args[i + 1];
    if (next === undefined || next.startsWith("-")) exitWithUsage("--files requires a path");
    pushFile(result, next);
    return i + 2;
  }
  if (arg === "--help") return showHelp();
  if (arg.startsWith("-")) return exitWithUsage(`Unknown flag: ${arg}`);
  result.sourceFile = arg;
  return i + 1;
}

function pushFile(result: RawCli, path: string): void {
  if (!result.files) result.files = [];
  result.files.push(path);
}

function setBool(result: RawCli, key: keyof RawCli, i: number): number {
  (result as Record<string, unknown>)[key] = true;
  return i + 1;
}

function setString(args: readonly string[], result: RawCli, key: keyof RawCli, i: number): number {
  const val = args[i + 1];
  if (val === undefined) return exitWithUsage(`Missing value for --${String(key)}`);
  (result as Record<string, unknown>)[key] = val;
  return i + 2;
}

function setNumber(args: readonly string[], result: RawCli, key: keyof RawCli, i: number): number {
  const val = Number(args[i + 1]);
  if (Number.isNaN(val))
    return exitWithUsage(`Invalid number for --${String(key)}: ${args[i + 1]}`);
  (result as Record<string, unknown>)[key] = val;
  return i + 2;
}

function setLines(args: readonly string[], result: RawCli, i: number): number {
  const value = args[i + 1];
  if (value === undefined) return exitWithUsage("Missing value for --lines");
  const nums = value.split(",").map(Number);
  if (nums.some(Number.isNaN)) return exitWithUsage(`Invalid --lines value: ${value}`);
  result.lines = nums;
  return i + 2;
}

function showHelp(): never {
  console.log(USAGE);
  return process.exit(0);
}

function exitWithUsage(message: string): never {
  console.error(`Error: ${message}\n`);
  console.error(USAGE);
  return process.exit(2);
}

export function exitWithJsonError(message: string): never {
  console.error(`Error: ${message}`);
  return process.exit(2);
}

export function validateCliContract(opts: ParsedCli): void {
  if (opts.seed) {
    if (opts.updateBaseline)
      throw new UsageError("--seed cannot be combined with --update-baseline");
    if (opts.filesFlags.length > 0 || opts.filesFrom !== undefined || opts.legacySourceFile) {
      throw new UsageError("--seed requires a full scan with no file list");
    }
  }
  if (opts.scan && opts.report === "json") {
    throw new UsageError("--scan does not support --report json");
  }
  if (opts.filesFrom === "-" && opts.renamesFrom === "-") {
    throw new UsageError("--files-from and --renames-from cannot both read stdin");
  }
}

const USAGE = `Usage: mutate4ts [options] [sourceFile]

Options:
  --files <path>        Target file (repeatable)
  --files-from <path>   Read target paths from file or - for stdin
  --renames-from <path> Baseline rename pairs (from<TAB>to per line)
  --report json         Emit machine-readable quality report on stdout
  --baseline <path>     Baseline file (default: .quality/mutate4ts-baseline.json)
  --update-baseline     Shrink stored counts after a passing run
  --seed                Create baseline from current violations (full scan only)
  --scan                List mutation sites without running tests
  --test-command CMD    Test command to run (default: "bun test")
  --lines N,N,...       Restrict mutations to specific lines
  --timeout-factor N    Timeout multiplier for test runs (default: 2)
  --verbose             Show detailed output
  --help                Show this help message`;

export { parseCliOptions, exitWithUsage, UsageError };
