import { test, expect, describe } from "bun:test";
import { renderJson } from "./json";
import type { ProjectSummary } from "../types";

describe("json reporter", () => {
  test("reflects filtered functions with full totalFunctions", () => {
    const filtered: ProjectSummary = {
      functions: [
        {
          name: "bad",
          filePath: "a.ts",
          startLine: 1,
          endLine: 5,
          complexity: 10,
          coverage: 0,
          crapScore: 110,
          isCrappy: true,
        },
      ],
      totalFunctions: 5,
      crappyCount: 1,
      crappyPercent: 20,
      isFlagged: true,
    };
    const output = renderJson(filtered);
    const parsed = JSON.parse(output);
    expect(parsed.functions).toHaveLength(1);
    expect(parsed.totalFunctions).toBe(5);
  });

  test("produces valid JSON with all fields", () => {
    const summary: ProjectSummary = {
      functions: [
        {
          name: "foo",
          filePath: "a.ts",
          startLine: 1,
          endLine: 3,
          complexity: 5,
          coverage: 0.8,
          crapScore: 3.2,
          isCrappy: false,
        },
      ],
      totalFunctions: 1,
      crappyCount: 0,
      crappyPercent: 0,
      isFlagged: false,
    };
    const output = renderJson(summary);
    const parsed = JSON.parse(output);
    expect(parsed.totalFunctions).toBe(1);
    expect(parsed.functions[0].name).toBe("foo");
    expect(parsed.isFlagged).toBe(false);
  });
});
