import { test, expect, describe } from "bun:test";
import { renderTable } from "./table";
import type { ProjectSummary } from "../types";

const summary: ProjectSummary = {
  functions: [
    {
      name: "foo",
      filePath: "a.ts",
      startLine: 1,
      endLine: 5,
      complexity: 10,
      coverage: 0,
      crapScore: 110,
      isCrappy: true,
    },
    {
      name: "bar",
      filePath: "a.ts",
      startLine: 6,
      endLine: 8,
      complexity: 1,
      coverage: 1,
      crapScore: 1,
      isCrappy: false,
    },
    {
      name: "baz",
      filePath: "b.ts",
      startLine: 1,
      endLine: 3,
      complexity: 3,
      coverage: null,
      crapScore: 12,
      isCrappy: false,
    },
  ],
  totalFunctions: 3,
  crappyCount: 1,
  crappyPercent: 33.3,
  isFlagged: true,
};

describe("table reporter", () => {
  test("renders all function names", () => {
    const output = renderTable(summary);
    expect(output).toContain("foo");
    expect(output).toContain("bar");
    expect(output).toContain("baz");
  });

  test("marks crappy functions", () => {
    const output = renderTable(summary);
    expect(output).toContain("CRAPPY");
    expect(output).toContain("OK");
  });

  test("shows N/A for null coverage", () => {
    const output = renderTable(summary);
    expect(output).toContain("N/A");
  });

  test("shows flagged project", () => {
    const output = renderTable(summary);
    expect(output).toContain("FLAGGED");
  });

  test("shows summary counts", () => {
    const output = renderTable(summary);
    expect(output).toContain("Total: 3 functions");
    expect(output).toContain("Crappy: 1");
  });

  test("shows 'Showing X of Y' when filtered", () => {
    const filtered: ProjectSummary = {
      functions: [summary.functions[0]],
      totalFunctions: 3,
      crappyCount: 1,
      crappyPercent: 33.3,
      isFlagged: true,
    };
    const output = renderTable(filtered);
    expect(output).toContain("Showing 1 of 3 functions");
  });

  test("shows empty message when no functions displayed", () => {
    const empty: ProjectSummary = {
      functions: [],
      totalFunctions: 10,
      crappyCount: 0,
      crappyPercent: 0,
      isFlagged: false,
    };
    const output = renderTable(empty);
    expect(output).toContain("No crappy functions found");
    expect(output).toContain("Showing 0 of 10 functions");
    expect(output).toContain("PASS");
  });
});
