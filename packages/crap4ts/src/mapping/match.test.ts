import { test, expect, describe } from "bun:test";
import { matchFunctions } from "./match";
import type { FileCoverage, FunctionInfo } from "../types";
import path from "path";

const abs = (f: string) => path.resolve(f);

describe("function-to-coverage matching", () => {
  test("full coverage yields score near complexity", () => {
    const functions: FunctionInfo[] = [
      { name: "foo", filePath: abs("a.ts"), startLine: 1, endLine: 3, complexity: 1 },
    ];
    const coverage: FileCoverage[] = [
      {
        filePath: abs("a.ts"),
        statements: [
          { startLine: 1, endLine: 1, hits: 1 },
          { startLine: 2, endLine: 2, hits: 1 },
          { startLine: 3, endLine: 3, hits: 1 },
        ],
      },
    ];
    const result = matchFunctions(functions, coverage, 30);
    expect(result[0].coverage).toBe(1);
    expect(result[0].crapScore).toBeCloseTo(1, 5);
  });

  test("no coverage data yields null coverage", () => {
    const functions: FunctionInfo[] = [
      { name: "foo", filePath: abs("a.ts"), startLine: 1, endLine: 3, complexity: 5 },
    ];
    const result = matchFunctions(functions, [], 30);
    expect(result[0].coverage).toBeNull();
    expect(result[0].crapScore).toBeCloseTo(30, 5);
  });

  test("partial coverage", () => {
    const functions: FunctionInfo[] = [
      { name: "foo", filePath: abs("a.ts"), startLine: 1, endLine: 4, complexity: 2 },
    ];
    const coverage: FileCoverage[] = [
      {
        filePath: abs("a.ts"),
        statements: [
          { startLine: 1, endLine: 1, hits: 1 },
          { startLine: 2, endLine: 2, hits: 0 },
          { startLine: 3, endLine: 3, hits: 1 },
          { startLine: 4, endLine: 4, hits: 0 },
        ],
      },
    ];
    const result = matchFunctions(functions, coverage, 30);
    expect(result[0].coverage).toBe(0.5);
  });

  test("nested function lines excluded from parent coverage", () => {
    const functions: FunctionInfo[] = [
      { name: "outer", filePath: abs("a.ts"), startLine: 1, endLine: 10, complexity: 2 },
      { name: "inner", filePath: abs("a.ts"), startLine: 3, endLine: 7, complexity: 2 },
    ];
    const statements = Array.from({ length: 10 }, (_, i) => ({
      startLine: i + 1,
      endLine: i + 1,
      hits: 1,
    }));
    const coverage: FileCoverage[] = [{ filePath: abs("a.ts"), statements }];
    const result = matchFunctions(functions, coverage, 30);
    const outer = result.find((f) => f.name === "outer");
    const inner = result.find((f) => f.name === "inner");
    expect(outer).toBeDefined();
    expect(inner).toBeDefined();
    expect(inner!.coverage).toBe(1);
    expect(outer!.coverage).toBe(1);
  });

  test("a grandchild is excluded from the middle function, not only the outer one", () => {
    const functions: FunctionInfo[] = [
      { name: "outer", filePath: abs("a.ts"), startLine: 1, endLine: 20, complexity: 1 },
      { name: "mid", filePath: abs("a.ts"), startLine: 2, endLine: 10, complexity: 1 },
      { name: "inner", filePath: abs("a.ts"), startLine: 3, endLine: 5, complexity: 1 },
    ];
    const statements = Array.from({ length: 20 }, (_, i) => ({
      startLine: i + 1,
      endLine: i + 1,
      hits: i + 1 >= 3 && i + 1 <= 5 ? 0 : 1,
    }));
    const result = matchFunctions(functions, [{ filePath: abs("a.ts"), statements }], 30);
    expect(result.find((fn) => fn.name === "mid")?.coverage).toBe(1);
    expect(result.find((fn) => fn.name === "inner")?.coverage).toBe(0);
  });
});
