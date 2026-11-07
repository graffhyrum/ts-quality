// End-to-end standalone template check against freshly packed tool tarballs served over a
// local HTTP server (proves Bun installs URL tarball specifiers; NOT proof of a GitHub release).
// Usage: bun scripts/smoke-export.ts <emptyWorkDir>
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { mustRun, run } from "./lib/run.ts";

type Manifest = {
  readonly kind: string;
  readonly entries: readonly {
    readonly name: string;
    readonly assets: readonly { readonly name: string }[];
  }[];
};

const workArg = process.argv[2];
if (!workArg) {
  console.error("usage: bun scripts/smoke-export.ts <emptyWorkDir>");
  process.exit(2);
}
await smoke(path.resolve(workArg));

async function smoke(work: string): Promise<void> {
  if (existsSync(work) && readdirSync(work).length > 0)
    throw new Error(`refusing to reuse non-empty ${work}`);
  const artifacts = path.join(work, "artifacts");
  const project = path.join(work, "project");
  await mustRun(["bun", "scripts/release-plan.ts", artifacts]);
  const manifest: Manifest = await Bun.file(
    path.join(artifacts, "manifest.json"),
  ).json();
  const server = serveDir(artifacts);
  try {
    const specs = Object.fromEntries(
      manifest.entries.map((e) => [
        e.name,
        `${server.url}${e.assets[0]?.name}`,
      ]),
    );
    const specsPath = path.join(work, "specs.json");
    await Bun.write(specsPath, `${JSON.stringify(specs, null, 2)}\n`);
    await mustRun(["bun", "scripts/export-template.ts", project, specsPath]);
    await verifyProject(project);
  } finally {
    void server.stop(true);
  }
  console.log(`smoke-export: ok (${project})`);
}

function serveDir(dir: string): {
  readonly url: string;
  stop: (force: boolean) => Promise<void>;
} {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const name = path.basename(new URL(req.url).pathname);
      const file = Bun.file(path.join(dir, name));
      return name.endsWith(".tgz")
        ? new Response(file)
        : new Response("not found", { status: 404 });
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}/`,
    stop: (force) => server.stop(force),
  };
}

async function verifyProject(project: string): Promise<void> {
  await mustRun(["git", "init", "-q"], { cwd: project });
  await mustRun(["bun", "install"], { cwd: project });
  const hooks = await run(["git", "config", "--get", "core.hooksPath"], {
    cwd: project,
    capture: true,
  });
  if (hooks.exitCode === 0)
    throw new Error(`install set core.hooksPath=${hooks.stdout.trim()}`);
  if (existsSync(path.join(project, ".husky")))
    throw new Error("export contains .husky");
  await mustRun(["bun", "install", "--frozen-lockfile"], { cwd: project });
  await mustRun(["bun", "run", "vet"], { cwd: project });
  await mustRun(["bun", "run", "build"], { cwd: project });
}
