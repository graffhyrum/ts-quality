import { test, expect } from "bun:test";
import { join } from "node:path";

test("index entry runs main for subprocess invocation", async () => {
  const indexPath = join(import.meta.dir, "index.ts");
  const proc = Bun.spawn(["bun", indexPath, "--help"], {
    cwd: join(import.meta.dir, ".."),
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(await proc.exited).toBe(0);
});
