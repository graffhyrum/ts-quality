import { dirname, join } from "node:path";
import { bunExists, bunMkdirp, bunReadText, bunWriteText, spawnCaptured } from "./bun-io";
import type { GateConfig, GateResult } from "./types";
import { isInsideRepo, parseGateConfig, parseProjectSummary, scrubText } from "./types";
export type CommandRunner = (
  command: string,
  args: string[],
  cwd: string,
) => Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;
export type GateFs = {
  exists: (path: string) => boolean | Promise<boolean>;
  readText: (path: string) => string | Promise<string>;
  writeText: (path: string, contents: string) => void | Promise<void>;
  mkdirp: (path: string) => void;
};
if (import.meta.main) process.exit(await main(cliDeps()));
export async function main(deps: Parameters<typeof runGate>[0]): Promise<number> {
  try {
    const { result, exit } = await runGate(deps);
    console.log(JSON.stringify(result));
    return exit;
  } catch (err) {
    const result: GateResult = {
      version: 1,
      exit: 2,
      isFlagged: false,
      crappyCount: 0,
      crappyPercent: 0,
      report: join(deps.cwd, ".crap4ts", "report.json"),
      message: scrubText(err instanceof Error ? err.message : "", "gate failed"),
    };
    console.log(JSON.stringify(result));
    return 2;
  }
}
export async function runGate(deps: { cwd: string; runner: CommandRunner; fs: GateFs }): Promise<{
  result: GateResult;
  exit: 0 | 1 | 2;
}> {
  const reportPath = join(deps.cwd, ".crap4ts", "report.json");
  const configPath = join(deps.cwd, ".crap4ts", "gate.json");
  const missing = (
    message: string,
  ): {
    result: GateResult;
    exit: 2;
  } => ({
    result: {
      version: 1,
      exit: 2,
      isFlagged: false,
      crappyCount: 0,
      crappyPercent: 0,
      report: reportPath,
      message,
    },
    exit: 2,
  });
  if (!(await deps.fs.exists(configPath))) {
    return missing("gate config is missing");
  }
  let config: GateConfig;
  try {
    const parsed = parseGateConfig(JSON.parse(await deps.fs.readText(configPath)));
    if (parsed === null) {
      return missing("gate config is invalid");
    }
    config = parsed;
  } catch {
    return missing("gate config is invalid");
  }
  const toolArgs = crap4tsArgs(config);
  for (let i = 0; i < toolArgs.length; i++) {
    if (toolArgs[i] === "-c" && !isInsideRepo(toolArgs[i + 1] ?? "", deps.cwd)) {
      return missing("coverage path is outside the repository");
    }
  }
  const coverage = splitCommand(config.coverageCommand);
  if (!coverageAllowed(coverage.cmd, coverage.args)) {
    return missing("coverage command is not allowed");
  }
  const coverageRun = await deps.runner(coverage.cmd, coverage.args, deps.cwd);
  if (coverageRun.exitCode !== 0) {
    return missing(
      scrubText(coverageRun.stderr, `coverage command exited ${coverageRun.exitCode}`),
    );
  }
  const crap = await deps.runner("bunx", ["@graffhyrum/crap4ts", ...toolArgs], deps.cwd);
  if (crap.exitCode === 2) {
    return missing(scrubText(crap.stderr, "crap4ts exited 2"));
  }
  if (crap.exitCode !== 0 && crap.exitCode !== 1) {
    return missing(scrubText(crap.stderr, `crap4ts exited ${crap.exitCode}`));
  }
  let raw: unknown;
  try {
    raw = JSON.parse(crap.stdout);
  } catch {
    return {
      result: {
        version: 1,
        exit: 2,
        isFlagged: false,
        crappyCount: 0,
        crappyPercent: 0,
        report: reportPath,
        message: "report is invalid",
      },
      exit: 2,
    };
  }
  const summary = parseProjectSummary(raw);
  if (summary === null) {
    return {
      result: {
        version: 1,
        exit: 2,
        isFlagged: false,
        crappyCount: 0,
        crappyPercent: 0,
        report: reportPath,
        message: "report is invalid",
      },
      exit: 2,
    };
  }
  if (summary.isFlagged !== summary.crappyPercent > config.projectThreshold) {
    return missing("report disagrees with the project threshold");
  }
  if ((crap.exitCode === 0 && summary.isFlagged) || (crap.exitCode === 1 && !summary.isFlagged)) {
    return {
      result: {
        version: 1,
        exit: 2,
        isFlagged: false,
        crappyCount: 0,
        crappyPercent: 0,
        report: reportPath,
        message: "report disagrees with the process exit code",
      },
      exit: 2,
    };
  }
  deps.fs.mkdirp(dirname(reportPath));
  await deps.fs.writeText(reportPath, crap.stdout);
  if (crap.exitCode === 0) {
    return {
      result: {
        version: 1,
        exit: 0,
        isFlagged: false,
        crappyCount: summary.crappyCount,
        crappyPercent: summary.crappyPercent,
        report: reportPath,
        message: "gate passed",
      },
      exit: 0,
    };
  }
  return {
    result: {
      version: 1,
      exit: 1,
      isFlagged: summary.isFlagged,
      crappyCount: summary.crappyCount,
      crappyPercent: summary.crappyPercent,
      report: reportPath,
      message: "gate flagged",
    },
    exit: 1,
  };
}
function splitCommand(command: string): {
  cmd: string;
  args: string[];
} {
  const parts = command.trim().split(/\s+/);
  return { cmd: parts[0] ?? "", args: parts.slice(1) };
}
export function crap4tsArgs(config: GateConfig): string[] {
  const out: string[] = [];
  const args = config.crapArgs;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    const value = args[i + 1];
    if ((arg === "-c" || arg === "--coverage") && value !== undefined && !value.startsWith("-")) {
      out.push("-c", value);
      i += 1;
      continue;
    }
    if ((arg === "-f" || arg === "--format") && value !== undefined && !value.startsWith("-")) {
      out.push("-f", value);
      i += 1;
    }
  }
  out.push(
    "-t",
    String(config.threshold),
    "--project-threshold",
    String(config.projectThreshold),
    "-o",
    "json",
  );
  return out;
}
function coverageAllowed(cmd: string, args: string[]): boolean {
  return cmd === "bun" && args.length === 2 && args[0] === "test" && args[1] === "--coverage";
}
export function cliDeps(): Parameters<typeof runGate>[0] {
  return {
    cwd: process.cwd(),
    runner: spawnCaptured,
    fs: {
      exists: bunExists,
      readText: bunReadText,
      writeText: bunWriteText,
      mkdirp: bunMkdirp,
    },
  };
}
