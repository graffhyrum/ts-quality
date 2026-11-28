import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gitEnv } from "./git.ts";

const cli = fileURLToPath(new URL("./cli.ts", import.meta.url));

type Run = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

/** Empty stdout is an empty list. Otherwise one trailing LF and no blank line. */
function pathsFromSelectorStdout(stdout: string): string[] {
  if (stdout.length === 0) return [];
  if (!stdout.endsWith("\n") || stdout.slice(0, -1).split("\n").includes("")) {
    throw new Error(
      `stdout is not a --files-from - path list: ${JSON.stringify(stdout)}`,
    );
  }
  return stdout.slice(0, -1).split("\n");
}

async function withDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "file-selector-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runGit(
  args: readonly string[],
  cwd: string,
  env: Readonly<Record<string, string>> = {},
): Promise<void> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    env: { ...gitEnv(), ...env },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stderr, exitCode] = await Promise.all([
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} exited ${exitCode}: ${stderr}`);
  }
}

async function initRepo(
  dir: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  await runGit(["init", "-q", "-b", "main"], dir);
  await runGit(["config", "user.email", "file-selector@example.com"], dir);
  await runGit(["config", "user.name", "file-selector"], dir);
  for (const [name, body] of Object.entries(files)) {
    const file = path.join(dir, name);
    await mkdir(path.dirname(file), { recursive: true });
    await Bun.write(file, body);
  }
  await runGit(["add", "."], dir);
  await runGit(
    [
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "-q",
      "-m",
      "init",
    ],
    dir,
  );
}

async function runCli(
  dir: string,
  args: readonly string[] = [],
  env: Readonly<Record<string, string>> = {},
): Promise<Run> {
  const proc = Bun.spawn(["bun", cli, ...args], {
    cwd: dir,
    env: { ...gitEnv(), ...env },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

test("staged paths ignore unrelated unstaged edits", async () => {
  await withDir(async (dir) => {
    await initRepo(dir, {
      "a.ts": "export const a = 1;\n",
      "b.ts": "export const b = 1;\n",
    });
    await Bun.write(path.join(dir, "a.ts"), "export const a = 2;\n");
    await runGit(["add", "a.ts"], dir);
    await Bun.write(path.join(dir, "b.ts"), "export const b = 2;\n");
    await Bun.write(path.join(dir, "u.ts"), "export const u = 1;\n");
    const staged = await runCli(dir);
    expect(staged.exitCode).toBe(0);
    expect(staged.stderr).toBe("");
    expect(pathsFromSelectorStdout(staged.stdout)).toEqual(["a.ts"]);
    await Bun.write(path.join(dir, "b.ts"), "export const b = 1;\n");
    await rm(path.join(dir, "u.ts"));
    const restored = await runCli(dir);
    expect(pathsFromSelectorStdout(restored.stdout)).toEqual(["a.ts"]);
    const json = await runCli(dir, ["--format", "json"]);
    const document = JSON.parse(json.stdout) as {
      schema: string;
      files: string[];
      renames: unknown[];
      deletes: unknown[];
    };
    expect(document).toEqual({
      schema: "ts-quality/file-selector/v1",
      files: ["a.ts"],
      renames: [],
      deletes: [],
    });
    expect(`${document.files.join("\n")}\n`).toBe(staged.stdout);
  });
});

test("a rename emits the new path and records the old path only in JSON", async () => {
  await withDir(async (dir) => {
    await initRepo(dir, {
      "a.ts": "export const a = 1;\n",
      "b.ts": "export const b = 1;\n",
    });
    await mkdir(path.join(dir, "sub"));
    await runGit(["mv", "a.ts", "sub/c.ts"], dir);
    const text = await runCli(dir);
    expect(text.exitCode).toBe(0);
    expect(text.stderr).toBe("");
    expect(pathsFromSelectorStdout(text.stdout)).toEqual(["sub/c.ts"]);
    const json = JSON.parse(
      (await runCli(dir, ["--format", "json"])).stdout,
    ) as {
      files: string[];
      renames: { from: string; to: string }[];
      deletes: string[];
    };
    expect(json.files).toEqual(["sub/c.ts"]);
    expect(json.renames).toEqual([{ from: "a.ts", to: "sub/c.ts" }]);
    expect(json.deletes).toEqual([]);
    expect(json.files).not.toContain("a.ts");
  });
});

test("a staged delete is omitted and is not an error", async () => {
  await withDir(async (dir) => {
    await initRepo(dir, {
      "a.ts": "export const a = 1;\n",
      "b.ts": "export const b = 1;\n",
    });
    await Bun.write(path.join(dir, "a.ts"), "export const a = 2;\n");
    await runGit(["add", "a.ts"], dir);
    await runGit(["rm", "-q", "b.ts"], dir);
    const text = await runCli(dir);
    expect(text.exitCode).toBe(0);
    expect(text.stderr).toBe("");
    expect(pathsFromSelectorStdout(text.stdout)).toEqual(["a.ts"]);
    const json = JSON.parse(
      (await runCli(dir, ["--format", "json"])).stdout,
    ) as {
      files: string[];
      deletes: string[];
    };
    expect(json.files).toEqual(["a.ts"]);
    expect(json.deletes).toEqual(["b.ts"]);
    await runGit(["restore", "--staged", "--worktree", "a.ts"], dir);
    const onlyDelete = await runCli(dir);
    expect(onlyDelete.exitCode).toBe(0);
    expect(onlyDelete.stdout).toBe("");
    expect(onlyDelete.stderr).toBe("");
  });
});

test("a fully staged file passes when another file is only dirty in the worktree", async () => {
  await withDir(async (dir) => {
    await initRepo(dir, {
      "a.ts": "export const a = 1;\n",
      "b.ts": "export const b = 1;\n",
    });
    await Bun.write(path.join(dir, "a.ts"), "export const a = 2;\n");
    await runGit(["add", "a.ts"], dir);
    await Bun.write(path.join(dir, "b.ts"), "export const b = 9;\n");
    const result = await runCli(dir);
    expect(result.exitCode).toBe(0);
    expect(pathsFromSelectorStdout(result.stdout)).toEqual(["a.ts"]);
  });
});

test("a partially staged path refuses the whole list", async () => {
  await withDir(async (dir) => {
    await initRepo(dir, {
      "a.ts": "export const a = 1;\n",
      "b.ts": "export const b = 1;\n",
    });
    await Bun.write(path.join(dir, "a.ts"), "export const a = 2;\n");
    await Bun.write(path.join(dir, "b.ts"), "export const b = 2;\n");
    await runGit(["add", "a.ts", "b.ts"], dir);
    await Bun.write(
      path.join(dir, "a.ts"),
      "export const a = 2;\nexport const extra = 3;\n",
    );
    const result = await runCli(dir, ["--format", "json"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("file-selector: partially staged: a.ts\n");
  });
});

test("an index with no commit lists staged paths", async () => {
  await withDir(async (dir) => {
    await runGit(["init", "-q", "-b", "main"], dir);
    await Bun.write(path.join(dir, "a.ts"), "export const a = 1;\n");
    await runGit(["add", "a.ts"], dir);
    const result = await runCli(dir);
    expect(result.exitCode).toBe(0);
    expect(pathsFromSelectorStdout(result.stdout)).toEqual(["a.ts"]);
  });
});

test("--since lists commits in the range and refuses a dirty selected path", async () => {
  await withDir(async (dir) => {
    await initRepo(dir, {
      "a.ts": "export const a = 1;\n",
      "b.ts": "export const b = 1;\n",
    });
    await Bun.write(path.join(dir, "a.ts"), "export const a = 2;\n");
    await runGit(["add", "a.ts"], dir);
    await runGit(
      [
        "-c",
        "commit.gpgsign=false",
        "-c",
        "core.hooksPath=/dev/null",
        "commit",
        "-q",
        "-m",
        "edit a",
      ],
      dir,
    );
    await Bun.write(path.join(dir, "b.ts"), "export const b = 2;\n");
    const clean = await runCli(dir, ["--since", "HEAD~1"]);
    expect(clean.exitCode).toBe(0);
    expect(pathsFromSelectorStdout(clean.stdout)).toEqual(["a.ts"]);
    await Bun.write(path.join(dir, "a.ts"), "export const a = 3;\n");
    const dirty = await runCli(dir, ["--since", "HEAD~1"]);
    expect(dirty.exitCode).toBe(1);
    expect(dirty.stdout).toBe("");
    expect(dirty.stderr).toBe("file-selector: partially staged: a.ts\n");
  });
});

test("usage errors and a non-repository exit 2 with empty stdout", async () => {
  await withDir(async (dir) => {
    await initRepo(dir, { "a.ts": "export const a = 1;\n" });
    const both = await runCli(dir, ["--staged", "--since", "HEAD"]);
    expect(both.exitCode).toBe(2);
    expect(both.stdout).toBe("");
    expect(both.stderr).toContain("--staged and --since");
    const missing = await runCli(dir, ["--since", "not-a-rev"]);
    expect(missing.exitCode).toBe(2);
    expect(missing.stdout).toBe("");
    const help = await runCli(dir, ["--help"]);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("--files-from -");
    const version = await runCli(dir, ["--version"]);
    expect(version.exitCode).toBe(0);
    expect(version.stdout).toBe("0.1.0\n");
  });
  await withDir(async (dir) => {
    const result = await runCli(dir);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("not a git repository");
  });
});

test("the selector honors GIT_INDEX_FILE pointing at an alternate index", async () => {
  await withDir(async (dir) => {
    await initRepo(dir, {
      "a.ts": "export const a = 1;\n",
      "b.ts": "export const b = 1;\n",
    });
    await Bun.write(path.join(dir, "a.ts"), "export const a = 2;\n");
    const alt = path.join(dir, "alt-index");
    const indexEnv = { GIT_INDEX_FILE: alt };
    await runGit(["read-tree", "HEAD"], dir, indexEnv);
    await runGit(["add", "a.ts"], dir, indexEnv);
    const mainIndex = await runCli(dir);
    expect(mainIndex.exitCode).toBe(0);
    expect(pathsFromSelectorStdout(mainIndex.stdout)).toEqual([]);
    const alternate = await runCli(dir, [], indexEnv);
    expect(alternate.exitCode).toBe(0);
    expect(alternate.stderr).toBe("");
    expect(pathsFromSelectorStdout(alternate.stdout)).toEqual(["a.ts"]);
  });
});

test("a staged rename after the selected range is refused", async () => {
  await withDir(async (dir) => {
    await initRepo(dir, { "a.ts": "export const a = 1;\n" });
    await Bun.write(path.join(dir, "a.ts"), "export const a = 2;\n");
    await runGit(["add", "a.ts"], dir);
    await runGit(
      [
        "-c",
        "commit.gpgsign=false",
        "-c",
        "core.hooksPath=/dev/null",
        "commit",
        "-q",
        "-m",
        "edit a",
      ],
      dir,
    );
    await runGit(["mv", "a.ts", "b.ts"], dir);
    const result = await runCli(dir, ["--since", "HEAD~1"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("file-selector: partially staged: a.ts\n");
  });
});

test("a repository directory with a trailing space stays that directory", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "file-selector-"));
  const dir = path.join(parent, "repo ");
  try {
    await mkdir(dir);
    await initRepo(dir, { "a.ts": "export const a = 1;\n" });
    await Bun.write(path.join(dir, "a.ts"), "export const a = 2;\n");
    await runGit(["add", "a.ts"], dir);
    const result = await runCli(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(pathsFromSelectorStdout(result.stdout)).toEqual(["a.ts"]);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
