import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { cliDeps, hasGithubPackagesToken, main, planBootstrap, runBootstrap } from "./bootstrap";

const writer = {
  writeText: () => {},
  mkdirp: () => {},
  copyFile: () => {},
};

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

describe("hasGithubPackagesToken", () => {
  test("detects auth token line without printing it", () => {
    const npmrc = [
      "@graffhyrum:registry=https://npm.pkg.github.com",
      "//npm.pkg.github.com/:_authToken=ghp_SECRET_VALUE",
      "",
    ].join("\n");
    expect(hasGithubPackagesToken(npmrc)).toBe(true);
  });

  test("rejects an empty token", () => {
    const npmrc = "//npm.pkg.github.com/:_authToken=\n";
    expect(hasGithubPackagesToken(npmrc)).toBe(false);
  });

  test("rejects registry-only npmrc", () => {
    const npmrc = "@graffhyrum:registry=https://npm.pkg.github.com\n";
    expect(hasGithubPackagesToken(npmrc)).toBe(false);
  });
});

describe("planBootstrap", () => {
  test("no bun → needs-bun", () => {
    expect(planBootstrap({ bunPath: null, npmrcText: "x", apply: false })).toEqual({
      version: 1,
      code: "needs-bun",
      message: "bun is not on PATH",
      reference: null,
    });
  });

  test("no token → needs-token with reference", () => {
    expect(
      planBootstrap({
        bunPath: "/bun",
        npmrcText: "registry=https://registry.npmjs.org\n",
        apply: false,
      }),
    ).toEqual({
      version: 1,
      code: "needs-token",
      message: "GitHub Packages auth token is missing from npmrc",
      reference: "github-packages.md",
    });
  });

  test("without --apply → ready with install command", () => {
    const npmrc = "//npm.pkg.github.com/:_authToken=tok\n";
    expect(planBootstrap({ bunPath: "/bun", npmrcText: npmrc, apply: false })).toEqual({
      version: 1,
      code: "ready",
      message: "bun add -d @graffhyrum/crap4ts",
      reference: null,
    });
  });

  test("with --apply plans wrote-config", () => {
    const npmrc = "//npm.pkg.github.com/:_authToken=tok\n";
    expect(planBootstrap({ bunPath: "/bun", npmrcText: npmrc, apply: true })).toEqual({
      version: 1,
      code: "wrote-config",
      message: "installed crap4ts and wrote .crap4ts/gate.json",
      reference: null,
    });
  });
});

