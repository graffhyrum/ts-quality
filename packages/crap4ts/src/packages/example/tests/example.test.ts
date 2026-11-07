import { describe, expect, test } from "bun:test";
import { doubleExample } from "../index";

describe("example", () => {
  test("doubles a number", () => {
    expect(doubleExample(3)).toBe(6);
  });
});
