import { parseArgs } from "node:util";
import type { Config } from "./types";
import { CrapError } from "./types";

export function parseCli(argv: string[]): Config {
  const { values, positionals } = parseArgv(argv);
  if (values.help) return printHelpAndExit();
  if (values.version) return printVersionAndExit();
  return buildConfig(values, positionals);
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
    },
    allowPositionals: true,
  });
}

type ParsedValues = ReturnType<typeof parseArgv>["values"];

function buildConfig(values: ParsedValues, positionals: string[]): Config {
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
  };
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
