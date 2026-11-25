import { expect, test } from "bun:test";
import { runGate, type Step } from "./vet.ts";

const pass: Step = {
  label: "pass",
  argv: [process.execPath, "-e", "process.exit(0)"],
};

const fail: Step = {
  label: "fail",
  argv: [process.execPath, "-e", "process.exit(1)"],
};

test("stops at the first failing gate by default", async () => {
  const results = await runGate([pass, fail, pass], true, true);

  expect(results).toEqual([
    { label: "pass", exitCode: 0 },
    { label: "fail", exitCode: 1 },
  ]);
});

test("runs every gate when stop-on-failure is disabled", async () => {
  const results = await runGate([pass, fail, pass], false, true);

  expect(results).toEqual([
    { label: "pass", exitCode: 0 },
    { label: "fail", exitCode: 1 },
    { label: "pass", exitCode: 0 },
  ]);
});
