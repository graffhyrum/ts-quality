import { test, expect } from "bun:test";
import { double } from "../index";

test("example doubles a number", () => {
  expect(double(2)).toBe(4);
});
