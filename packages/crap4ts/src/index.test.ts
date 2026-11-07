import { describe, expect, test } from "bun:test";
import { runCli } from "./index";

describe("CLI process exit", () => {
  test("unknown option exits 2", async () => {
    const proc = Bun.spawn([process.execPath, "src/index.ts", "--nope"], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    const stderr = await new Response(proc.stderr).text();
    expect(await proc.exited).toBe(2);
    expect(stderr).toContain("Unknown option '--nope'");
    expect(stderr).not.toContain("ERR_PARSE_ARGS_UNKNOWN_OPTION");
  });

  test("missing option value exits 2", async () => {
    const proc = Bun.spawn([process.execPath, "src/index.ts", "-c"], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    const stderr = await new Response(proc.stderr).text();
    expect(await proc.exited).toBe(2);
    expect(stderr).toContain("argument missing");
  });
});

describe("runCli", () => {
  test("unknown option returns 2", async () => {
    const stderr = await captureError(async () => {
      expect(await runCli(["bun", "crap4ts", "--nope"])).toBe(2);
    });
    expect(stderr).toContain("Unknown option '--nope'");
  });

  test("a missing coverage file returns 2", async () => {
    const stderr = await captureError(async () => {
      expect(await runCli(["bun", "crap4ts", "-c", "coverage/does-not-exist.json"])).toBe(2);
    });
    expect(stderr).toContain("Coverage file not found");
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
