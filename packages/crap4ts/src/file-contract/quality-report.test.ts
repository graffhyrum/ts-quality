import { describe, expect, test } from "bun:test";
import { buildQualityReport } from "./quality-report";

describe("quality-report", () => {
  test("builds sorted report rows", () => {
    const report = buildQualityReport(
      [
        { path: "src/b.ts", violations: 1, baseline: 0, status: "fail" },
        { path: "src/a.ts", violations: 0, baseline: 0, status: "ok" },
      ],
      1,
    );
    expect(report.tool).toBe("crap4ts");
    expect(report.files.map((f) => f.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(report.totals.failed).toBe(1);
    expect(report.ok).toBe(false);
  });
});
