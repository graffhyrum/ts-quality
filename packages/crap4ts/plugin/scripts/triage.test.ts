import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { cliDeps, main, runTriage } from "./triage";
import { isInsideRepo } from "./types";

async function logged(run: () => Promise<number>) {
  const out: string[] = [];
  const err: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (message?: unknown) => {
    out.push(String(message));
  };
  console.error = (message?: unknown) => {
    err.push(String(message));
  };
  try {
    return { code: await run(), out, err };
  } finally {
    console.log = log;
    console.error = error;
  }
}

const reportPath = join("/proj", ".crap4ts", "report.json");
const gatePath = join("/proj", ".crap4ts", "gate.json");

const config = {
  version: 1,
  coverageCommand: "bun test --coverage",
  crapArgs: ["-c", "coverage/lcov.info", "-f", "lcov"],
  threshold: 30,
  projectThreshold: 5,
};

const report = {
  functions: [
    {
      name: "worst",
      filePath: "f.ts",
      startLine: 1,
      endLine: 50,
      complexity: 10,
      coverage: null,
      crapScore: 110,
      isCrappy: true,
    },
    {
      name: "mild",
      filePath: "e.ts",
      startLine: 10,
      endLine: 20,
      complexity: 5,
      coverage: 0,
      crapScore: 30,
      isCrappy: true,
    },
  ],
  totalFunctions: 2,
  crappyCount: 2,
  crappyPercent: 100,
  isFlagged: true,
};

describe("runTriage", () => {
  test("missing report → exit 2 and message", async () => {
    const { result, exit, message } = await runTriage([], {
      cwd: "/proj",
      fs: {
        exists: () => false,
        readText: () => "",
      },
    });
    expect(exit).toBe(2);
    expect(message).toBe("report is missing");
    expect(result.action).toBeNull();
  });

  test("prints first action and remaining", async () => {
    const { result, exit } = await runTriage([], {
      cwd: "/proj",
      fs: {
        exists: (p) => p === reportPath || p === gatePath,
        readText: (p) => (p === gatePath ? JSON.stringify(config) : JSON.stringify(report)),
      },
    });
    expect(exit).toBe(0);
    expect(result).toEqual({
      version: 1,
      isFlagged: true,
      crappyPercent: 100,
      action: {
        kind: "fix-join",
        filePath: "f.ts",
        startLine: 1,
        endLine: 50,
        name: "worst",
        complexity: 10,
        coverage: null,
        crapScore: 110,
        reference: "join.md",
      },
      remaining: 1,
      report: reportPath,
    });
  });

  test("--every returns actions when isFlagged false", async () => {
    const quiet = {
      ...report,
      isFlagged: false,
      crappyPercent: 5,
      crappyCount: 1,
      totalFunctions: 20,
      functions: [report.functions[1]],
    };
    const { result } = await runTriage(["--every"], {
      cwd: "/proj",
      fs: {
        exists: (p) => p === reportPath || p === gatePath,
        readText: (p) => (p === gatePath ? JSON.stringify(config) : JSON.stringify(quiet)),
      },
    });
    expect(result.action).toEqual({
      kind: "test",
      filePath: "e.ts",
      startLine: 10,
      endLine: 20,
      name: "mild",
      complexity: 5,
      coverage: 0,
      crapScore: 30,
      reference: "test.md",
    });
  });

  test("isInsideRepo rejects a path outside the project", () => {
    expect(isInsideRepo("src/a.ts", "/proj")).toBe(true);
    expect(isInsideRepo("../secret", "/proj")).toBe(false);
    expect(isInsideRepo("/etc/passwd", "/proj")).toBe(false);
  });

  test("missing gate config exits 2", async () => {
    const { result, exit, message } = await runTriage([], {
      cwd: "/proj",
      fs: {
        exists: (p) => p === reportPath,
        readText: () => JSON.stringify(report),
      },
    });
    expect(exit).toBe(2);
    expect(message).toBe("gate config is missing");
    expect(result.action).toBeNull();
    expect(result.report).toBe(reportPath);
  });

  test("a report that is not JSON exits 2", async () => {
    const { result, exit, message } = await runTriage([], {
      cwd: "/proj",
      fs: {
        exists: () => true,
        readText: (p) => (p === gatePath ? JSON.stringify(config) : "not-json"),
      },
    });
    expect(exit).toBe(2);
    expect(message).toBe("report is invalid");
    expect(result.action).toBeNull();
  });

  test("a report that parses but fails the schema exits 2", async () => {
    const { message, exit } = await runTriage([], {
      cwd: "/proj",
      fs: {
        exists: () => true,
        readText: (p) => (p === gatePath ? JSON.stringify(config) : "{}"),
      },
    });
    expect(exit).toBe(2);
    expect(message).toBe("report is invalid");
  });

  test("a gate config that is not JSON exits 2", async () => {
    const { message, exit } = await runTriage([], {
      cwd: "/proj",
      fs: {
        exists: () => true,
        readText: (p) => (p === gatePath ? "{" : JSON.stringify(report)),
      },
    });
    expect(exit).toBe(2);
    expect(message).toBe("gate config is invalid");
  });

  test("a gate config that parses but fails the schema exits 2", async () => {
    const { message, exit } = await runTriage([], {
      cwd: "/proj",
      fs: {
        exists: () => true,
        readText: (p) => (p === gatePath ? JSON.stringify({ version: 1 }) : JSON.stringify(report)),
      },
    });
    expect(exit).toBe(2);
    expect(message).toBe("gate config is invalid");
  });

  test("a flag that disagrees with the project threshold exits 2", async () => {
    const quiet = { ...report, isFlagged: false };
    const { message, exit, result } = await runTriage([], {
      cwd: "/proj",
      fs: {
        exists: () => true,
        readText: (p) => (p === gatePath ? JSON.stringify(config) : JSON.stringify(quiet)),
      },
    });
    expect(exit).toBe(2);
    expect(message).toBe("report is invalid");
    expect(result.action).toBeNull();
  });
});

