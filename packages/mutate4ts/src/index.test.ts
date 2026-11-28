import { test, expect } from "bun:test";
import { main } from "./cli-run.ts";

test("entry module loads", () => {
  expect(typeof main).toBe("function");
  void import("./index.ts");
});
