export type RunResult = { readonly exitCode: number; readonly stdout: string };

/** Runs a command, streaming stderr; stdout is captured when `capture` is set. */
export async function run(
  argv: readonly string[],
  options: { readonly cwd?: string; readonly capture?: boolean } = {},
): Promise<RunResult> {
  const proc = Bun.spawn([...argv], {
    cwd: options.cwd,
    stdout: options.capture ? "pipe" : "inherit",
    stderr: "inherit",
  });
  const stdout = options.capture ? await new Response(proc.stdout).text() : "";
  return { exitCode: await proc.exited, stdout };
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
