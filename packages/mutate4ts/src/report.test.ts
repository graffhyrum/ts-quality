import { test, expect } from "bun:test";
import { formatReport, indentTestOutput } from "./report.ts";
import type { MutationOutcome, MutationResult } from "./execute.ts";

function resultWith(outcome: MutationOutcome): MutationResult {
  return {
    site: {
      filePath: "a.ts",
      span: { start: 0, end: 1 },
      originalText: "a",
      mutatedText: "b",
      category: { kind: "null-return" },
      description: "d",
      line: 1,
      column: 1,
    },
    outcome,
    durationMs: 0,
    testOutput: "",
  };
}

test("a timeout counts as killed in the Mutation Score", () => {
  const report = formatReport([
    resultWith({ status: "killed", exitCode: 1 }),
    resultWith({ status: "timeout", timeoutMs: 10 }),
    resultWith({ status: "survived" }),
    resultWith({ status: "survived" }),
  ]);
  expect(report).toContain("Mutation Score: 50.0%");
  expect(report).toContain("1 killed, 2 survived, 1 timed out, 0 errors");
});

test("an errored mutant's message appears in the report", () => {
  const report = formatReport([resultWith({ status: "error", message: "spawn exploded" })]);
  expect(report).toContain("spawn exploded");
  expect(report).toContain("0 killed, 0 survived, 0 timed out, 1 errors");
});

test("a repeated error message is printed once with its count", () => {
  const report = formatReport([
    resultWith({ status: "error", message: "same failure" }),
    resultWith({ status: "error", message: "same failure" }),
    resultWith({ status: "error", message: "other failure" }),
  ]);
  expect(report.split("same failure")).toHaveLength(2);
  expect(report).toContain("same failure (2x)");
  expect(report).toContain("other failure (1x)");
});

test("a run without errors prints no error messages section", () => {
  expect(formatReport([resultWith({ status: "survived" })])).not.toContain("Error messages");
});

test("no results score 0.0%", () => {
  expect(formatReport([])).toContain("Mutation Score: 0.0%");
});

test("indentTestOutput prefixes each line", () => {
  expect(indentTestOutput("fail\nline")).toBe("    fail\n    line");
});
