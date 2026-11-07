import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  decideStop,
  main,
  parseGateStop,
  parseStopInput,
  runSpawnedGate,
  runSpawnedTriage,
} from "./stop";
import type { TriageResult } from "../scripts/types";

const triageWithAction: TriageResult = {
  version: 1,
  isFlagged: true,
  crappyPercent: 10,
  action: {
    kind: "test",
    filePath: "a.ts",
    startLine: 1,
    endLine: 5,
    name: "f",
    complexity: 5,
    coverage: 0,
    crapScore: 30,
    reference: "test.md",
  },
  remaining: 0,
  report: ".crap4ts/report.json",
};

const emptyTriage: TriageResult = {
  version: 1,
  isFlagged: false,
  crappyPercent: 0,
  action: null,
  remaining: 0,
  report: ".crap4ts/report.json",
};

describe("decideStop", () => {
  test("no gate config → {}", async () => {
    expect(
      await decideStop(
        { status: "completed", loop_count: 0 },
        {
          gateConfigExists: false,
          gateScriptExists: true,
          triageScriptExists: true,
          runGate: async () => ({ exit: 1 }),
          runTriage: async () => ({ result: triageWithAction, exit: 0 }),
        },
      ),
    ).toEqual({});
  });

  test("loop_count not 0 → {}", async () => {
    expect(
      await decideStop(
        { status: "completed", loop_count: 1 },
        {
          gateConfigExists: true,
          gateScriptExists: true,
          triageScriptExists: true,
          runGate: async () => ({ exit: 1 }),
          runTriage: async () => ({ result: triageWithAction, exit: 0 }),
        },
      ),
    ).toEqual({});
  });

  test("status not completed → {}", async () => {
    expect(
      await decideStop(
        { status: "aborted", loop_count: 0 },
        {
          gateConfigExists: true,
          gateScriptExists: true,
          triageScriptExists: true,
          runGate: async () => ({ exit: 1 }),
          runTriage: async () => ({ result: triageWithAction, exit: 0 }),
        },
      ),
    ).toEqual({});
  });

  test("gate exit 0 → {}", async () => {
    expect(
      await decideStop(
        { status: "completed", loop_count: 0 },
        {
          gateConfigExists: true,
          gateScriptExists: true,
          triageScriptExists: true,
          runGate: async () => ({ exit: 0 }),
          runTriage: async () => ({ result: triageWithAction, exit: 0 }),
        },
      ),
    ).toEqual({});
  });

  test("gate exit 2 → setup followup", async () => {
    expect(
      await decideStop(
        { status: "completed", loop_count: 0 },
        {
          gateConfigExists: true,
          gateScriptExists: true,
          triageScriptExists: true,
          runGate: async () => ({ exit: 2, message: "coverage command is not allowed" }),
          runTriage: async () => ({ result: triageWithAction, exit: 0 }),
        },
      ),
    ).toEqual({
      followup_message:
        "The gate did not score the project. coverage command is not allowed. Run the crap4ts-gate skill.",
    });
  });

  test("missing scripts → followup", async () => {
    expect(
      await decideStop(
        { status: "completed", loop_count: 0 },
        {
          gateConfigExists: true,
          gateScriptExists: false,
          triageScriptExists: true,
          runGate: async () => ({ exit: 1 }),
          runTriage: async () => ({ result: triageWithAction, exit: 0 }),
        },
      ),
    ).toEqual({
      followup_message: "The crap4ts scripts are missing. Run the crap4ts-bootstrap skill.",
    });
  });

  test("triage action null → followup", async () => {
    expect(
      await decideStop(
        { status: "completed", loop_count: 0 },
        {
          gateConfigExists: true,
          gateScriptExists: true,
          triageScriptExists: true,
          runGate: async () => ({ exit: 1 }),
          runTriage: async () => ({ result: emptyTriage, exit: 0 }),
        },
      ),
    ).toEqual({
      followup_message: "The project is flagged. Triage named no in-repo function. Stop.",
    });
  });

  test("gate exit 1 with action → followup_message", async () => {
    expect(
      await decideStop(
        { status: "completed", loop_count: 0 },
        {
          gateConfigExists: true,
          gateScriptExists: true,
          triageScriptExists: true,
          runGate: async () => ({ exit: 1 }),
          runTriage: async () => ({ result: triageWithAction, exit: 0 }),
        },
      ),
    ).toEqual({
      followup_message: "Run the crap4ts-triage skill before any edit.",
    });
  });

  test("padded completed status still runs", () => {
    expect(parseStopInput({ status: "completed ", loop_count: 0 }).status).toBe("completed");
  });

  test("parseGateStop accepts a report that matches the process exit", () => {
    const passed = JSON.stringify({
      version: 1,
      exit: 0,
      isFlagged: false,
      message: "gate passed",
    });
    expect(parseGateStop(passed, 0)).toEqual({ exit: 0, message: "gate passed" });

    const flagged = JSON.stringify({
      version: 1,
      exit: 1,
      isFlagged: true,
      message: "gate flagged",
    });
    expect(parseGateStop(flagged, 1)).toEqual({ exit: 1, message: "gate flagged" });

    const setup = JSON.stringify({
      version: 1,
      exit: 2,
      isFlagged: false,
      message: "coverage command is not allowed",
    });
    expect(parseGateStop(setup, 2).exit).toBe(2);
  });

  test("parseGateStop rejects a report that is not a gate result", () => {
    const invalid = { exit: 2 as const, message: "gate did not return JSON" };
    expect(parseGateStop("not json", 1)).toEqual(invalid);
    expect(parseGateStop("null", 1)).toEqual(invalid);
    expect(parseGateStop("[]", 1)).toEqual(invalid);
    expect(
      parseGateStop(JSON.stringify({ version: 2, exit: 0, isFlagged: false, message: "x" }), 0),
    ).toEqual(invalid);
    expect(
      parseGateStop(JSON.stringify({ version: 1, exit: 3, isFlagged: false, message: "x" }), 3),
    ).toEqual(invalid);
    expect(
      parseGateStop(JSON.stringify({ version: 1, exit: 0, isFlagged: false, message: 1 }), 0),
    ).toEqual(invalid);
    expect(
      parseGateStop(JSON.stringify({ version: 1, exit: 0, isFlagged: "no", message: "x" }), 0),
    ).toEqual(invalid);
  });

  test("parseGateStop rejects a report that disagrees with the process", () => {
    const base = { version: 1, exit: 0, isFlagged: false, message: "gate passed" };
    expect(parseGateStop(JSON.stringify(base), 1)).toEqual({
      exit: 2,
      message: "gate process exit disagrees with the report",
    });
    expect(parseGateStop(JSON.stringify({ ...base, isFlagged: true }), 0)).toEqual({
      exit: 2,
      message: "gate report disagrees with its exit code",
    });
    expect(
      parseGateStop(
        JSON.stringify({ ...base, exit: 1, isFlagged: false, message: "gate flagged" }),
        1,
      ),
    ).toEqual({
      exit: 2,
      message: "gate report disagrees with its exit code",
    });
    expect(parseGateStop(JSON.stringify({ ...base, message: "bad; rm -rf /" }), 0)).toEqual({
      exit: 0,
      message: "Fix the setup.",
    });
  });

  test("triage exit 2 strips shell text from stderr", async () => {
    expect(
      await decideStop(
        { status: "completed", loop_count: 0 },
        {
          gateConfigExists: true,
          gateScriptExists: true,
          triageScriptExists: true,
          runGate: async () => ({ exit: 1, message: "gate flagged" }),
          runTriage: async () => ({ result: null, exit: 2, stderr: "bad; rm -rf /" }),
        },
      ),
    ).toEqual({
      followup_message:
        "The gate flagged the project. Triage did not return an action. Run the crap4ts-triage skill.",
    });
  });

  test("bad stdin prints a followup and exits 0", async () => {
    const proc = Bun.spawn([process.execPath, join(import.meta.dir, "stop.ts")], {
      stdin: new Blob(["not json"]),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, , exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("The crap4ts stop hook failed.");
  });

  test("parseStopInput rejects a bad hook payload", () => {
    expect(() => parseStopInput([])).toThrow("bad stop input");
    expect(() => parseStopInput(null)).toThrow("bad stop input");
    expect(() => parseStopInput({ status: 1, loop_count: 0 })).toThrow("bad stop input");
    expect(() => parseStopInput({ status: "ok\n", loop_count: 0 })).toThrow("bad stop input");
    expect(() => parseStopInput({ status: "completed", loop_count: -1 })).toThrow("bad stop input");
    expect(() => parseStopInput({ status: "completed", loop_count: 1.5 })).toThrow(
      "bad stop input",
    );
  });

  test("gate exit 2 strips shell text from the message", async () => {
    expect(
      await decideStop(
        { status: "completed", loop_count: 0 },
        {
          gateConfigExists: true,
          gateScriptExists: true,
          triageScriptExists: true,
          runGate: async () => ({ exit: 2, message: "bad; rm -rf /" }),
          runTriage: async () => ({ result: emptyTriage, exit: 0 }),
        },
      ),
    ).toEqual({
      followup_message:
        "The gate did not score the project. Fix the setup. Run the crap4ts-gate skill.",
    });
  });

  test("a status longer than 32 characters is rejected", () => {
    expect(() => parseStopInput({ status: "c".repeat(33), loop_count: 0 })).toThrow(
      "bad stop input",
    );
  });
});

describe("stop main", () => {
  test("bad stdin text prints the hook failure and returns 0", async () => {
    const { code, out } = await logged(() => main("not json"));
    expect(code).toBe(0);
    expect(JSON.parse(out[0] ?? "").followup_message).toBe(
      "The crap4ts stop hook failed. Run the crap4ts-gate skill.",
    );
  });

  test("a flagged gate and an in-repo action print the triage followup", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "crap-stop-cwd-"));
    const pluginRoot = mkdtempSync(join(tmpdir(), "crap-stop-plugin-"));
    mkdirSync(join(cwd, ".crap4ts"));
    mkdirSync(join(pluginRoot, "scripts"));
    await Bun.write(join(cwd, ".crap4ts", "gate.json"), "{}\n");
    await Bun.write(
      join(pluginRoot, "scripts", "gate.ts"),
      `console.log(${JSON.stringify(
        JSON.stringify({
          version: 1,
          exit: 1,
          isFlagged: true,
          message: "gate flagged",
        }),
      )});\nprocess.exit(1);\n`,
    );
    const action = {
      version: 1,
      isFlagged: true,
      crappyPercent: 10,
      action: {
        kind: "test",
        filePath: "src/detect/fs.ts",
        startLine: 1,
        endLine: 5,
        name: "covered",
        complexity: 1,
        coverage: 0,
        crapScore: 2,
        reference: "test.md",
      },
      remaining: 0,
      report: ".crap4ts/report.json",
    };
    await Bun.write(
      join(pluginRoot, "scripts", "triage.ts"),
      `console.log(${JSON.stringify(JSON.stringify(action))});\n`,
    );
    const previous = process.env.CURSOR_PLUGIN_ROOT;
    const previousCwd = process.cwd();
    process.env.CURSOR_PLUGIN_ROOT = pluginRoot;
    process.chdir(cwd);
    try {
      const { code, out } = await logged(() =>
        main(JSON.stringify({ status: "completed", loop_count: 0 })),
      );
      expect(code).toBe(0);
      expect(JSON.parse(out[0] ?? "").followup_message).toBe(
        "Run the crap4ts-triage skill before any edit.",
      );
    } finally {
      process.chdir(previousCwd);
      if (previous === undefined) delete process.env.CURSOR_PLUGIN_ROOT;
      else process.env.CURSOR_PLUGIN_ROOT = previous;
      rmSync(cwd, { recursive: true, force: true });
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  test("a non-zero loop count prints an empty decision", async () => {
    const { code, out } = await logged(() =>
      main(JSON.stringify({ status: "completed", loop_count: 1 })),
    );
    expect(code).toBe(0);
    expect(JSON.parse(out[0] ?? "")).toEqual({});
  });
});

describe("spawned gate and triage", () => {
  test("a script that prints a passing gate report is exit 0", async () => {
    const dir = mkdtempSync(join(tmpdir(), "crap-stop-"));
    const script = join(dir, "gate.ts");
    await Bun.write(
      script,
      `console.log(${JSON.stringify(JSON.stringify({ version: 1, exit: 0, isFlagged: false, message: "gate passed" }))});\n`,
    );
    try {
      expect(await runSpawnedGate(script)).toEqual({ exit: 0, message: "gate passed" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a triage script that exits 2 returns no action", async () => {
    const dir = mkdtempSync(join(tmpdir(), "crap-stop-"));
    const script = join(dir, "triage.ts");
    await Bun.write(script, `console.error("disk full");\nprocess.exit(2);\n`);
    try {
      const result = await runSpawnedTriage(script, process.cwd());
      expect(result.exit).toBe(2);
      if (result.exit !== 2) return;
      expect(result.stderr).toContain("disk full");
      expect(result.result).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a triage script that prints text instead of JSON returns no action", async () => {
    const dir = mkdtempSync(join(tmpdir(), "crap-stop-"));
    const script = join(dir, "triage.ts");
    await Bun.write(script, `console.log("not-json");\n`);
    try {
      const result = await runSpawnedTriage(script, process.cwd());
      expect(result.exit).toBe(2);
      expect(result.result).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a triage script that prints an empty object returns no action", async () => {
    const dir = mkdtempSync(join(tmpdir(), "crap-stop-"));
    const script = join(dir, "triage.ts");
    await Bun.write(script, `console.log("{}");\n`);
    try {
      expect((await runSpawnedTriage(script, process.cwd())).exit).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a triage script that prints an in-repo action is exit 0", async () => {
    const dir = mkdtempSync(join(tmpdir(), "crap-stop-"));
    const script = join(dir, "triage.ts");
    const payload = {
      version: 1,
      isFlagged: true,
      crappyPercent: 10,
      action: {
        kind: "test",
        filePath: "src/detect/fs.ts",
        startLine: 1,
        endLine: 5,
        name: "covered",
        complexity: 1,
        coverage: 0,
        crapScore: 2,
        reference: "test.md",
      },
      remaining: 0,
      report: ".crap4ts/report.json",
    };
    await Bun.write(script, `console.log(${JSON.stringify(JSON.stringify(payload))});\n`);
    try {
      const result = await runSpawnedTriage(script, process.cwd());
      expect(result.exit).toBe(0);
      if (result.exit !== 0) return;
      expect(result.result.action?.name).toBe("covered");
      expect(result.result.action?.filePath).toBe("src/detect/fs.ts");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

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
