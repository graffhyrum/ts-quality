import { test, expect, describe } from "bun:test";
import { parseCoverage } from "./resolve";
import fs from "fs";
import path from "path";

describe("coverage format detection", () => {
  test("detects istanbul from JSON content", async () => {
    const content = fs.readFileSync(path.resolve("test/fixtures/coverage-istanbul.json"), "utf-8");
    const result = await parseCoverage(content, "coverage-final.json", undefined);
    expect(result).toHaveLength(1);
  });

  test("detects lcov from .info extension", async () => {
    const content = `SF:foo.ts\nDA:1,1\nend_of_record\n`;
    const result = await parseCoverage(content, "coverage.info", undefined);
    expect(result).toHaveLength(1);
  });

  test("detects lcov from content", async () => {
    const content = `SF:foo.ts\nDA:1,1\nend_of_record\n`;
    const result = await parseCoverage(content, "coverage.txt", undefined);
    expect(result).toHaveLength(1);
  });

  test("parses an explicit v8 report against a real source file", async () => {
    const content = JSON.stringify({
      result: [
        {
          scriptId: "1",
          url: "src/coverage/resolve.ts",
          functions: [
            {
              functionName: "parseCoverage",
              ranges: [{ startOffset: 0, endOffset: 10, count: 1 }],
            },
          ],
        },
      ],
    });
    const result = await parseCoverage(content, "v8.json", "v8", { sourceRoot: process.cwd() });
    expect(result[0]?.filePath).toBe(path.resolve("src/coverage/resolve.ts"));
    expect(result[0]?.statements[0]).toEqual({ startLine: 1, endLine: 1, hits: 1 });
  });

  test("detects v8 from content", async () => {
    const content = JSON.stringify({
      result: [
        {
          scriptId: "1",
          url: "src/coverage/resolve.ts",
          functions: [
            {
              functionName: "parseCoverage",
              ranges: [{ startOffset: 0, endOffset: 10, count: 3 }],
            },
          ],
        },
      ],
    });
    const result = await parseCoverage(content, "coverage.json", undefined, {
      sourceRoot: process.cwd(),
    });
    expect(result[0]?.statements[0]?.hits).toBe(3);
  });

  test("respects explicit format override", async () => {
    const content = fs.readFileSync(path.resolve("test/fixtures/coverage-istanbul.json"), "utf-8");
    const result = await parseCoverage(content, "data.json", "istanbul");
    expect(result).toHaveLength(1);
  });
});
