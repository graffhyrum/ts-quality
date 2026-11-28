import { test, expect, describe } from "bun:test";
import { parseCli } from "./cli";
import { CrapError } from "./types";

async function captureExit(argv: string[]): Promise<string[]> {
  const logs: string[] = [];
  const log = console.log;
  const exit = process.exit;
  console.log = (message?: unknown) => {
    logs.push(String(message));
  };
  process.exit = ((status?: number) => {
    throw new Error(`exit ${status ?? 0}`);
  }) as typeof process.exit;
  try {
    await expect(parseCli(argv)).rejects.toThrow("exit 0");
  } finally {
    console.log = log;
    process.exit = exit;
  }
  return logs;
}

describe("CLI parsing", () => {
  test("parses defaults with no args", async () => {
    const config = await parseCli(["node", "crap4ts"]);
    expect(config.coveragePath).toBe("./coverage/coverage-final.json");
    expect(config.threshold).toBe(30);
    expect(config.projectThreshold).toBe(0);
    expect(config.output).toBe("table");
    expect(config.sort).toBe("score");
    expect(config.showAll).toBe(false);
  });

  test("parses coverage path", async () => {
    const config = await parseCli(["node", "crap4ts", "-c", "my-cov.json"]);
    expect(config.coveragePath).toBe("my-cov.json");
  });

  test("parses format", async () => {
    const config = await parseCli(["node", "crap4ts", "-f", "lcov"]);
    expect(config.format).toBe("lcov");
  });

  test("throws on invalid format", async () => {
    await expect(parseCli(["node", "crap4ts", "-f", "bad"])).rejects.toThrow(CrapError);
  });

  test("unknown option throws the parser error", async () => {
    await expect(parseCli(["node", "crap4ts", "--nope"])).rejects.toThrow(
      "Unknown option '--nope'",
    );
  });

  test("missing option value throws the parser error", async () => {
    await expect(parseCli(["node", "crap4ts", "-c"])).rejects.toThrow("argument missing");
  });

  test("throws on invalid output", async () => {
    await expect(parseCli(["node", "crap4ts", "-o", "bad"])).rejects.toThrow(CrapError);
  });

  test("throws on invalid sort", async () => {
    await expect(parseCli(["node", "crap4ts", "--sort", "bad"])).rejects.toThrow(CrapError);
  });

  test("throws on invalid threshold", async () => {
    await expect(parseCli(["node", "crap4ts", "-t", "abc"])).rejects.toThrow(CrapError);
  });

  test("parses a numeric threshold", async () => {
    expect((await parseCli(["node", "crap4ts", "-t", "15"])).threshold).toBe(15);
    expect(
      (await parseCli(["node", "crap4ts", "--project-threshold", "12"])).projectThreshold,
    ).toBe(12);
  });

  test("--help prints usage and exits 0", async () => {
    const logs = await captureExit(["node", "crap4ts", "--help"]);
    expect(logs[0]).toContain("Usage: crap4ts");
    expect(logs[0]).toContain("--coverage");
    expect(logs[0]).toContain("--files-from");
  });

  test("--version prints the package version and exits 0", async () => {
    const pkg = (await Bun.file("package.json").json()) as { version: string };
    const logs = await captureExit(["node", "crap4ts", "--version"]);
    expect(logs).toEqual([pkg.version]);
  });

  test("parses positional files", async () => {
    const config = await parseCli(["node", "crap4ts", "a.ts", "b.ts"]);
    expect(config.files).toEqual(["a.ts", "b.ts"]);
    expect(config.targeting.legacyPresent).toBe(true);
  });

  test("parses --all flag", async () => {
    const config = await parseCli(["node", "crap4ts", "--all"]);
    expect(config.showAll).toBe(true);
  });

  test("--only-crappy sets deprecated flag", async () => {
    const config = await parseCli(["node", "crap4ts", "--only-crappy"]);
    expect(config.onlyCrappyDeprecated).toBe(true);
  });

  test("--all with --only-crappy sets both flags", async () => {
    const config = await parseCli(["node", "crap4ts", "--all", "--only-crappy"]);
    expect(config.showAll).toBe(true);
    expect(config.onlyCrappyDeprecated).toBe(true);
  });

  test("--init sets init to true", async () => {
    const config = await parseCli(["node", "crap4ts", "--init"]);
    expect(config.init).toBe(true);
  });

  test("no --init sets init to false", async () => {
    const config = await parseCli(["node", "crap4ts"]);
    expect(config.init).toBe(false);
  });
});
