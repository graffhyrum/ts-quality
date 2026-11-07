import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  bunCopyFile,
  bunExists,
  bunMkdirp,
  bunReadText,
  bunWriteText,
  spawnCaptured,
  whichBun,
} from "./bun-io";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "crap-io-"));
}

describe("bun file io", () => {
  test("writes a file and reads it back", async () => {
    const dir = tempDir();
    const path = join(dir, "note.txt");
    try {
      expect(await bunExists(path)).toBe(false);
      await bunWriteText(path, "hello\n");
      expect(await bunExists(path)).toBe(true);
      expect(await bunReadText(path)).toBe("hello\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("copies a file into a new directory", async () => {
    const dir = tempDir();
    const from = join(dir, "from.txt");
    const to = join(dir, "nested", "to.txt");
    try {
      await bunWriteText(from, "copied\n");
      await bunCopyFile(from, to);
      expect(await bunReadText(to)).toBe("copied\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("read fails when the file is missing", async () => {
    const dir = tempDir();
    try {
      await expect(bunReadText(join(dir, "missing.txt"))).rejects.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("copy does not create a destination directory when the source is missing", async () => {
    const dir = tempDir();
    const destDir = join(dir, "nested");
    try {
      await expect(bunCopyFile(join(dir, "missing.txt"), join(destDir, "out.txt"))).rejects.toThrow();
      expect(existsSync(destDir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("copy fails when the source is missing", async () => {
    const dir = tempDir();
    try {
      await expect(bunCopyFile(join(dir, "missing.txt"), join(dir, "out.txt"))).rejects.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("creates a directory", () => {
    const dir = tempDir();
    const nested = join(dir, "a", "b");
    try {
      bunMkdirp(nested);
      expect(existsSync(nested)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("whichBun", () => {
  test("finds bun on PATH", () => {
    const found = whichBun("bun");
    expect(found).not.toBeNull();
    expect(existsSync(found ?? "")).toBe(true);
  });

  test("uses the running executable when bun is not on PATH", () => {
    const saved = process.env.PATH;
    process.env.PATH = "";
    try {
      expect(whichBun("bun")).toBe(process.execPath);
      expect(whichBun("not-a-real-bin")).toBeNull();
    } finally {
      process.env.PATH = saved;
    }
  });
});

describe("spawnCaptured", () => {
  test("runs bun, bunx, and another executable", async () => {
    const cwd = tempDir();
    try {
      const bun = await spawnCaptured("bun", ["-e", "console.log('from-bun')"], cwd);
      expect(bun.exitCode).toBe(0);
      expect(bun.stdout).toBe("from-bun\n");

      const bunx = await spawnCaptured("bunx", ["--version"], cwd);
      const direct = await spawnCaptured("bun", ["--version"], cwd);
      expect(bunx.exitCode).toBe(0);
      expect(bunx.stdout).toBe(direct.stdout);
      expect(direct.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);

      const other = await spawnCaptured(process.execPath, ["-e", "console.log('from-other')"], cwd);
      expect(other.exitCode).toBe(0);
      expect(other.stdout).toBe("from-other\n");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
