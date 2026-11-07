import { fileURLToPath } from "node:url";
import { type } from "arktype";
import path from "path";
import { bunFileSystem } from "../detect/fs";
import type { FileSystem } from "../detect/types";
import type { FileCoverage, StatementCoverage } from "../types";
import { CrapError } from "../types";
import { V8CoverageSchema, V8FunctionSchema, V8RangeSchema, V8ScriptSchema } from "../schemas";

type V8Range = typeof V8RangeSchema.infer;
type V8Function = typeof V8FunctionSchema.infer;
type V8Script = typeof V8ScriptSchema.infer;

type V8Options = {
  sourceRoot?: string;
  fs?: FileSystem;
  warn?: (msg: string) => void;
};

type OpenedSource = {
  filePath: string;
  text: string;
};

export async function parseV8(
  content: string,
  filePath: string,
  options: V8Options = {},
): Promise<FileCoverage[]> {
  const parsed = V8CoverageSchema(content);
  if (parsed instanceof type.errors)
    throw new CrapError(`Invalid coverage file: ${filePath}\n${parsed.summary}`);
  const sourceRoot = options.sourceRoot ?? process.cwd();
  const fs = options.fs ?? bunFileSystem;
  const warn = options.warn ?? console.warn;
  return convertScripts(parsed.result, sourceRoot, fs, warn);
}

async function convertScripts(
  scripts: V8Script[],
  sourceRoot: string,
  fs: FileSystem,
  warn: (msg: string) => void,
): Promise<FileCoverage[]> {
  const results: FileCoverage[] = [];
  const root = await fs.realPath(path.resolve(sourceRoot));
  for (const script of scripts) {
    const opened = await openInsideRoot(script.url, root, fs, warn);
    if (!opened) continue;
    if (offsetPastEnd(script.functions, opened.text.length)) {
      throw new CrapError(`Invalid coverage file: offset past end of ${opened.filePath}`);
    }
    const lineOffsets = buildLineOffsets(opened.text);
    const statements = extractStatements(script.functions, lineOffsets);
    results.push({ filePath: opened.filePath, statements });
  }
  return results;
}

async function openInsideRoot(
  url: string,
  root: string,
  fs: FileSystem,
  warn: (msg: string) => void,
): Promise<OpenedSource | undefined> {
  const logical = pathFromCoverageUrl(url, root);
  if (logical === undefined) return undefined;
  const filePath = await fs.realPath(logical);
  if (!isInsideRoot(filePath, root)) return undefined;
  const text = await readSource(filePath, fs, warn);
  if (text === undefined) return undefined;
  return { filePath, text };
}

async function readSource(
  filePath: string,
  fs: FileSystem,
  warn: (msg: string) => void,
): Promise<string | undefined> {
  try {
    const text = await fs.readText(filePath);
    if (text === null) {
      warn(`Warning: cannot read source file ${filePath}, skipping`);
      return undefined;
    }
    return text;
  } catch {
    warn(`Warning: cannot read source file ${filePath}, skipping`);
    return undefined;
  }
}

function pathFromCoverageUrl(url: string, sourceRoot: string): string | undefined {
  if (url.startsWith("file://")) return fileUrlPath(url);
  if (path.isAbsolute(url)) return url;
  if (url !== "" && !url.includes("://")) return path.resolve(sourceRoot, url);
  return undefined;
}

function fileUrlPath(url: string): string | undefined {
  try {
    return fileURLToPath(url);
  } catch {
    return undefined;
  }
}

function isInsideRoot(filePath: string, sourceRoot: string): boolean {
  const rel = path.relative(sourceRoot, filePath);
  if (rel === "" || path.isAbsolute(rel)) return false;
  return !rel.split(/[/\\]/).includes("..");
}

function offsetPastEnd(functions: V8Function[], sourceLength: number): boolean {
  for (const fn of functions) {
    for (const range of fn.ranges) {
      if (range.endOffset > sourceLength) return true;
    }
  }
  return false;
}

function buildLineOffsets(source: string): number[] {
  const offsets = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") offsets.push(i + 1);
  }
  return offsets;
}

function extractStatements(functions: V8Function[], lineOffsets: number[]): StatementCoverage[] {
  const statements: StatementCoverage[] = [];
  for (const fn of functions) {
    for (const range of fn.ranges) {
      statements.push(rangeToStatement(range, lineOffsets));
    }
  }
  return statements;
}

function rangeToStatement(range: V8Range, lineOffsets: number[]): StatementCoverage {
  return {
    startLine: offsetToLine(range.startOffset, lineOffsets),
    endLine: offsetToLine(range.endOffset, lineOffsets),
    hits: range.count,
  };
}

function offsetToLine(offset: number, lineOffsets: number[]): number {
  let lo = 0;
  let hi = lineOffsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineOffsets[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}
