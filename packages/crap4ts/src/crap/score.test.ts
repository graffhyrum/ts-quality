import { test, expect, describe } from "bun:test";
import { computeCrapScore, isCrappy, summarize } from "./score";
import type { FunctionCrap } from "../types";

describe("CRAP score", () => {
  test("comp=1, cov=1 → CRAP=1", () => {
    expect(computeCrapScore(1, 1)).toBeCloseTo(1, 5);
  });

  test("comp=1, cov=0 → CRAP=2", () => {
    expect(computeCrapScore(1, 0)).toBeCloseTo(2, 5);
  });

  test("comp=10, cov=0 → CRAP=110", () => {
    expect(computeCrapScore(10, 0)).toBeCloseTo(110, 5);
  });

  test("comp=10, cov=1 → CRAP=10", () => {
    expect(computeCrapScore(10, 1)).toBeCloseTo(10, 5);
  });

  test("null coverage treated as 0", () => {
    expect(computeCrapScore(5, null)).toBeCloseTo(computeCrapScore(5, 0), 5);
  });

  test("partial coverage", () => {
    const score = computeCrapScore(5, 0.5);
    expect(score).toBeCloseTo(5 * 5 * Math.pow(0.5, 3) + 5, 5);
  });

  test("isCrappy with threshold 30", () => {
    expect(isCrappy(30, 30)).toBe(true);
    expect(isCrappy(29.9, 30)).toBe(false);
  });
});

describe("summarize", () => {
  test("flags project when crappy percent exceeds threshold", () => {
    const functions: FunctionCrap[] = Array.from({ length: 20 }, (_, i) => ({
      name: `fn${i}`,
      filePath: "test.ts",
      startLine: i,
      endLine: i + 1,
      complexity: 1,
      coverage: i < 2 ? 0 : 1,
      crapScore: i < 2 ? 35 : 1,
      isCrappy: i < 2,
    }));
    const result = summarize(functions, 5);
    expect(result.crappyCount).toBe(2);
    expect(result.crappyPercent).toBe(10);
    expect(result.isFlagged).toBe(true);
  });

  test("does not flag when under threshold", () => {
    const functions: FunctionCrap[] = Array.from({ length: 100 }, (_, i) => ({
      name: `fn${i}`,
      filePath: "test.ts",
      startLine: i,
      endLine: i + 1,
      complexity: 1,
      coverage: 1,
      crapScore: 1,
      isCrappy: false,
    }));
    const result = summarize(functions, 5);
    expect(result.isFlagged).toBe(false);
  });
});
