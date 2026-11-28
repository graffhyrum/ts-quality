import { test, expect, describe } from "bun:test";
import { normalizeBaselineKey, UsageError } from "./path-key.ts";

describe("normalizeBaselineKey", () => {
  test("strips leading ./ and normalizes slashes", () => {
    expect(normalizeBaselineKey("./src/a.ts")).toBe("src/a.ts");
    expect(normalizeBaselineKey("src\\b.ts")).toBe("src/b.ts");
  });

  test("rejects paths outside cwd", () => {
    expect(() => normalizeBaselineKey("/etc/passwd")).toThrow(UsageError);
  });

  test("rejects .. segments", () => {
    expect(() => normalizeBaselineKey("../escape.ts")).toThrow(UsageError);
  });

  test("rejects embedded newlines", () => {
    expect(() => normalizeBaselineKey("a\nb.ts")).toThrow(UsageError);
  });
});
