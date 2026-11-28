import { test, expect, describe } from "bun:test";
import { discoverFullScanKeys } from "./discovery.ts";
import { hasExplicitListExtension, isExcludedFromDiscovery } from "./extensions.ts";
import { buildQualityReport, baselineWouldFail } from "./quality-report.ts";
import { buildScopedKeys, resolveSelectionMode } from "./selection.ts";
import { formatQualityReportJson } from "./quality-report.ts";

describe("file-contract units", () => {
  test("extension helpers", () => {
    expect(hasExplicitListExtension("a.ts")).toBe(true);
    expect(hasExplicitListExtension("a.js")).toBe(false);
    expect(isExcludedFromDiscovery("src/a.test.ts")).toBe(true);
    expect(isExcludedFromDiscovery("src/a.ts")).toBe(false);
  });

  test("selection mode resolution", () => {
    expect(
      resolveSelectionMode({
        filesFlags: [],
        filesFromPresent: false,
        filesFromEmpty: false,
        legacySourcePresent: false,
      }),
    ).toBe("full");
    expect(
      resolveSelectionMode({
        filesFlags: [],
        filesFromPresent: true,
        filesFromEmpty: true,
        legacySourcePresent: false,
      }),
    ).toBe("full");
    expect(
      resolveSelectionMode({
        filesFlags: ["a.ts"],
        filesFromPresent: false,
        filesFromEmpty: false,
        legacySourcePresent: false,
      }),
    ).toBe("scoped");
  });

  test("quality report baseline gating", () => {
    const violations = new Map([["src/a.ts", 1]]);
    const withBaseline = buildQualityReport(
      violations,
      { version: 1, files: { "src/a.ts": 2 } },
      1,
    );
    expect(withBaseline.exitCode).toBe(0);
    expect(withBaseline.ok).toBe(true);
    const withoutBaseline = buildQualityReport(violations, null, 1);
    expect(withoutBaseline.exitCode).toBe(1);
    expect(baselineWouldFail(violations, null, ["src/a.ts"])).toBe(true);
    expect(baselineWouldFail(violations, { version: 1, files: {} }, ["src/a.ts"])).toBe(true);
    const over = buildQualityReport(
      new Map([["src/a.ts", 3]]),
      { version: 1, files: { "src/a.ts": 1 } },
      0,
    );
    expect(over.exitCode).toBe(1);
    expect(over.ok).toBe(false);
    const errOnly = buildQualityReport(new Map(), { version: 1, files: {} }, 3);
    expect(errOnly.exitCode).toBe(3);
    expect(
      baselineWouldFail(new Map([["src/a.ts", 0]]), { version: 1, files: { "src/a.ts": 0 } }, [
        "src/a.ts",
      ]),
    ).toBe(false);
    expect(formatQualityReportJson(over)).toContain("mutate4ts");
    expect(
      baselineWouldFail(new Map([["src/a.ts", 0]]), { version: 1, files: { "src/a.ts": 1 } }, [
        "src/a.ts",
      ]),
    ).toBe(false);
    const failAndError = buildQualityReport(
      new Map([["src/a.ts", 2]]),
      { version: 1, files: { "src/a.ts": 1 } },
      3,
    );
    expect(failAndError.exitCode).toBe(3);
  });

  test("buildScopedKeys skips bad extension and missing paths", async () => {
    const dir = await createDiscoveryFixture();
    const cwd = process.cwd();
    try {
      process.chdir(dir);
      const keys = await buildScopedKeys(["src/ok.ts", "src/ok.js", "src/missing.ts"]);
      expect(keys).toEqual(["src/ok.ts"]);
    } finally {
      process.chdir(cwd);
      await Bun.$`rm -rf ${dir}`;
    }
  });

  test("discoverFullScanKeys excludes test and declaration files", async () => {
    const dir = await createDiscoveryFixture();
    const cwd = process.cwd();
    try {
      process.chdir(dir);
      const keys = await discoverFullScanKeys();
      expect(keys).toContain("src/ok.ts");
      expect(keys).not.toContain("src/ok.test.ts");
      expect(keys).not.toContain("src/types.d.ts");
    } finally {
      process.chdir(cwd);
      await Bun.$`rm -rf ${dir}`;
    }
  });
});

async function createDiscoveryFixture(): Promise<string> {
  const dir = await Bun.$`mktemp -d`.text();
  const trimmed = dir.trim();
  await Bun.write(`${trimmed}/src/ok.ts`, "export const x = 1;\n");
  await Bun.write(`${trimmed}/src/ok.test.ts`, 'import "./ok.ts";\n');
  await Bun.write(`${trimmed}/src/types.d.ts`, "export type T = string;\n");
  return trimmed;
}
