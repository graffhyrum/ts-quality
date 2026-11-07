import { describe, expect, test } from "bun:test";
import { classify } from "./classify";
import type { ProjectSummary } from "./types";

function summary(
  partial: Partial<ProjectSummary> & {
    functions: ProjectSummary["functions"];
  },
): ProjectSummary {
  return {
    totalFunctions: partial.functions.length,
    crappyCount: partial.functions.filter((f) => f.isCrappy).length,
    crappyPercent: partial.crappyPercent ?? 0,
    isFlagged: partial.isFlagged ?? false,
    functions: partial.functions,
  };
}

describe("classify", () => {
  test("complexity 30 coverage 1 isCrappy flagged → split", () => {
    const result = classify(
      summary({
        isFlagged: true,
        crappyPercent: 10,
        functions: [
          {
            name: "big",
            filePath: "a.ts",
            startLine: 1,
            endLine: 40,
            complexity: 30,
            coverage: 1,
            crapScore: 30,
            isCrappy: true,
          },
        ],
      }),
      30,
    );
    expect(result).toEqual({
      isFlagged: true,
      crappyPercent: 10,
      actions: [
        {
          kind: "split",
          filePath: "a.ts",
          startLine: 1,
          endLine: 40,
          name: "big",
          complexity: 30,
          coverage: 1,
          crapScore: 30,
          reference: "split.md",
        },
      ],
    });
  });

  test("complexity 5 coverage 0 isCrappy flagged → test", () => {
    const result = classify(
      summary({
        isFlagged: true,
        crappyPercent: 10,
        functions: [
          {
            name: "small",
            filePath: "b.ts",
            startLine: 2,
            endLine: 10,
            complexity: 5,
            coverage: 0,
            crapScore: 30,
            isCrappy: true,
          },
        ],
      }),
      30,
    );
    expect(result).toEqual({
      isFlagged: true,
      crappyPercent: 10,
      actions: [
        {
          kind: "test",
          filePath: "b.ts",
          startLine: 2,
          endLine: 10,
          name: "small",
          complexity: 5,
          coverage: 0,
          crapScore: 30,
          reference: "test.md",
        },
      ],
    });
  });

  test("coverage null is fix-join not split", () => {
    const result = classify(
      summary({
        isFlagged: true,
        crappyPercent: 10,
        functions: [
          {
            name: "unjoined",
            filePath: "c.ts",
            startLine: 3,
            endLine: 20,
            complexity: 10,
            coverage: null,
            crapScore: 110,
            isCrappy: true,
          },
        ],
      }),
      30,
    );
    expect(result).toEqual({
      isFlagged: true,
      crappyPercent: 10,
      actions: [
        {
          kind: "fix-join",
          filePath: "c.ts",
          startLine: 3,
          endLine: 20,
          name: "unjoined",
          complexity: 10,
          coverage: null,
          crapScore: 110,
          reference: "join.md",
        },
      ],
    });
  });

  test("isCrappy false is omitted", () => {
    const result = classify(
      summary({
        isFlagged: true,
        crappyPercent: 10,
        functions: [
          {
            name: "ok",
            filePath: "d.ts",
            startLine: 1,
            endLine: 5,
            complexity: 4,
            coverage: 0,
            crapScore: 20,
            isCrappy: false,
          },
        ],
      }),
      30,
    );
    expect(result).toEqual({
      isFlagged: true,
      crappyPercent: 10,
      actions: [],
    });
  });

  test("sorts by crapScore descending; remaining 1 when only first printed", () => {
    const result = classify(
      summary({
        isFlagged: true,
        crappyPercent: 20,
        functions: [
          {
            name: "mild",
            filePath: "e.ts",
            startLine: 10,
            endLine: 20,
            complexity: 5,
            coverage: 0,
            crapScore: 30,
            isCrappy: true,
          },
          {
            name: "worst",
            filePath: "f.ts",
            startLine: 1,
            endLine: 50,
            complexity: 10,
            coverage: null,
            crapScore: 110,
            isCrappy: true,
          },
        ],
      }),
      30,
    );
    expect(result.actions).toEqual([
      {
        kind: "fix-join",
        filePath: "f.ts",
        startLine: 1,
        endLine: 50,
        name: "worst",
        complexity: 10,
        coverage: null,
        crapScore: 110,
        reference: "join.md",
      },
      {
        kind: "test",
        filePath: "e.ts",
        startLine: 10,
        endLine: 20,
        name: "mild",
        complexity: 5,
        coverage: 0,
        crapScore: 30,
        reference: "test.md",
      },
    ]);
    expect(result.actions.length - 1).toBe(1);
  });

  test("isFlagged false empties default actions; --every still returns", () => {
    const s = summary({
      isFlagged: false,
      crappyPercent: 5,
      functions: [
        {
          name: "lone",
          filePath: "g.ts",
          startLine: 1,
          endLine: 8,
          complexity: 5,
          coverage: 0,
          crapScore: 30,
          isCrappy: true,
        },
      ],
    });
    expect(classify(s, 30)).toEqual({
      isFlagged: false,
      crappyPercent: 5,
      actions: [],
    });
    expect(classify(s, 30, true)).toEqual({
      isFlagged: false,
      crappyPercent: 5,
      actions: [
        {
          kind: "test",
          filePath: "g.ts",
          startLine: 1,
          endLine: 8,
          name: "lone",
          complexity: 5,
          coverage: 0,
          crapScore: 30,
          reference: "test.md",
        },
      ],
    });
  });

  test("crappyPercent 5 isFlagged false stays empty; trust summary", () => {
    const result = classify(
      summary({
        isFlagged: false,
        crappyPercent: 5,
        functions: [
          {
            name: "border",
            filePath: "h.ts",
            startLine: 1,
            endLine: 4,
            complexity: 5,
            coverage: 0,
            crapScore: 30,
            isCrappy: true,
          },
        ],
      }),
      30,
    );
    expect(result).toEqual({
      isFlagged: false,
      crappyPercent: 5,
      actions: [],
    });
  });

  test("equal crap scores sort by start line, then path, then name", () => {
    const fn = (
      overrides: Partial<ProjectSummary["functions"][number]>,
    ): ProjectSummary["functions"][number] => ({
      name: "a",
      filePath: "a.ts",
      startLine: 1,
      endLine: 2,
      complexity: 5,
      coverage: 0,
      crapScore: 30,
      isCrappy: true,
      ...overrides,
    });
    const flagged = { isFlagged: true, crappyPercent: 100 };

    const byLine = classify(
      summary({
        ...flagged,
        functions: [fn({ name: "later", startLine: 20 }), fn({ name: "earlier", startLine: 10 })],
      }),
      30,
    );
    expect(byLine.actions.map((action) => action.name)).toEqual(["earlier", "later"]);

    const byPath = classify(
      summary({
        ...flagged,
        functions: [
          fn({ name: "same", filePath: "z.ts", startLine: 4 }),
          fn({ name: "same", filePath: "a.ts", startLine: 4 }),
        ],
      }),
      30,
    );
    expect(byPath.actions.map((action) => action.filePath)).toEqual(["a.ts", "z.ts"]);

    const byName = classify(
      summary({
        ...flagged,
        functions: [
          fn({ name: "b", filePath: "a.ts", startLine: 4 }),
          fn({ name: "a", filePath: "a.ts", startLine: 4 }),
        ],
      }),
      30,
    );
    expect(byName.actions.map((action) => action.name)).toEqual(["a", "b"]);

    const tied = classify(
      summary({
        ...flagged,
        functions: [
          fn({ name: "same", filePath: "a.ts", startLine: 4 }),
          fn({ name: "same", filePath: "a.ts", startLine: 4 }),
        ],
      }),
      30,
    );
    expect(tied.actions.map((action) => action.name)).toEqual(["same", "same"]);
  });
});
