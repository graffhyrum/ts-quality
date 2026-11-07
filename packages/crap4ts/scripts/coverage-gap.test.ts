import { describe, expect, test } from "bun:test";
import { spawnCoverage } from "./coverage-gap";
import { parseCoverageGap, reportCoverageGap } from "./coverage-report";

const header = "File | % Funcs | % Lines |\n";

describe("parseCoverageGap", () => {
  test("returns null when the All files row is missing", () => {
    expect(parseCoverageGap("")).toBeNull();
    expect(parseCoverageGap(`${header}src/a.ts | 100.00 | 100.00 |`)).toBeNull();
  });

  test("lists a file under 95 and keeps the All files summary", () => {
    const text = `${header}All files | 99.86 | 99.92 |\nsrc/a.ts | 80.00 | 100.00 |\n`;
    expect(parseCoverageGap(text)).toEqual({
      summary: "all funcs=99.86 lines=99.92",
      failing: ["src/a.ts funcs=80.00 lines=100.00"],
    });
  });

  test("returns no failing files when every file is at the gate", () => {
    const text = `${header}All files | 100.00 | 100.00 |\nsrc/a.ts | 100.00 | 95.00 |\n`;
    expect(parseCoverageGap(text)).toEqual({
      summary: "all funcs=100.00 lines=100.00",
      failing: [],
    });
  });
});

function proc(stdout: string, stderr: string, exitCode: number) {
  return {
    stdout: new Blob([stdout]).stream(),
    stderr: new Blob([stderr]).stream(),
    exited: Promise.resolve(exitCode),
  };
}

describe("reportCoverageGap", () => {
  test("exits 1 when the coverage table is missing", async () => {
    const code = await reportCoverageGap(() => proc("", "", 0));
    expect(code).toBe(1);
  });

  test("spawns this executable and exits 0 when the table is clean", async () => {
    let argv: string[] = [];
    const text = "All files | 100.00 | 100.00 |\nsrc/a.ts | 100.00 | 100.00 |\n";
    const code = await reportCoverageGap((next) => {
      argv = next;
      return proc(text, "", 0);
    });
    expect(argv[0]).toBe(process.execPath);
    expect(argv.slice(1)).toEqual(["test", "--coverage"]);
    expect(code).toBe(0);
  });

  test("exits 1 when a file is under the gate", async () => {
    const text = "All files | 90.00 | 90.00 |\nsrc/a.ts | 80.00 | 90.00 |\n";
    expect(await reportCoverageGap(() => proc(text, "", 0))).toBe(1);
  });

  test("spawnCoverage runs the executable", async () => {
    const proc = spawnCoverage([process.execPath, "--version"]);
    expect(await proc.exited).toBe(0);
  });
});
