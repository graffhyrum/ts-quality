import { test, expect, describe } from "bun:test";
import { renderHtml } from "./html";
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
      coverage: null,
      crapScore: 2,
      isCrappy: false,
    },
  ],
  totalFunctions: 2,
  crappyCount: 1,
  crappyPercent: 50,
  isFlagged: true,
};

describe("html reporter", () => {
  test("produces valid HTML structure", () => {
    const output = renderHtml(summary);
    expect(output).toContain("<!DOCTYPE html>");
    expect(output).toContain("</html>");
    expect(output).toContain("<table");
    expect(output).toContain("</table>");
  });

  test("includes function names", () => {
    const output = renderHtml(summary);
    expect(output).toContain("foo");
    expect(output).toContain("bar");
  });

  test("marks crappy rows", () => {
    const output = renderHtml(summary);
    expect(output).toContain('class="crappy"');
    expect(output).toContain("CRAPPY");
  });

  test("shows N/A for null coverage", () => {
    const output = renderHtml(summary);
    expect(output).toContain("N/A");
  });

  test("includes sort script", () => {
    const output = renderHtml(summary);
    expect(output).toContain("sortTable");
  });

  test("shows 'Showing X of Y' when filtered", () => {
    const filtered: ProjectSummary = {
      functions: [summary.functions[0]],
      totalFunctions: 5,
      crappyCount: 1,
      crappyPercent: 20,
      isFlagged: true,
    };
    const output = renderHtml(filtered);
    expect(output).toContain("Showing:");
    expect(output).toContain("1 of 5 functions");
  });

  test("shows empty message when no functions displayed", () => {
    const empty: ProjectSummary = {
      functions: [],
      totalFunctions: 10,
      crappyCount: 0,
      crappyPercent: 0,
      isFlagged: false,
    };
    const output = renderHtml(empty);
    expect(output).toContain("No crappy functions found");
    expect(output).not.toContain("<table");
    expect(output).toContain("Showing:");
    expect(output).toContain("0 of 10 functions");
    expect(output).toContain("PASS");
  });

  test("escapes HTML entities", () => {
    const xssSummary: ProjectSummary = {
      functions: [
        {
          name: '<script>alert("xss")</script>',
          filePath: "a.ts",
          startLine: 1,
          endLine: 1,
          complexity: 1,
          coverage: 1,
          crapScore: 1,
          isCrappy: false,
        },
      ],
      totalFunctions: 1,
      crappyCount: 0,
      crappyPercent: 0,
      isFlagged: false,
    };
    const output = renderHtml(xssSummary);
    expect(output).not.toContain('<script>alert("xss")</script>');
    expect(output).toContain("&lt;script&gt;");
  });
});
