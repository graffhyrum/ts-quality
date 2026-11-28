import { SelectorFailure } from "./failure.ts";

const HIDDEN_GIT_ENV = new Set([
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_PREFIX",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
]);

/** Environment for git subprocesses. Discovery follows `--cwd`, not a parent `GIT_DIR`. */
export function gitEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || HIDDEN_GIT_ENV.has(key)) continue;
    env[key] = value;
  }
  return env;
}

export type GitResult = {
  readonly exitCode: number;
  readonly stdout: Uint8Array;
  readonly stderr: string;
};

export async function spawnGit(
  args: readonly string[],
  cwd: string,
): Promise<GitResult> {
  let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
  try {
    proc = Bun.spawn(["git", ...args], {
      cwd,
      env: gitEnv(),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new SelectorFailure(
      2,
      `file-selector: git could not be started: ${detail}`,
    );
  }
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).bytes(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

export function gitFailure(
  args: readonly string[],
  result: GitResult,
): SelectorFailure {
  const detail = result.stderr.trim().split("\n")[0] ?? "";
  const suffix = detail.length > 0 ? `: ${detail}` : "";
  const command = args[0] ?? "command";
  return new SelectorFailure(
    2,
    `file-selector: git ${command} exited ${result.exitCode}${suffix}`,
  );
}
