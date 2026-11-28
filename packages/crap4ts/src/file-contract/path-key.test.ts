import { describe, expect, test } from "bun:test";
import path from "node:path";
import { normalizeBaselineKey, UsageError } from "./path-key";

describe("normalizeBaselineKey", () => {
  test("normalizes relative paths", () => {
    expect(normalizeBaselineKey("./src/a.ts")).toBe("src/a.ts");
    expect(normalizeBaselineKey("src\\b.ts")).toBe("src/b.ts");
  });

  test("rejects invalid characters", () => {
    expect(() => normalizeBaselineKey("bad\0path")).toThrow(UsageError);
  });

  test("rejects escaping paths", () => {
    expect(() => normalizeBaselineKey("..\\outside.ts")).toThrow(UsageError);
  });

  test("accepts absolute paths within cwd", () => {
    expect(normalizeBaselineKey(path.resolve("src/a.ts"))).toBe("src/a.ts");
  });
});
