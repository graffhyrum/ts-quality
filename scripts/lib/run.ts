export type RunResult = {
  readonly exitCode: number;
  readonly stdout: string;
  /** Captured only with `captureStderr`; otherwise streamed and empty. */
  readonly stderr: string;
};

/** Runs a command, streaming stderr; stdout is captured when `capture` is set. */
export async function run(
  argv: readonly string[],
  options: {
    readonly cwd?: string;
    readonly capture?: boolean;
    readonly captureStderr?: boolean;
  } = {},
): Promise<RunResult> {
  const proc = Bun.spawn([...argv], {
    cwd: options.cwd,
    stdout: options.capture ? "pipe" : "inherit",
    stderr: options.captureStderr ? "pipe" : "inherit",
  });
  const [stdout, stderr] = await Promise.all([
    options.capture ? new Response(proc.stdout).text() : "",
    options.captureStderr ? new Response(proc.stderr).text() : "",
  ]);
  return { exitCode: await proc.exited, stdout, stderr };
}

export async function mustRun(
  argv: readonly string[],
  options: { readonly cwd?: string; readonly capture?: boolean } = {},
): Promise<string> {
  const result = await run(argv, options);
  if (result.exitCode !== 0) {
    throw new Error(
      `${argv.join(" ")} exited ${result.exitCode}${options.cwd ? ` in ${options.cwd}` : ""}`,
    );
  }
  return result.stdout;
}
