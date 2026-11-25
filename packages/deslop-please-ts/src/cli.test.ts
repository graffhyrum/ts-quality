import { test, expect } from "bun:test";
import { spawnSync } from "bun";
import path from "node:path";
import {
  main,
  numericFlag,
  parseOptions,
  run,
  usage,
  type CliIo,
} from "./cli.ts";

const SAMPLE = path.resolve("tests/fixtures/sample");
const CLEAN = path.resolve("tests/fixtures/clean");

function runCli(args: readonly string[]): {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
} {
  const result = spawnSync(["bun", "bin/deslop.ts", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: result.exitCode,
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
  };
}

function recordingIo(): {
  io: CliIo;
  out: string[];
  err: string[];
  codes: number[];
} {
  const out: string[] = [];
  const err: string[] = [];
  const codes: number[] = [];
  return {
    io: {
      out: (text) => out.push(text),
      err: (text) => err.push(text),
      exit: (code) => codes.push(code),
    },
    out,
    err,
    codes,
  };
}

test("cli exits 0 on a clean project", () => {
  const result = runCli([CLEAN]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).not.toContain("error[");
});

test("cli exits 1 and reports a field leak on the sloppy project", () => {
  const result = runCli([SAMPLE]);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("error[field-leak]");
  expect(result.stdout).toContain("items");
});

test("cli prints usage on --help", () => {
  const result = runCli(["--help"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("usage: deslop-please-ts");
  expect(result.stdout).toContain("exit codes:");
});

test("cli prints the extracted model with --model", () => {
  const result = runCli(["--model", SAMPLE]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Modules (2)");
  expect(result.stdout).toContain("Store");
  expect(result.stdout).toContain("Imports");
});

test("cli exits 2 when no tsconfig is found", () => {
  const result = runCli(["/tmp/opencode/deslop-no-config-here"]);
  expect(result.exitCode).toBe(2);
  expect(result.stderr).toContain("no tsconfig.json found");
});

test("cli honours the --max-lines threshold", () => {
  const result = runCli([CLEAN, "--max-lines", "1"]);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("error[long-file]");
});

test("run returns a clean result for a clean project", () => {
  expect(run([CLEAN])).toEqual({ exitCode: 0, stdout: "", stderr: "" });
});

test("run returns diagnostics for the sloppy project", () => {
  const result = run([SAMPLE]);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("error[field-leak]");
  expect(result.stderr).toBe("");
});

test("run handles -h as well as --help", () => {
  expect(run(["-h"]).stdout).toContain("usage:");
});

test("run prints the model with --model", () => {
  expect(run(["--model", SAMPLE]).stdout).toContain("Modules (2)");
});

test("run returns exit 2 on a missing tsconfig", () => {
  const result = run(["/tmp/opencode/deslop-no-config-here"]);
  expect(result.exitCode).toBe(2);
  expect(result.stderr).toContain("no tsconfig.json found");
});

test("run honours a custom --max-lines", () => {
  expect(run([CLEAN, "--max-lines", "1"]).exitCode).toBe(1);
});

test("main writes stdout and calls exit with the result code", () => {
  const recorded = recordingIo();
  main(["--help"], recorded.io);
  expect(recorded.codes).toEqual([0]);
  expect(recorded.out.join("")).toContain("usage:");
  expect(recorded.err).toEqual([]);
});

test("main writes stderr on a bad path", () => {
  const recorded = recordingIo();
  main(["/tmp/opencode/deslop-no-config-here"], recorded.io);
  expect(recorded.codes).toEqual([2]);
  expect(recorded.err.join("")).toContain("no tsconfig.json found");
});

test("numericFlag returns null for a missing flag", () => {
  expect(numericFlag(["--max-lines"], "--held-in-mind")).toBeNull();
});

test("numericFlag returns null when the value is missing", () => {
  expect(numericFlag(["--max-lines"], "--max-lines")).toBeNull();
});

test("numericFlag rejects non-positive and non-numeric values", () => {
  expect(numericFlag(["--max-lines", "0"], "--max-lines")).toBeNull();
  expect(numericFlag(["--max-lines", "abc"], "--max-lines")).toBeNull();
});

test("parseOptions falls back to defaults for absent flags", () => {
  const options = parseOptions([CLEAN]);
  expect(options.heldInMind).toBe(7);
  expect(options.maxLines).toBe(300);
});

test("usage lists all six checks", () => {
  const text = usage();
  for (const check of [
    "module-cycle",
    "tangle",
    "field-leak",
    "shallow-module",
    "wide-directory",
    "long-file",
  ]) {
    expect(text).toContain(check);
  }
});
