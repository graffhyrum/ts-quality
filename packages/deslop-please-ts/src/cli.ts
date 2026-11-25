import {
  CHECKS,
  DEFAULT_OPTIONS,
  formatDiagnostics,
  runLints,
  type LintOptions,
} from "./lint.ts";
import { buildModel, formatModel } from "./model.ts";

const TOOL = "deslop-please-ts";

export type CliOutput = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

export type CliIo = {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
  readonly exit: (code: number) => void;
};

export function main(args: readonly string[], io: CliIo): void {
  const result = run(args);
  if (result.stdout.length > 0) io.out(result.stdout);
  if (result.stderr.length > 0) io.err(result.stderr);
  io.exit(result.exitCode);
}

export function run(args: readonly string[]): CliOutput {
  if (args.includes("--help") || args.includes("-h")) {
    return { exitCode: 0, stdout: `${usage()}\n`, stderr: "" };
  }

  const root = args.find((arg) => !arg.startsWith("--")) ?? process.cwd();
  const options = parseOptions(args);

  try {
    const model = buildModel(root);
    if (args.includes("--model")) {
      return { exitCode: 0, stdout: `${formatModel(model)}\n`, stderr: "" };
    }
    const diagnostics = runLints(model, options);
    if (diagnostics.length > 0) {
      const body = formatDiagnostics(diagnostics);
      return {
        exitCode: 1,
        stdout: `${body}${TOOL}: ${diagnostics.length} errors, well done!\n`,
        stderr: "",
      };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { exitCode: 2, stdout: "", stderr: `${TOOL}: ${message}\n` };
  }
}

export function usage(): string {
  return [
    `usage: ${TOOL} [path] [options]`,
    "",
    "Lint a TypeScript project for the six architectural sloppiness checks.",
    "",
    "checks:",
    ...CHECKS.map((check) => `  ${check}`),
    "",
    "options:",
    "  <path>                 project root (default: current directory)",
    "  --model                print the extracted model instead of linting",
    "  --held-in-mind <n>     threshold for tangles, shallow modules, wide dirs (default 7)",
    "  --max-lines <n>        long-file threshold (default 300)",
    "  --help                 show this message",
    "",
    "exit codes: 0 clean, 1 errors found, 2 bad input or internal error",
  ].join("\n");
}

export function parseOptions(argv: readonly string[]): LintOptions {
  const held = numericFlag(argv, "--held-in-mind");
  const lines = numericFlag(argv, "--max-lines");
  return {
    heldInMind: held ?? DEFAULT_OPTIONS.heldInMind,
    maxLines: lines ?? DEFAULT_OPTIONS.maxLines,
    excluded: DEFAULT_OPTIONS.excluded,
  };
}

export function numericFlag(
  argv: readonly string[],
  name: string,
): number | null {
  const at = argv.indexOf(name);
  if (at === -1) return null;
  const raw = argv[at + 1];
  if (raw === undefined) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}