describe("triage main", () => {
  test("prints a missing report and returns 2", async () => {
    const { code, out, err } = await logged(() =>
      main([], {
        cwd: "/proj",
        fs: { exists: () => false, readText: () => "" },
      }),
    );
    expect(code).toBe(2);
    expect(err).toEqual(["report is missing"]);
    expect(JSON.parse(out[0] ?? "").action).toBeNull();
  });

  test("a thrown filesystem error prints the error and an empty action", async () => {
    const { code, out, err } = await logged(() =>
      main([], {
        cwd: "/proj",
        fs: {
          exists: () => {
            throw new Error("disk full");
          },
          readText: () => "",
        },
      }),
    );
    expect(code).toBe(2);
    expect(err).toEqual(["disk full"]);
    expect(JSON.parse(out[0] ?? "")).toEqual({
      version: 1,
      isFlagged: false,
      crappyPercent: 0,
      action: null,
      remaining: 0,
      report: reportPath,
    });
  });

  test("a non-Error failure prints triage failed", async () => {
    const { code, err } = await logged(() =>
      main([], {
        cwd: "/proj",
        fs: {
          exists: () => {
            throw "nope";
          },
          readText: () => "",
        },
      }),
    );
    expect(code).toBe(2);
    expect(err).toEqual(["triage failed"]);
  });

  test("cli deps read package.json from the current directory", async () => {
    const deps = cliDeps();
    const pkg = await deps.fs.readText(join(deps.cwd, "package.json"));
    expect(pkg).toContain('"name": "@graffhyrum/crap4ts"');
  });

  test("the script entry reports a missing report", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "crap-triage-"));
    try {
      const proc = Bun.spawn([process.execPath, join(import.meta.dir, "triage.ts")], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
      });
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      expect(await proc.exited).toBe(2);
      expect(stderr.trim()).toBe("report is missing");
      expect(JSON.parse(stdout).action).toBeNull();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
