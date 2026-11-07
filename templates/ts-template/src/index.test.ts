import { expect, test } from "bun:test";
import { startServer } from "./index.ts";

test("startServer responds on /api/tenants", async () => {
  const server = startServer(0);
  const res = await fetch(`http://localhost:${server.port}/api/tenants`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual([]);
  void server.stop(true);
});

test("the entry point starts the server", async () => {
  const proc = Bun.spawn(["bun", "src/index.ts"], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, PORT: "4317" },
  });
  const reader = proc.stdout.getReader();
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  expect(text).toContain("listening");
  proc.kill();
  await proc.exited;
});
