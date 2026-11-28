import { describe, expect, test } from "bun:test";
import path from "node:path";
import { computeUpdatedBaseline, violationsByFileKey } from "./violations";
import type { FunctionCrap } from "../types";

describe("violations helpers", () => {
  test("counts only scoped crappy functions", () => {
    const fn = (file: string, crappy: boolean): FunctionCrap => ({
      name: "f",
      filePath: file,
      startLine: 1,
      endLine: 1,
      complexity: 1,
      coverage: 0,
      crapScore: crappy ? 100 : 1,
      isCrappy: crappy,
    });
    const counts = violationsByFileKey(
      [fn(path.resolve("src/a.ts"), true), fn(path.resolve("src/b.ts"), true)],
      ["src/a.ts"],
    );
    expect(counts.get("src/a.ts")).toBe(1);
    expect(counts.has("src/b.ts")).toBe(false);
  });

  test("full scan update prunes missing keys", () => {
    const base = { version: 1 as const, files: { "a.ts": 1, "b.ts": 2 } };
    const updated = computeUpdatedBaseline(
      base,
      ["a.ts"],
      new Map([["a.ts", 1]]),
      true,
      new Set(["a.ts"]),
    );
    expect(updated?.files).toEqual({ "a.ts": 1 });
  });
});
