import { test, expect, describe } from "bun:test";
import {
  baselineWouldFail,
  buildQualityReport,
  formatQualityReportJson,
} from "./quality-report.ts";

describe("quality-report", () => {
  test("baseline pass and fail exit handling", () => {
    const violations = new Map([["a.ts", 1]]);
    const within = buildQualityReport(violations, { version: 1, files: { "a.ts": 2 } }, 3);
    expect(within.exitCode).toBe(3);
    const fail = buildQualityReport(
      new Map([["a.ts", 5]]),
      { version: 1, files: { "a.ts": 1 } },
      1,
    );
    expect(fail.exitCode).toBe(1);
    expect(
      baselineWouldFail(
        new Map([["a.ts", 5]]),
        fail.files.length ? { version: 1, files: { "a.ts": 1 } } : null,
        ["a.ts"],
      ),
    ).toBe(true);
    expect(
      baselineWouldFail(new Map([["b.ts", 0]]), { version: 1, files: { "b.ts": 0 } }, ["b.ts"]),
    ).toBe(false);
    const multi = buildQualityReport(
      new Map([
        ["b.ts", 1],
        ["a.ts", 3],
      ]),
      { version: 1, files: { "a.ts": 1, "b.ts": 2 } },
      0,
    );
    expect(multi.files[0]?.path).toBe("a.ts");
    expect(multi.totals.failed).toBe(1);
    expect(multi.totals.violations).toBe(4);
    expect(formatQualityReportJson(within).endsWith("\n")).toBe(true);
  });
});
