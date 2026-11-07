import { test, expect, describe } from "bun:test";
import { parseLcov } from "./lcov";
import fs from "fs";
import path from "path";

describe("LCOV parser", () => {
  test("parses lcov fixture", () => {
    const content = fs.readFileSync(path.resolve("test/fixtures/coverage.lcov"), "utf-8");
    const result = parseLcov(content);
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe("test/fixtures/simple.ts");
    expect(result[0].statements).toHaveLength(7);
  });

  test("DA lines produce correct line/hits", () => {
    const content = `SF:foo.ts\nDA:5,3\nDA:10,0\nend_of_record\n`;
    const result = parseLcov(content);
    expect(result[0].statements[0]).toEqual({
      startLine: 5,
      endLine: 5,
      hits: 3,
    });
    expect(result[0].statements[1]).toEqual({
      startLine: 10,
      endLine: 10,
      hits: 0,
    });
  });

  test("ignores unknown prefixes", () => {
    const content = `SF:foo.ts\nFN:1,bar\nFNDA:1,bar\nBRDA:1,0,0,1\nDA:1,1\nend_of_record\n`;
    const result = parseLcov(content);
    expect(result[0].statements).toHaveLength(1);
  });
});
