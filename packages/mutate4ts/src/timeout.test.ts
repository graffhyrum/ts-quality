import { test, expect, describe } from "bun:test";
import { computeTimeoutMs } from "./timeout.ts";
import { runTestCommand } from "./runner.ts";

describe("computeTimeoutMs", () => {
  test("a fractional baseline over the floor yields an integer timeout", () => {
    const timeoutMs = computeTimeoutMs(5000.5, 1);
    expect(Number.isInteger(timeoutMs)).toBe(true);
    expect(timeoutMs).toBe(5001);
  });

  test("a fractional product from the timeout factor yields an integer timeout", () => {
    expect(computeTimeoutMs(4000.25, 2)).toBe(8001);
  });

  test("a short baseline falls back to the 5000 ms floor", () => {
    expect(computeTimeoutMs(12.7, 3)).toBe(5000);
  });

  test("the computed timeout is accepted by the runner", () => {
    const result = runTestCommand(["true"], computeTimeoutMs(5000.5, 1));
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });
});
