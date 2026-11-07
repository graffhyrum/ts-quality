export type Capture = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

type CaptureOptions = {
  readonly env?: Record<string, string | undefined>;
};

export async function capture(
  argv: readonly string[],
  options: CaptureOptions = {},
): Promise<Capture> {
  const proc = Bun.spawn([...argv], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...options.env },
  });
  const [stdout, stderr] = await Promise.all([
    readStream(proc.stdout),
    readStream(proc.stderr),
  ]);
  const exitCode = await proc.exited;
  return { exitCode: exitCode ?? 1, stdout, stderr };
}

async function readStream(
  stream: ReadableStream<Uint8Array> | number | null | undefined,
): Promise<string> {
  if (stream == null || typeof stream === "number") return "";
  return new Response(stream).text();
}
