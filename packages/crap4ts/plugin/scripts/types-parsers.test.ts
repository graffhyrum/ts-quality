import { describe, expect, test } from "bun:test";
import { parseGateConfig, parseProjectSummary, parseTriageResult } from "./types";

describe("parseProjectSummary", () => {
  test("accepts a consistent summary", () => {
    expect(parseProjectSummary(summary())).toEqual(summary());
  });

  test.each([
    ["non-record", null],
    ["functions not an array", summary({ functions: {} })],
    ["negative totalFunctions", summary({ totalFunctions: -1 })],
    ["fractional crappyCount", summary({ crappyCount: 0.5 })],
    ["crappyPercent above 100", summary({ crappyPercent: 101 })],
    ["non-boolean isFlagged", summary({ isFlagged: "yes" })],
    ["invalid function entry", summary({ functions: [null] })],
    ["crappyCount disagrees with list", summary({ crappyCount: 0, crappyPercent: 0 })],
    ["more functions than total", summary({ functions: [fn(), fn({ isCrappy: false })], totalFunctions: 1 })],
    ["crappyCount above total", summary({ functions: [fn(), fn()], totalFunctions: 1, crappyCount: 2 })],
    ["percent disagrees with counts", summary({ totalFunctions: 2, crappyPercent: 100 })],
  ])("rejects %s", (_label, raw) => {
    expect(parseProjectSummary(raw)).toBeNull();
  });

  test.each([
    ["non-record function", "x"],
    ["unsafe name", fn({ name: "a;b" })],
    ["over-long name", fn({ name: "n".repeat(241) })],
    ["unsafe filePath", fn({ filePath: 1 })],
    ["startLine below 1", fn({ startLine: 0 })],
    ["endLine before startLine", fn({ startLine: 3, endLine: 2 })],
    ["complexity below 1", fn({ complexity: 0 })],
    ["coverage above 1", fn({ coverage: 2 })],
    ["negative crapScore", fn({ crapScore: -1 })],
    ["non-boolean isCrappy", fn({ isCrappy: 1 })],
  ])("rejects a function with %s", (_label, item) => {
    expect(parseProjectSummary(summary({ functions: [item] }))).toBeNull();
  });
});

describe("parseGateConfig", () => {
  test("accepts a valid config", () => {
    expect(parseGateConfig(gate())).toEqual(gate());
  });

  test.each([
    ["non-record", []],
    ["wrong version", gate({ version: 2 })],
    ["blank coverageCommand", gate({ coverageCommand: "  " })],
    ["unsafe coverageCommand", gate({ coverageCommand: "bun test | sh" })],
    ["unsafe crapArgs", gate({ crapArgs: ["a&b"] })],
    ["threshold above 1000", gate({ threshold: 1001 })],
    ["projectThreshold of 100", gate({ projectThreshold: 100 })],
  ])("rejects %s", (_label, raw) => {
    expect(parseGateConfig(raw)).toBeNull();
  });
});

describe("parseTriageResult report path", () => {
  test("rejects an over-long report path", () => {
    const raw = {
      version: 1,
      isFlagged: false,
      crappyPercent: 0,
      action: null,
      remaining: 0,
      report: "r".repeat(4097),
    };
    expect(parseTriageResult(raw, process.cwd())).toBeNull();
  });
});

function summary(overrides: Record<string, unknown> = {}) {
  return {
    functions: [fn()],
    totalFunctions: 1,
    crappyCount: 1,
    crappyPercent: 100,
    isFlagged: true,
    ...overrides,
  };
}

function fn(overrides: Record<string, unknown> = {}) {
  return {
    name: "f",
    filePath: "src/a.ts",
    startLine: 1,
    endLine: 2,
    complexity: 1,
    coverage: 0,
    crapScore: 2,
    isCrappy: true,
    ...overrides,
  };
}

function gate(overrides: Record<string, unknown> = {}) {
  return {
    version: 1 as const,
    coverageCommand: "bun test --coverage",
    crapArgs: ["-c", "coverage/lcov.info"],
    threshold: 30,
    projectThreshold: 5,
    ...overrides,
  };
}
