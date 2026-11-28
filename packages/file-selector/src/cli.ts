#!/usr/bin/env bun
import { stat } from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";
import { SelectorFailure } from "./failure.ts";
import { formatJson, formatPathList } from "./format.ts";
import { selectPaths, type Mode } from "./select.ts";

const HELP = `Usage: file-selector [--staged] [--since <rev>] [--format text|json] [--cwd <dir>]

List paths a hook passes to a quality gate. --staged (the default) reads the
git index. --since <rev> reads commits in <rev>...HEAD. Text stdout is a
newline-separated path list for --files-from -. JSON stdout is one document
(schema ts-quality/file-selector/v1) with files, renames, and deletes.

Deletes are omitted from the text list. A rename's text line is the new path.
The run refuses (exit 1, empty stdout) when a listed path differs between the
index and the worktree, so a gate that reads the worktree is reading the commit.

Options:
      --staged           Index versus HEAD (default)
      --since <rev>      Changes in <rev>...HEAD. Cannot be combined with --staged
      --format <kind>    text (default) or json
      --cwd <dir>        Working directory to discover the repository from
  -h, --help             Show this help
      --version          Show the package version

Exit codes:
  0  The path list is on stdout. Empty stdout means nothing was selected.
  1  A selected path is partially staged. Stdout is empty.
  2  Usage error, not a git repository, or git failed. Stdout is empty.
`;

type Options =
  | { readonly kind: "help" }
  | { readonly kind: "version" }
  | {
      readonly kind: "select";
      readonly cwd: string;
      readonly mode: Mode;
      readonly format: "text" | "json";
    };

export async function main(argv: readonly string[]): Promise<number> {
  try {
    const options = await parseOptions(argv);
    if (options.kind === "help") {
      process.stdout.write(HELP);
      return 0;
    }
    if (options.kind === "version") {
      process.stdout.write(`${await readVersion()}\n`);
      return 0;
    }
    const selection = await selectPaths(options.cwd, options.mode);
    const body =
      options.format === "json"
        ? formatJson(selection)
        : formatPathList(selection.files);
    process.stdout.write(body);
    return 0;
  } catch (error) {
    const message =
      error instanceof SelectorFailure
        ? error.message
        : `file-selector: ${error instanceof Error ? error.message : String(error)}`;
    process.stderr.write(`${message}\n`);
    return error instanceof SelectorFailure ? error.exitCode : 2;
  }
}

async function parseOptions(argv: readonly string[]): Promise<Options> {
  let values: {
    staged?: boolean;
    since?: string;
    format?: string;
    cwd?: string;
    help?: boolean;
    version?: boolean;
  };
  try {
    const parsed = parseArgs({
      args: [...argv.slice(2)],
      options: {
        staged: { type: "boolean" },
        since: { type: "string" },
        format: { type: "string", default: "text" },
        cwd: { type: "string" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean" },
      },
      strict: true,
      allowPositionals: false,
    });
    values = parsed.values;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new SelectorFailure(2, `file-selector: ${detail}`);
  }
  if (values.help === true) return { kind: "help" };
  if (values.version === true) return { kind: "version" };
  const format = values.format ?? "text";
  if (format !== "text" && format !== "json") {
    throw new SelectorFailure(
      2,
      `file-selector: --format must be text or json, not ${format}`,
    );
  }
  if (values.staged === true && values.since !== undefined) {
    throw new SelectorFailure(
      2,
      "file-selector: --staged and --since cannot be combined",
    );
  }
  const mode: Mode =
    values.since === undefined
      ? { kind: "staged" }
      : { kind: "since", rev: revision(values.since) };
  const cwd = path.resolve(values.cwd ?? process.cwd());
  const info = await stat(cwd).catch(() => null);
  if (info === null || !info.isDirectory()) {
    throw new SelectorFailure(
      2,
      `file-selector: --cwd is not a directory: ${cwd}`,
    );
  }
  return { kind: "select", cwd, mode, format };
}

function revision(rev: string): string {
  if (
    rev.length === 0 ||
    rev.startsWith("-") ||
    rev.includes("..") ||
    /\s/.test(rev) ||
    rev.includes("\\")
  ) {
    throw new SelectorFailure(2, `file-selector: invalid revision ${rev}`);
  }
  return rev;
}

async function readVersion(): Promise<string> {
  const pkg = (await Bun.file(
    new URL("../package.json", import.meta.url),
  ).json()) as {
    version?: string;
  };
  if (typeof pkg.version !== "string") {
    throw new SelectorFailure(2, "file-selector: package.json has no version");
  }
  return pkg.version;
}

if (import.meta.main) process.exit(await main(process.argv));
