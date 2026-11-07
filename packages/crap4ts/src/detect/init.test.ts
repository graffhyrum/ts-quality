import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { detectRunners } from "./index";
import { runInit } from "./init";

describe("runInit", () => {
  test("an empty directory has no runner and returns 1", async () => {
    const dir = mkdtempSync(join(tmpdir(), "crap-init-"));
    try {
      const stderr = await captureError(async () => {
        expect(await detectRunners(dir)).toEqual([]);
        expect(await runInit(dir)).toBe(1);
      });
      expect(stderr).toContain("No supported test runner detected.");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a bun project writes bunfig.toml and returns 0", async () => {
    const dir = mkdtempSync(join(tmpdir(), "crap-init-"));
    await Bun.write(
      join(dir, "package.json"),
      JSON.stringify({ name: "fixture", scripts: { test: "bun test" } }),
    );
    const logs: string[] = [];
    const log = console.log;
    console.log = (message?: unknown) => {
      logs.push(String(message));
    };
    try {
      expect((await detectRunners(dir)).map((runner) => runner.name)).toEqual(["bun"]);
      expect(await runInit(dir)).toBe(0);
      expect(await Bun.file(join(dir, "bunfig.toml")).text()).toContain("coverage = true");
    } finally {
      console.log = log;
      rmSync(dir, { recursive: true, force: true });
    }
    expect(logs.join("\n")).toContain("Written:");
  });
});

async function captureError(body: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  const error = console.error;
  console.error = (message?: unknown) => {
    lines.push(String(message));
  };
  try {
    await body();
  } finally {
    console.error = error;
  }
  return lines.join("\n");
}
