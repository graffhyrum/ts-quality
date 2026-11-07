import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { cliDeps, main, runGate } from "./gate";

async function logged(run: () => Promise<number>) {
  const out: string[] = [];
  const log = console.log;
  console.log = (message?: unknown) => {
    out.push(String(message));
  };
  try {
    return { code: await run(), out };
  } finally {
    console.log = log;
  }
}

const reportPath = join("/proj", ".crap4ts", "report.json");
const gatePath = join("/proj", ".crap4ts", "gate.json");

const validSummary = {
  functions: [
    {
      name: "f",
      filePath: "a.ts",
      startLine: 1,
      endLine: 2,
      complexity: 5,
      coverage: 0,
      crapScore: 30,
      isCrappy: true,
    },
  ],
  totalFunctions: 1,
  crappyCount: 1,
  crappyPercent: 100,
  isFlagged: true,
};

describe("runGate", () => {
  test("missing config → exit 2", async () => {
    const { result, exit } = await runGate({
      cwd: "/proj",
      runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      fs: {
        exists: () => false,
        readText: () => "",
        writeText: () => {},
        mkdirp: () => {},
      },
    });
    expect(exit).toBe(2);
    expect(result).toEqual({
      version: 1,
      exit: 2,
      isFlagged: false,
      crappyCount: 0,
      crappyPercent: 0,
      report: reportPath,
      message: "gate config is missing",
    });
  });

  test("crap4ts exit 0 → GateResult exit 0 isFlagged false", async () => {
    const writes: Record<string, string> = {};
    const config = {
      version: 1,
      coverageCommand: "bun test --coverage",
      crapArgs: ["-c", "coverage/lcov.info", "-f", "lcov"],
      threshold: 30,
      projectThreshold: 5,
    };
    const { result, exit } = await runGate({
      cwd: "/proj",
      runner: async (cmd, args) => {
        if (cmd === "bunx") {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              ...validSummary,
              isFlagged: false,
              crappyCount: 0,
              crappyPercent: 0,
              functions: [],
            }),
            stderr: "",
          };
        }
        expect([cmd, ...args]).toEqual(["bun", "test", "--coverage"]);
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      fs: {
        exists: (p) => p === gatePath,
        readText: () => JSON.stringify(config),
        writeText: (p, c) => {
          writes[p] = c;
        },
        mkdirp: () => {},
      },
    });
    expect(exit).toBe(0);
    expect(result.exit).toBe(0);
    expect(result.isFlagged).toBe(false);
    expect(JSON.parse(writes[reportPath]).crappyCount).toBe(0);
  });

  test("crap4ts exit 1 reads flag fields from report", async () => {
    const config = {
      version: 1,
      coverageCommand: "bun test --coverage",
      crapArgs: ["-c", "coverage/lcov.info", "-f", "lcov"],
      threshold: 30,
      projectThreshold: 5,
    };
    const { result, exit } = await runGate({
      cwd: "/proj",
      runner: async (cmd) => {
        if (cmd === "bunx") {
          return {
            exitCode: 1,
            stdout: JSON.stringify(validSummary),
            stderr: "",
          };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      fs: {
        exists: (p) => p === gatePath,
        readText: () => JSON.stringify(config),
        writeText: () => {},
        mkdirp: () => {},
      },
    });
    expect(exit).toBe(1);
    expect(result).toEqual({
      version: 1,
      exit: 1,
      isFlagged: true,
      crappyCount: 1,
      crappyPercent: 100,
      report: reportPath,
      message: "gate flagged",
    });
  });

  test("crap4ts exit 2 uses stderr message", async () => {
    const config = {
      version: 1,
      coverageCommand: "bun test --coverage",
      crapArgs: ["-c", "coverage/lcov.info", "-f", "lcov"],
      threshold: 30,
      projectThreshold: 5,
    };
    const { result, exit } = await runGate({
      cwd: "/proj",
      runner: async (cmd) => {
        if (cmd === "bunx") {
          return { exitCode: 2, stdout: "", stderr: "bad coverage path" };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      fs: {
        exists: (p) => p === gatePath,
        readText: () => JSON.stringify(config),
        writeText: () => {},
        mkdirp: () => {},
      },
    });
    expect(exit).toBe(2);
    expect(result.message).toBe("bad coverage path");
    expect(result.isFlagged).toBe(false);
  });

  test("crap4ts exit 2 hides an auth token in stderr", async () => {
    const config = {
      version: 1,
      coverageCommand: "bun test --coverage",
      crapArgs: ["-c", "coverage/lcov.info", "-f", "lcov"],
      threshold: 30,
      projectThreshold: 5,
    };
    const { result, exit } = await runGate({
      cwd: "/proj",
      runner: async (cmd) => {
        if (cmd === "bunx") {
          return { exitCode: 2, stdout: "", stderr: "failed _authToken=tok" };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      fs: {
        exists: (p) => p === gatePath,
        readText: () => JSON.stringify(config),
        writeText: () => {},
        mkdirp: () => {},
      },
    });
    expect(exit).toBe(2);
    expect(result.message).toBe("crap4ts exited 2");
  });

  test("invalid JSON on exit 1 → exit 2 report invalid", async () => {
    const config = {
      version: 1,
      coverageCommand: "bun test --coverage",
      crapArgs: ["-c", "coverage/lcov.info", "-f", "lcov"],
      threshold: 30,
      projectThreshold: 5,
    };
    const { result, exit } = await runGate({
      cwd: "/proj",
      runner: async (cmd) => {
        if (cmd === "bunx") {
          return { exitCode: 1, stdout: "not-json", stderr: "" };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      fs: {
        exists: (p) => p === gatePath,
        readText: () => JSON.stringify(config),
        writeText: () => {},
        mkdirp: () => {},
      },
    });
    expect(exit).toBe(2);
    expect(result.message).toBe("report is invalid");
  });

  test("coverage command failure does not run crap4ts", async () => {
    const config = {
      version: 1,
      coverageCommand: "bun test --coverage",
      crapArgs: ["-c", "coverage/lcov.info", "-f", "lcov"],
      threshold: 30,
      projectThreshold: 5,
    };
    const calls: string[] = [];
    const { result, exit } = await runGate({
      cwd: "/proj",
      runner: async (cmd) => {
        calls.push(cmd);
        return { exitCode: 1, stdout: "", stderr: "tests failed" };
      },
      fs: {
        exists: (p) => p === gatePath,
        readText: () => JSON.stringify(config),
        writeText: () => {},
        mkdirp: () => {},
      },
    });
    expect(calls).toEqual(["bun"]);
    expect(exit).toBe(2);
    expect(result.message).toBe("tests failed");
    expect(result.isFlagged).toBe(false);
  });

  test("rejects a coverage command that is not bun test", async () => {
    const config = {
      version: 1,
      coverageCommand: "curl https://example.com",
      crapArgs: ["-c", "coverage/lcov.info", "-f", "lcov"],
      threshold: 30,
      projectThreshold: 5,
    };
    const calls: string[] = [];
    const { exit, result } = await runGate({
      cwd: "/proj",
      runner: async (cmd) => {
        calls.push(cmd);
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      fs: {
        exists: (p) => p === gatePath,
        readText: () => JSON.stringify(config),
        writeText: () => {},
        mkdirp: () => {},
      },
    });
    expect(calls).toEqual([]);
    expect(exit).toBe(2);
    expect(result.message).toBe("coverage command is not allowed");
  });

  test("passes threshold flags to bunx and drops exclude", async () => {
    const config = {
      version: 1,
      coverageCommand: "bun test --coverage",
      crapArgs: [
        "-c",
        "coverage/lcov.info",
        "-f",
        "lcov",
        "--exclude",
        "**/*",
        "--threshold",
        "999",
      ],
      threshold: 30,
      projectThreshold: 5,
    };
    let crapArgs: string[] = [];
    await runGate({
      cwd: "/proj",
      runner: async (cmd, args) => {
        if (cmd === "bunx") {
          crapArgs = args;
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              ...validSummary,
              isFlagged: false,
              crappyCount: 0,
              crappyPercent: 0,
              functions: [],
            }),
            stderr: "",
          };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      fs: {
        exists: (p) => p === gatePath,
        readText: () => JSON.stringify(config),
        writeText: () => {},
        mkdirp: () => {},
      },
    });
    expect(crapArgs).toEqual([
      "@graffhyrum/crap4ts",
      "-c",
      "coverage/lcov.info",
      "-f",
      "lcov",
      "-t",
      "30",
      "--project-threshold",
      "5",
      "-o",
      "json",
    ]);
  });

  test("rejects bun test without --coverage", async () => {
    const config = {
      version: 1,
      coverageCommand: "bun test",
      crapArgs: ["-c", "coverage/lcov.info", "-f", "lcov"],
      threshold: 30,
      projectThreshold: 5,
    };
    const calls: string[] = [];
    const { exit, result } = await runGate({
      cwd: "/proj",
      runner: async (cmd) => {
        calls.push(cmd);
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      fs: {
        exists: (p) => p === gatePath,
        readText: () => JSON.stringify(config),
        writeText: () => {},
        mkdirp: () => {},
      },
    });
    expect(calls).toEqual([]);
    expect(exit).toBe(2);
    expect(result.message).toBe("coverage command is not allowed");
  });

  test("rejects a coverage path outside the repository", async () => {
    const config = {
      version: 1,
      coverageCommand: "bun test --coverage",
      crapArgs: ["-c", "../../.npmrc", "-f", "lcov"],
      threshold: 30,
      projectThreshold: 5,
    };
    const calls: string[] = [];
    const { exit, result } = await runGate({
      cwd: "/proj",
      runner: async (cmd) => {
        calls.push(cmd);
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      fs: {
        exists: (p) => p === gatePath,
        readText: () => JSON.stringify(config),
        writeText: () => {},
        mkdirp: () => {},
      },
    });
    expect(calls).toEqual([]);
    expect(exit).toBe(2);
    expect(result.message).toBe("coverage path is outside the repository");
  });

  test("a config with the wrong version is invalid", async () => {
    const { result, exit } = await runGate({
      cwd: "/proj",
      runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      fs: {
        exists: (p) => p === gatePath,
        readText: () =>
          JSON.stringify({
            version: 2,
            coverageCommand: "bun test --coverage",
            crapArgs: [],
            threshold: 30,
            projectThreshold: 5,
          }),
        writeText: () => {},
        mkdirp: () => {},
      },
    });
    expect(exit).toBe(2);
    expect(result.message).toBe("gate config is invalid");
    expect(result.crappyCount).toBe(0);
  });

  test("config that is not JSON is invalid", async () => {
    const { result, exit } = await runGate({
      cwd: "/proj",
      runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      fs: {
        exists: (p) => p === gatePath,
        readText: () => "not-json{",
        writeText: () => {},
        mkdirp: () => {},
      },
    });
    expect(exit).toBe(2);
    expect(result.message).toBe("gate config is invalid");
  });

  test("crap4ts exit 3 returns the stderr message", async () => {
    const config = {
      version: 1,
      coverageCommand: "bun test --coverage",
      crapArgs: ["-c", "coverage/lcov.info", "-f", "lcov"],
      threshold: 30,
      projectThreshold: 5,
    };
    const { result, exit } = await runGate({
      cwd: "/proj",
      runner: async (cmd) => {
        if (cmd === "bunx") return { exitCode: 3, stdout: "", stderr: "weird" };
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      fs: {
        exists: (p) => p === gatePath,
        readText: () => JSON.stringify(config),
        writeText: () => {},
        mkdirp: () => {},
      },
    });
    expect(exit).toBe(2);
    expect(result.message).toBe("weird");
    expect(result.isFlagged).toBe(false);
  });

  test("a parsed report with a bad flag field is invalid", async () => {
    const config = {
      version: 1,
      coverageCommand: "bun test --coverage",
      crapArgs: ["-c", "coverage/lcov.info", "-f", "lcov"],
      threshold: 30,
      projectThreshold: 5,
    };
    const { result, exit } = await runGate({
      cwd: "/proj",
      runner: async (cmd) => {
        if (cmd === "bunx") {
          return {
            exitCode: 1,
            stdout: JSON.stringify({ ...validSummary, isFlagged: "yes" }),
            stderr: "",
          };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      fs: {
        exists: (p) => p === gatePath,
        readText: () => JSON.stringify(config),
        writeText: () => {},
        mkdirp: () => {},
      },
    });
    expect(exit).toBe(2);
    expect(result).toEqual({
      version: 1,
      exit: 2,
      isFlagged: false,
      crappyCount: 0,
      crappyPercent: 0,
      report: reportPath,
      message: "report is invalid",
    });
  });

  test("a report whose flag disagrees with the project threshold exits 2", async () => {
    const config = {
      version: 1,
      coverageCommand: "bun test --coverage",
      crapArgs: ["-c", "coverage/lcov.info", "-f", "lcov"],
      threshold: 30,
      projectThreshold: 5,
    };
    const { result, exit } = await runGate({
      cwd: "/proj",
      runner: async (cmd) => {
        if (cmd === "bunx") {
          return {
            exitCode: 1,
            stdout: JSON.stringify({ ...validSummary, isFlagged: false }),
            stderr: "",
          };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      fs: {
        exists: (p) => p === gatePath,
        readText: () => JSON.stringify(config),
        writeText: () => {},
        mkdirp: () => {},
      },
    });
    expect(exit).toBe(2);
    expect(result.message).toBe("report disagrees with the project threshold");
  });

  test("exit 0 with a flagged report disagrees with the process", async () => {
    const config = {
      version: 1,
      coverageCommand: "bun test --coverage",
      crapArgs: ["-c", "coverage/lcov.info", "-f", "lcov"],
      threshold: 30,
      projectThreshold: 5,
    };
    const { result, exit } = await runGate({
      cwd: "/proj",
      runner: async (cmd) => {
        if (cmd === "bunx") {
          return {
            exitCode: 0,
            stdout: JSON.stringify(validSummary),
            stderr: "",
          };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      fs: {
        exists: (p) => p === gatePath,
        readText: () => JSON.stringify(config),
        writeText: () => {},
        mkdirp: () => {},
      },
    });
    expect(exit).toBe(2);
    expect(result.message).toBe("report disagrees with the process exit code");
    expect(result.isFlagged).toBe(false);
  });

  test("exit 1 with an empty report disagrees with the process", async () => {
    const config = {
      version: 1,
      coverageCommand: "bun test --coverage",
      crapArgs: ["-c", "coverage/lcov.info", "-f", "lcov"],
      threshold: 30,
      projectThreshold: 5,
    };
    const { result, exit } = await runGate({
      cwd: "/proj",
      runner: async (cmd) => {
        if (cmd === "bunx") {
          return {
            exitCode: 1,
            stdout: JSON.stringify({
              functions: [],
              totalFunctions: 0,
              crappyCount: 0,
              crappyPercent: 0,
              isFlagged: false,
            }),
            stderr: "",
          };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      fs: {
        exists: (p) => p === gatePath,
        readText: () => JSON.stringify(config),
        writeText: () => {},
        mkdirp: () => {},
      },
    });
    expect(exit).toBe(2);
    expect(result.message).toBe("report disagrees with the process exit code");
  });
});

describe("gate main", () => {
  test("prints a missing config and returns 2", async () => {
    const { code, out } = await logged(() =>
      main({
        cwd: "/proj",
        runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        fs: {
          exists: () => false,
          readText: () => "",
          writeText: () => {},
          mkdirp: () => {},
        },
      }),
    );
    expect(code).toBe(2);
    expect(JSON.parse(out[0] ?? "").message).toBe("gate config is missing");
  });

  test("a thrown filesystem error prints gate failed details", async () => {
    const { code, out } = await logged(() =>
      main({
        cwd: "/proj",
        runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        fs: {
          exists: () => {
            throw new Error("disk full");
          },
          readText: () => "",
          writeText: () => {},
          mkdirp: () => {},
        },
      }),
    );
    expect(code).toBe(2);
    expect(JSON.parse(out[0] ?? "").message).toBe("disk full");
    expect(JSON.parse(out[0] ?? "").exit).toBe(2);
  });

  test("a non-Error failure prints gate failed", async () => {
    const { code, out } = await logged(() =>
      main({
        cwd: "/proj",
        runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        fs: {
          exists: () => {
            throw "nope";
          },
          readText: () => "",
          writeText: () => {},
          mkdirp: () => {},
        },
      }),
    );
    expect(code).toBe(2);
    expect(JSON.parse(out[0] ?? "").message).toBe("gate failed");
  });

  test("cli deps read package.json from the current directory", async () => {
    const deps = cliDeps();
    const pkg = await deps.fs.readText(join(deps.cwd, "package.json"));
    expect(pkg).toContain('"name": "@graffhyrum/crap4ts"');
  });

  test("the script entry reports a missing config", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "crap-gate-"));
    try {
      const proc = Bun.spawn([process.execPath, join(import.meta.dir, "gate.ts")], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
      });
      const stdout = await new Response(proc.stdout).text();
      expect(await proc.exited).toBe(2);
      expect(JSON.parse(stdout).message).toBe("gate config is missing");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
