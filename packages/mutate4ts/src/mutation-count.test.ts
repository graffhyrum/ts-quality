import { test, expect, describe } from "bun:test";
import {
  countSurvivors,
  createAggregatedRun,
  hasMutationError,
  mergeResults,
  mutationToolExitCode,
  recordFileResults,
} from "./mutation-count.ts";
import type { MutationResult } from "./execute.ts";

function result(status: MutationResult["outcome"]["status"]): MutationResult {
  return {
    site: {
      filePath: "a.ts",
      line: 1,
      column: 1,
      description: "x",
      originalText: "true",
      mutatedText: "false",
      span: { start: 0, end: 4 },
      category: { kind: "literal", from: "true", to: "false" },
    },
    outcome:
      status === "survived"
        ? { status: "survived" }
        : status === "error"
          ? { status: "error", message: "e" }
          : { status: "killed", exitCode: 1 },
    durationMs: 1,
    testOutput: "",
  };
}

describe("mutation-count", () => {
  test("counts survivors and exit codes", () => {
    expect(countSurvivors([result("survived"), result("killed")])).toBe(1);
    expect(mutationToolExitCode([result("error")])).toBe(3);
    const agg = createAggregatedRun();
    recordFileResults(agg, "a.ts", [result("survived")]);
    mergeResults(agg.violationsByFile, "a.ts", [result("survived")]);
    expect(agg.violationsByFile.get("a.ts")).toBe(2);
    expect(hasMutationError([result("killed")])).toBe(false);
    expect(hasMutationError([result("error")])).toBe(true);
    expect(mutationToolExitCode([result("survived")])).toBe(1);
    expect(mutationToolExitCode([result("timeout")])).toBe(0);
  });
});
