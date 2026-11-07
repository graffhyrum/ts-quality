import { test, expect, describe } from "bun:test";
import { parseIstanbul } from "./istanbul";
import fs from "fs";
import path from "path";

describe("Istanbul parser", () => {
  test("parses coverage-final.json fixture", () => {
    const content = fs.readFileSync(path.resolve("test/fixtures/coverage-istanbul.json"), "utf-8");
    const result = parseIstanbul(content, "coverage-istanbul.json");
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe("test/fixtures/simple.ts");
    expect(result[0].statements.length).toBe(7);
  });

  test("statement hits are correct", () => {
    const content = fs.readFileSync(path.resolve("test/fixtures/coverage-istanbul.json"), "utf-8");
    const result = parseIstanbul(content, "coverage-istanbul.json");
    const hits = result[0].statements.map((s) => s.hits);
    expect(hits).toEqual([1, 1, 1, 0, 1, 1, 0]);
  });
});
