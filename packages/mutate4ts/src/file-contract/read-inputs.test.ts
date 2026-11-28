import { test, expect, describe, beforeAll, afterAll, spyOn } from "bun:test";
import * as inputs from "./read-inputs.ts";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPathLines, readRenamePairs, readStdinUtf8, pathExists } from "./read-inputs.ts";

describe("read inputs", () => {
  test("readStdinUtf8 reassembles multi-chunk stdin", async () => {
    const encoder = new TextEncoder();
    const first = encoder.encode("src/");
    const second = encoder.encode("a.ts\n");
    let step = 0;
    const reader = {
      read: async () => {
        if (step === 0) {
          step = 1;
          return { done: false, value: first };
        }
        if (step === 1) {
          step = 2;
          return { done: false, value: second };
        }
        return { done: true, value: undefined };
      },
    };
    const text = await readStdinUtf8(() => reader);
    expect(text).toBe("src/a.ts\n");
  });

  test("readStdinUtf8 decodes UTF-8 paths", async () => {
    const encoder = new TextEncoder();
    const payload = encoder.encode("src/a.ts\n");
    let consumed = false;
    const reader = {
      read: async () => {
        if (consumed) return { done: true, value: undefined };
        consumed = true;
        return { done: false, value: payload };
      },
    };
    const text = await readStdinUtf8(() => reader);
    expect(text).toBe("src/a.ts\n");
  });

  test("readPathLines uses default stdin reader", async () => {
    const encoder = new TextEncoder();
    const payload = encoder.encode("src/b.ts\n");
    let consumed = false;
    const reader = {
      read: async () => {
        if (consumed) return { done: true, value: undefined };
        consumed = true;
        return { done: false, value: payload };
      },
    };
    const stream = spyOn(Bun.stdin, "stream").mockReturnValue({
      getReader: () => reader,
    } as never);
    try {
      const paths = await readPathLines("-", "--files-from");
      expect(paths).toEqual(["src/b.ts"]);
    } finally {
      stream.mockRestore();
    }
  });

  test("readPathLines reads stdin paths", async () => {
    const encoder = new TextEncoder();
    const payload = encoder.encode("src/a.ts\n");
    let consumed = false;
    const reader = {
      read: async () => {
        if (consumed) return { done: true, value: undefined };
        consumed = true;
        return { done: false, value: payload };
      },
    };
    const paths = await readPathLines("-", "--files-from", () => reader);
    expect(paths).toEqual(["src/a.ts"]);
  });

  describe("file path inputs", () => {
    let dir: string;
    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "m4t-read-in-"));
      writeFileSync(join(dir, "paths.txt"), "a.ts\n");
      writeFileSync(join(dir, "nul.txt"), "a\x00.ts\n");
      writeFileSync(join(dir, "bad-rename.txt"), "only-from\n");
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    test("rejects BOM and NUL in path lists", async () => {
      const bom = spyOn(inputs, "readStdinUtf8").mockResolvedValue("\uFEFFa.ts\n");
      await expect(readPathLines("-", "paths")).rejects.toThrow("BOM");
      bom.mockRestore();
      await expect(readPathLines(join(dir, "nul.txt"), "paths")).rejects.toThrow("NUL");
    });

    test("rejects missing files and bad rename lines", async () => {
      await expect(readPathLines(join(dir, "nope.txt"), "paths")).rejects.toThrow("cannot read");
      await expect(readRenamePairs(join(dir, "bad-rename.txt"), "renames")).rejects.toThrow(
        "from<TAB>to",
      );
      writeFileSync(join(dir, "multi-tab.txt"), "a.ts\tb.ts\textra.ts\n");
      await expect(readRenamePairs(join(dir, "multi-tab.txt"), "renames")).rejects.toThrow(
        "from<TAB>to",
      );
      const renameBom = spyOn(inputs, "readStdinUtf8").mockResolvedValue("\uFEFFa.ts\tb.ts\n");
      await expect(readRenamePairs("-", "renames")).rejects.toThrow("BOM");
      renameBom.mockRestore();
    });

    test("pathExists", async () => {
      expect(await pathExists(join(dir, "paths.txt"))).toBe(true);
      expect(await pathExists(join(dir, "missing.txt"))).toBe(false);
    });
  });
});
