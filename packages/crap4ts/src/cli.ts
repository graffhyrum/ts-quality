import { parseArgs } from "node:util";
import { DEFAULT_BASELINE_PATH } from "./file-contract/baseline";
import { normalizeBaselineKey, UsageError } from "./file-contract/path-key";
import { readPathLines, readRenamePairs } from "./file-contract/read-inputs";
import type { Config, FileTargeting } from "./types";
import { CrapError } from "./types";

export async function parseCli(argv: string[]): Promise<Config> {
  const { values, positionals } = parseArgv(argv);
  if (values.help) return printHelpAndExit();
  if (values.version) return printVersionAndExit();
  assertNoContractOnInit(values);
  assertReportOutputConflict(values);
  assertBothStdin(values);
  assertSeedConflicts(values, positionals);
  assertUpdateWithoutBaseline(values);
  const targeting = await buildTargeting(values, positionals);
  return buildConfig(values, positionals, targeting);
}

function parseArgv(argv: string[]) {
  return parseArgs({
    args: argv.slice(2),
    options: {
      coverage: { type: "string", short: "c" },
      format: { type: "string", short: "f" },
      threshold: { type: "string", short: "t" },
      "project-threshold": { type: "string" },
      output: { type: "string", short: "o" },
      "output-file": { type: "string" },
      sort: { type: "string" },
      "only-crappy": { type: "boolean" },
      all: { type: "boolean" },
      include: { type: "string" },
      exclude: { type: "string" },
      init: { type: "boolean" },
      "no-gitignore": { type: "boolean" },
      quiet: { type: "boolean", short: "q" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
      files: { type: "string", multiple: true },
      "files-from": { type: "string" },
      "renames-from": { type: "string" },
      report: { type: "string" },
      baseline: { type: "string" },
      "update-baseline": { type: "boolean" },
      seed: { type: "boolean" },
    },
    allowPositionals: true,
  });
}

type ParsedValues = ReturnType<typeof parseArgv>["values"];

function buildConfig(
  values: ParsedValues,
  positionals: string[],
  targeting: FileTargeting,
): Config {
  const report = asStringOrUndef(values.report);
  if (report && report !== "json") {
    throw new CrapError(`Invalid report: ${report}. Must be: json`);
  }
  return {
    coveragePath: asString(values.coverage, "./coverage/coverage-final.json"),
    format: validateEnum(values.format, ["istanbul", "lcov", "v8"] as const, "format"),
    threshold: validateThreshold(values.threshold, 30),
    projectThreshold: validateThreshold(values["project-threshold"], 0),
    output: validateEnum(values.output, ["table", "json", "html"] as const, "output") ?? "table",
    outputFile: asStringOrUndef(values["output-file"]),
    sort:
      validateEnum(values.sort, ["score", "name", "complexity", "coverage"] as const, "sort") ??
      "score",
    showAll: values.all === true,
    onlyCrappyDeprecated: values["only-crappy"] === true,
    include: asString(values.include, "**/*.{ts,tsx,js,jsx}"),
    exclude: asString(values.exclude, "**/node_modules/**"),
    files: positionals,
    init: values.init === true,
    skipGitignore: values["no-gitignore"] === true,
    quiet: values.quiet === true,
    reportJson: report === "json",
    baselinePath: asString(values.baseline, DEFAULT_BASELINE_PATH),
    updateBaseline: values["update-baseline"] === true,
    seed: values.seed === true,
    targeting,
  };
}

async function buildTargeting(values: ParsedValues, positionals: string[]): Promise<FileTargeting> {
  const filesFlags = [...(values.files ?? [])].map((f) => normalizeBaselineKey(f));
  const filesFrom = asStringOrUndef(values["files-from"]);
  const filesFromPaths = filesFrom ? await readPathLines(filesFrom, "--files-from") : [];
  const renamesFrom = asStringOrUndef(values["renames-from"]);
  const renamePairs = renamesFrom ? await readRenamePairs(renamesFrom, "--renames-from") : [];
  return {
    filesFlags,
    filesFromPaths,
    filesFromPresent: filesFrom !== undefined,
    filesFromEmpty: filesFromPresentIsEmpty(filesFrom, filesFromPaths),
    legacyFiles: positionals,
    legacyPresent: positionals.length > 0,
    renamesFrom,
    renamePairs,
  };
}

function filesFromPresentIsEmpty(filesFrom: string | undefined, paths: string[]): boolean {
  if (filesFrom === undefined) return false;
  if (filesFrom !== "-") return paths.length === 0;
  return paths.length === 0;
}

function assertNoContractOnInit(values: ParsedValues): void {
  if (!values.init) return;
  const contract =
    values.files?.length ||
    values["files-from"] ||
    values["renames-from"] ||
    values.report ||
    values.baseline ||
    values["update-baseline"] ||
    values.seed;
  if (contract) throw new CrapError("file-list flags cannot be used with --init");
}

function assertReportOutputConflict(values: ParsedValues): void {
  if (values.report === "json" && values.output === "json") {
    throw new CrapError("Cannot use --report json with -o json");
  }
}

function assertBothStdin(values: ParsedValues): void {
  if (values["files-from"] === "-" && values["renames-from"] === "-") {
    throw new CrapError("Cannot read --files-from and --renames-from from stdin at once");
  }
}

function assertSeedConflicts(values: ParsedValues, positionals: string[]): void {
  if (!values.seed) return;
  const hasList =
    (values.files?.length ?? 0) > 0 || values["files-from"] !== undefined || positionals.length > 0;
  if (hasList) throw new CrapError("--seed requires a full scan with no file list");
  if (values["update-baseline"])
    throw new CrapError("Cannot combine --seed with --update-baseline");
}

function assertUpdateWithoutBaseline(values: ParsedValues): void {
  if (values["update-baseline"] && values.seed) {
    throw new CrapError("Cannot combine --seed with --update-baseline");
  }
}

function validateEnum<T extends string>(
  value: string | boolean | undefined,
  valid: readonly T[],
  label: string,
): T | undefined {
  const str = asStringOrUndef(value);
  if (!str) return undefined;
  if (!(valid as readonly string[]).includes(str))
    throw new CrapError(`Invalid ${label}: ${str}. Must be one of: ${valid.join(", ")}`);
  return str as T;
}

function validateThreshold(value: string | boolean | undefined, defaultVal: number): number {
  const str = asStringOrUndef(value);
  if (!str) return defaultVal;
  const num = parseFloat(str);
  if (isNaN(num) || num < 0)
    throw new CrapError(`Invalid threshold: ${str}. Must be a non-negative number.`);
  return num;
}

function asString(value: string | boolean | undefined, defaultVal: string): string {
  return typeof value === "string" ? value : defaultVal;
}

function asStringOrUndef(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function printHelpAndExit(): never {
  console.log(`Usage: crap4ts [options] [files/globs...]

Options:
  -c, --coverage <path>         Coverage file (default: ./coverage/coverage-final.json)
  -f, --format <format>         Coverage format: istanbul | lcov | v8 (default: auto-detect)
  -t, --threshold <number>      CRAP score threshold (default: 30)
      --project-threshold <n>   % crappy methods to flag project (default: 0)
  -o, --output <format>         Output format: table | json | html (default: table)
      --output-file <path>      Write report to file
      --sort <field>            Sort by: score | name | complexity | coverage (default: score)
      --all                     Show all functions, not just problematic ones
      --only-crappy             (deprecated) Now the default behavior
      --include <glob>          Source file glob (default: **/*.{ts,tsx,js,jsx})
      --exclude <glob>          Exclusion glob (default: **/node_modules/**)
      --files <path>            Repeatable path to analyze (literal, not glob-expanded)
      --files-from <path>       Path list file, or - for stdin
      --renames-from <path>     Rename map file (from<TAB>to lines), or - for stdin
      --report json             Emit the shared quality-report JSON on stdout
      --baseline <path>         Baseline file (default: .quality/crap4ts-baseline.json)
      --update-baseline         Shrink baseline counts for selected files after a pass
      --seed                    Write a new baseline from a full scan (counts > 0 only)
      --no-gitignore            Do not exclude gitignored files
  -q, --quiet                   Suppress output on success
      --init                    Detect test runner and configure coverage output
  -h, --help                    Show this help
      --version                 Show version`);
  process.exit(0);
}

function printVersionAndExit(): never {
  const pkg = require("../package.json") as { version: string };
  console.log(pkg.version);
  process.exit(0);
}

export function isUsageError(error: unknown): error is UsageError {
  return error instanceof UsageError;
}
