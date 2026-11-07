import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { isInsideRepo, parseTriageResult } from "./types";

const cwd = process.cwd();

function action(overrides: Record<string, unknown> = {}) {
  return {
    kind: "test",
    reference: "test.md",
    filePath: "src/coverage/v8.ts",
    name: "parseV8",
    startLine: 17,
    endLine: 28,
    complexity: 5,
    coverage: 0,
    crapScore: 30,
    ...overrides,
  };
}

function envelope(value: unknown) {
  return {
    version: 1,
    isFlagged: true,
    crappyPercent: 10,
    action: value,
    remaining: 1,
    report: ".crap4ts/report.json",
  };
}

describe("isInsideRepo", () => {
  test("rejects a symlink whose target is outside the repo", () => {
    const root = mkdtempSync(path.join(tmpdir(), "crap-root-"));
    const outside = mkdtempSync(path.join(tmpdir(), "crap-out-"));
    const secret = path.join(outside, "secret.ts");
    writeFileSync(secret, "export const x = 1;\n");
    mkdirSync(root, { recursive: true });
    const link = path.join(root, "link.ts");
    symlinkSync(secret, link);
    try {
      expect(isInsideRepo("link.ts", root)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("parseTriageResult", () => {
  test("accepts test, split, and fix-join actions", () => {
    const tested = parseTriageResult(envelope(action()), cwd);
    expect(tested?.action?.kind).toBe("test");
    expect(tested?.action?.coverage).toBe(0);

    const split = parseTriageResult(
      envelope(action({ kind: "split", reference: "split.md", coverage: 1 })),
      cwd,
    );
    expect(split?.action?.kind).toBe("split");

    const join = parseTriageResult(
      envelope(action({ kind: "fix-join", reference: "join.md", coverage: null })),
      cwd,
    );
    expect(join?.action?.coverage).toBeNull();
    expect(join?.action?.reference).toBe("join.md");
  });

  test("accepts a null action", () => {
    const result = parseTriageResult(
      { ...envelope(null), isFlagged: false, crappyPercent: 0, remaining: 0 },
      cwd,
    );
    expect(result?.action).toBeNull();
  });

  test("rejects a bad envelope", () => {
    expect(parseTriageResult(null, cwd)).toBeNull();
    expect(parseTriageResult({ ...envelope(null), version: 2 }, cwd)).toBeNull();
    expect(parseTriageResult({ ...envelope(null), isFlagged: "yes" }, cwd)).toBeNull();
    expect(parseTriageResult({ ...envelope(null), crappyPercent: -1 }, cwd)).toBeNull();
    expect(parseTriageResult({ ...envelope(null), crappyPercent: 101 }, cwd)).toBeNull();
    expect(parseTriageResult({ ...envelope(null), crappyPercent: Number.NaN }, cwd)).toBeNull();
    expect(parseTriageResult({ ...envelope(null), remaining: -1 }, cwd)).toBeNull();
    expect(parseTriageResult({ ...envelope(null), remaining: 1.5 }, cwd)).toBeNull();
    expect(parseTriageResult({ ...envelope(null), report: "bad;path" }, cwd)).toBeNull();
    expect(
      parseTriageResult({ ...envelope(null), report: "../outside/report.json" }, cwd),
    ).toBeNull();
    expect(parseTriageResult({ ...envelope(null), remaining: 5 }, cwd)).toBeNull();
  });

  test("rejects each invalid action field", () => {
    const bad = [
      "nope",
      action({ kind: "other", reference: "test.md" }),
      action({ reference: "split.md" }),
      action({ filePath: "../outside.ts" }),
      action({ filePath: "bad;path.ts" }),
      action({ filePath: 1 }),
      action({ name: "bad;name" }),
      action({ name: 1 }),
      action({ startLine: 0 }),
      action({ endLine: 1 }),
      action({ complexity: 0 }),
      action({ crapScore: -1 }),
      action({ kind: "fix-join", reference: "join.md", coverage: 0 }),
      action({ coverage: null }),
      action({ coverage: 1.5 }),
      action({ coverage: -0.1 }),
    ];
    for (const value of bad) {
      expect(parseTriageResult(envelope(value), cwd)).toBeNull();
    }
  });
});
