import { Glob } from "bun";
import path from "path";
import { bunFileSystem } from "./detect/fs";
import type { FileSystem } from "./detect/types";

export async function loadGitignoreGlobs(
  root: string,
  fs: FileSystem = bunFileSystem,
): Promise<Glob[]> {
  const text = await fs.readText(path.join(root, ".gitignore"));
  if (text === null) return [];
  return parseGitignore(text)
    .flatMap(toGlobPatterns)
    .map((p) => new Glob(p));
}

export function isGitignored(globs: Glob[], file: string): boolean {
  return globs.some((g) => g.match(file));
}

function parseGitignore(content: string): string[] {
  return content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("!"));
}

function toGlobPatterns(pattern: string): string[] {
  const stripped = pattern.endsWith("/") ? pattern.slice(0, -1) : pattern;
  const base = stripped.startsWith("/")
    ? stripped.slice(1)
    : stripped.includes("/")
      ? stripped
      : `**/${stripped}`;
  return [base, `${base}/**`];
}
