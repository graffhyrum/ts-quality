import { Glob } from "bun";
import { describe, expect, test } from "bun:test";
import type { FileSystem } from "./detect/types";
import { isGitignored, loadGitignoreGlobs } from "./gitignore";

function makeFs(content: string | null): FileSystem {
  return {
    exists: async () => content !== null,
    readText: async () => content,
    realPath: async (p) => p,
  };
}

function globs(patterns: string[]): Glob[] {
  return patterns.map((p) => new Glob(p));
}

describe("isGitignored", () => {
  test("returns false for empty globs", () => {
    expect(isGitignored([], "src/foo.ts")).toBe(false);
  });

  test("returns true when file matches a glob", () => {
    expect(isGitignored(globs(["**/*.log"]), "logs/app.log")).toBe(true);
  });

  test("returns false when no glob matches", () => {
    expect(isGitignored(globs(["**/*.log"]), "src/foo.ts")).toBe(false);
  });
});

describe("loadGitignoreGlobs", () => {
  test("returns empty array when .gitignore is absent", async () => {
    const result = await loadGitignoreGlobs(".", makeFs(null));
    expect(result).toHaveLength(0);
  });

  test("skips comment lines", async () => {
    const result = await loadGitignoreGlobs(".", makeFs("# this is a comment\n"));
    expect(result).toHaveLength(0);
  });

  test("skips empty lines", async () => {
    const result = await loadGitignoreGlobs(".", makeFs("\n\n"));
    expect(result).toHaveLength(0);
  });

  test("skips negation lines", async () => {
    const result = await loadGitignoreGlobs(".", makeFs("!keep-this.ts\n"));
    expect(result).toHaveLength(0);
  });

  test("directory pattern matches file inside directory", async () => {
    const result = await loadGitignoreGlobs(".", makeFs("coverage/\n"));
    expect(isGitignored(result, "coverage/lcov.info")).toBe(true);
  });

  test("simple pattern matches at any depth", async () => {
    const result = await loadGitignoreGlobs(".", makeFs("*.log\n"));
    expect(isGitignored(result, "logs/foo.log")).toBe(true);
  });

  test("rooted pattern matches at root only", async () => {
    const result = await loadGitignoreGlobs(".", makeFs("/dist\n"));
    expect(isGitignored(result, "dist/index.js")).toBe(true);
    expect(isGitignored(result, "src/dist/index.js")).toBe(false);
  });

  test("relative path pattern matches at its path", async () => {
    const result = await loadGitignoreGlobs(".", makeFs("src/generated\n"));
    expect(isGitignored(result, "src/generated/foo.ts")).toBe(true);
  });
});