describe("runBootstrap", () => {
  test("--apply uses injected runner and writes gate.json", async () => {
    const writes: Record<string, string> = {};
    const calls: string[][] = [];
    const { result, exit } = await runBootstrap(["--apply"], {
      which: () => "/bun",
      reader: {
        exists: () => true,
        readText: () => "//npm.pkg.github.com/:_authToken=tok\n",
      },
      runner: async (cmd, args) => {
        calls.push([cmd, ...args]);
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      writer: {
        writeText: (path, contents) => {
          writes[path] = contents;
        },
        mkdirp: () => {},
        copyFile: () => {},
      },
      cwd: "/proj",
      templatePath: "/plugin/templates/gate.yml",
    });
    expect(exit).toBe(0);
    expect(result.code).toBe("wrote-config");
    expect(calls).toEqual([
      ["bun", "add", "-d", "@graffhyrum/crap4ts"],
      ["bunx", "@graffhyrum/crap4ts", "--init"],
    ]);
    const gatePath = join("/proj", ".crap4ts", "gate.json");
    expect(writes[gatePath]).toContain('"coverageCommand": "bun test --coverage"');
    expect(writes[gatePath]).toContain('"threshold": 30');
    expect(writes[gatePath]).toContain('"projectThreshold": 0');
  });

  test("--ci copies workflow template", async () => {
    const copies: Array<[string, string]> = [];
    const { result, exit } = await runBootstrap(["--ci"], {
      which: () => "/bun",
      reader: {
        exists: () => true,
        readText: () => "//npm.pkg.github.com/:_authToken=tok\n",
      },
      runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      writer: {
        writeText: () => {},
        mkdirp: () => {},
        copyFile: (from, to) => {
          copies.push([from, to]);
        },
      },
      cwd: "/proj",
      templatePath: "/plugin/templates/gate.yml",
    });
    expect(exit).toBe(0);
    expect(result.code).toBe("ready");
    expect(copies).toEqual([
      ["/plugin/templates/gate.yml", join("/proj", ".github", "workflows", "crap4ts.yml")],
    ]);
  });

  test("inject which returns null → needs-bun exit 2", async () => {
    const { result, exit } = await runBootstrap([], {
      which: () => null,
      reader: { exists: () => false, readText: () => "" },
      runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      writer: {
        writeText: () => {},
        mkdirp: () => {},
        copyFile: () => {},
      },
      cwd: "/proj",
      templatePath: "/plugin/templates/gate.yml",
    });
    expect(exit).toBe(2);
    expect(result.code).toBe("needs-bun");
  });

  test("bun add failure returns needs-runner", async () => {
    const { result, exit } = await runBootstrap(["--apply"], {
      which: () => "/bun",
      reader: {
        exists: () => true,
        readText: () => "//npm.pkg.github.com/:_authToken=tok\n",
      },
      runner: async () => ({ exitCode: 1, stdout: "", stderr: "EACCES denied" }),
      writer: { writeText: () => {}, mkdirp: () => {}, copyFile: () => {} },
      cwd: "/proj",
      templatePath: "/plugin/templates/gate.yml",
    });
    expect(exit).toBe(2);
    expect(result).toEqual({
      version: 1,
      code: "needs-runner",
      message: "EACCES denied",
      reference: null,
    });
  });

  test("empty bun add stderr uses the fallback message", async () => {
    const { result, exit } = await runBootstrap(["--apply"], {
      which: () => "/bun",
      reader: {
        exists: () => true,
        readText: () => "//npm.pkg.github.com/:_authToken=tok\n",
      },
      runner: async () => ({ exitCode: 1, stdout: "", stderr: "" }),
      writer: { writeText: () => {}, mkdirp: () => {}, copyFile: () => {} },
      cwd: "/proj",
      templatePath: "/plugin/templates/gate.yml",
    });
    expect(exit).toBe(2);
    expect(result.message).toBe("bun add failed");
    expect(result.code).toBe("needs-runner");
  });

  test("crap4ts --init failure returns needs-runner", async () => {
    const { result, exit } = await runBootstrap(["--apply"], {
      which: () => "/bun",
      reader: {
        exists: () => true,
        readText: () => "//npm.pkg.github.com/:_authToken=tok\n",
      },
      runner: async (cmd) =>
        cmd === "bun"
          ? { exitCode: 0, stdout: "", stderr: "" }
          : { exitCode: 1, stdout: "", stderr: "init failed hard" },
      writer: { writeText: () => {}, mkdirp: () => {}, copyFile: () => {} },
      cwd: "/proj",
      templatePath: "/plugin/templates/gate.yml",
    });
    expect(exit).toBe(2);
    expect(result).toEqual({
      version: 1,
      code: "needs-runner",
      message: "init failed hard",
      reference: null,
    });
  });

  test("a thrown runner error returns needs-runner", async () => {
    const { result, exit } = await runBootstrap(["--apply"], {
      which: () => "/bun",
      reader: {
        exists: () => true,
        readText: () => "//npm.pkg.github.com/:_authToken=tok\n",
      },
      runner: async () => {
        throw new Error("spawn failed");
      },
      writer: { writeText: () => {}, mkdirp: () => {}, copyFile: () => {} },
      cwd: "/proj",
      templatePath: "/plugin/templates/gate.yml",
    });
    expect(exit).toBe(2);
    expect(result).toEqual({
      version: 1,
      code: "needs-runner",
      message: "spawn failed",
      reference: null,
    });
  });

  test("a non-Error throw uses the runner failed message", async () => {
    const { result, exit } = await runBootstrap(["--apply"], {
      which: () => "/bun",
      reader: {
        exists: () => true,
        readText: () => "//npm.pkg.github.com/:_authToken=tok\n",
      },
      runner: async () => {
        throw "nope";
      },
      writer: { writeText: () => {}, mkdirp: () => {}, copyFile: () => {} },
      cwd: "/proj",
      templatePath: "/plugin/templates/gate.yml",
    });
    expect(exit).toBe(2);
    expect(result.message).toBe("runner failed");
    expect(result.code).toBe("needs-runner");
  });
});

describe("bootstrap main", () => {
  test("prints needs-bun and returns 2", async () => {
    const { code, out } = await logged(() =>
      main([], {
        which: () => null,
        reader: { exists: () => false, readText: () => "" },
        runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        writer,
        cwd: "/proj",
        templatePath: "/plugin/templates/gate.yml",
      }),
    );
    expect(code).toBe(2);
    expect(JSON.parse(out[0] ?? "")).toEqual({
      version: 1,
      code: "needs-bun",
      message: "bun is not on PATH",
      reference: null,
    });
  });

  test("a writer failure prints needs-runner", async () => {
    const { code, out } = await logged(() =>
      main(["--apply"], {
        which: () => "/bun",
        reader: {
          exists: () => true,
          readText: () => "//npm.pkg.github.com/:_authToken=tok\n",
        },
        runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        writer: {
          ...writer,
          writeText: () => {
            throw new Error("disk full");
          },
        },
        cwd: "/proj",
        templatePath: "/plugin/templates/gate.yml",
      }),
    );
    expect(code).toBe(2);
    expect(JSON.parse(out[0] ?? "").message).toBe("disk full");
    expect(JSON.parse(out[0] ?? "").code).toBe("needs-runner");
  });

  test("a writer failure hides an auth token", async () => {
    const { code, out } = await logged(() =>
      main(["--apply"], {
        which: () => "/bun",
        reader: {
          exists: () => true,
          readText: () => "//npm.pkg.github.com/:_authToken=tok\n",
        },
        runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        writer: {
          ...writer,
          writeText: () => {
            throw new Error("write failed _authToken=tok");
          },
        },
        cwd: "/proj",
        templatePath: "/plugin/templates/gate.yml",
      }),
    );
    expect(code).toBe(2);
    expect(JSON.parse(out[0] ?? "").message).toBe("bootstrap failed");
  });

  test("a non-Error failure prints bootstrap failed", async () => {
    const { code, out } = await logged(() =>
      main(["--apply"], {
        which: () => "/bun",
        reader: {
          exists: () => true,
          readText: () => "//npm.pkg.github.com/:_authToken=tok\n",
        },
        runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        writer: {
          ...writer,
          mkdirp: () => {
            throw "nope";
          },
        },
        cwd: "/proj",
        templatePath: "/plugin/templates/gate.yml",
      }),
    );
    expect(code).toBe(2);
    expect(JSON.parse(out[0] ?? "").message).toBe("bootstrap failed");
  });

  test("cli deps read the workflow template from this package", async () => {
    const deps = cliDeps();
    expect(deps.cwd).toBe(process.cwd());
    const template = await deps.reader.readText(deps.templatePath);
    expect(template).toContain("bun test --coverage");
  });

  test("the script entry returns needs-token when npmrc is absent", async () => {
    const home = mkdtempSync(join(tmpdir(), "crap-home-"));
    const cwd = mkdtempSync(join(tmpdir(), "crap-cwd-"));
    try {
      const proc = Bun.spawn([process.execPath, join(import.meta.dir, "bootstrap.ts")], {
        cwd,
        env: { ...process.env, USERPROFILE: home, HOME: home },
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
      });
      const stdout = await new Response(proc.stdout).text();
      expect(await proc.exited).toBe(2);
      expect(JSON.parse(stdout).code).toBe("needs-token");
      expect(JSON.parse(stdout).reference).toBe("github-packages.md");
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
