import { expect, test } from "bun:test";
import { isTestFile } from "./test-file.ts";

test("recognizes files under __tests__ directories", () => {
  expect(isTestFile("src/__tests__/helper.ts")).toBe(true);
  expect(isTestFile("src/__tests__/nested/helper.ts")).toBe(true);
  expect(isTestFile("src\\__tests__\\helper.ts")).toBe(true);
});

test("preserves suffix matching without treating similar directories as tests", () => {
  expect(isTestFile("src/helper.test.ts")).toBe(true);
  expect(isTestFile("src/__tests-extra/helper.ts")).toBe(false);
});
