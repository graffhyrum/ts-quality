import { describe, expect, test } from "bun:test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { FileSystem } from "../detect/types";
import { CrapError } from "../types";
import { parseV8 } from "./v8";

const source = "function a() {\n  return 1;\n}\n";

function fsOf(
  readText: (filePath: string) => Promise<string | null>,
  realPath: (filePath: string) => string = (filePath) => filePath,
): FileSystem {
  return {
    exists: async () => true,
    readText,
    realPath: async (filePath) => realPath(filePath),
  };
}

function payload(url: string): string {
  return JSON.stringify({ result: [script(url, "1")] });
}

function script(url: string, scriptId: string) {
  return {
    scriptId,
    url,
    functions: [
      {
        functionName: "a",
        ranges: [{ startOffset: 0, endOffset: 10, count: 2 }],
      },
    ],
  };
}

function payloadWithRange(startOffset: number, endOffset: number, count: number): string {
  return JSON.stringify({
    result: [
      {
        scriptId: "1",
        url: "src/a.ts",
        functions: [
          {
            functionName: "a",
            ranges: [{ startOffset, endOffset, count }],
          },
        ],
      },
    ],
  });
}

describe("V8 parser", () => {
  test("maps a relative url onto source lines", async () => {
    const result = await parseV8(payload("src/a.ts"), "v8.json", {
      sourceRoot: "/repo",
      fs: fsOf(async () => source),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.filePath).toBe(path.resolve("/repo", "src/a.ts"));
    expect(result[0]?.statements[0]).toEqual({ startLine: 1, endLine: 1, hits: 2 });
  });

  test("reads a file url and an absolute path inside the source root", async () => {
    const absolute = path.resolve("src/coverage/v8.ts");
    const fileUrl = pathToFileURL(absolute).href;
    const content = JSON.stringify({
      result: [
        script(fileUrl, "1"),
        script(absolute, "2"),
        { scriptId: "3", url: "https://example.com/a.ts", functions: [] },
        { scriptId: "4", url: "", functions: [] },
      ],
    });
    const reads: string[] = [];
    const result = await parseV8(content, "v8.json", {
      sourceRoot: process.cwd(),
      fs: fsOf(async (filePath) => {
        reads.push(filePath);
        return source;
      }),
    });
    expect(reads).toEqual([fileURLToPath(fileUrl), absolute]);
    expect(result).toHaveLength(2);
  });

  test("does not read a url outside the source root", async () => {
    const outside = path.resolve(process.cwd(), "..", "outside.ts");
    const content = JSON.stringify({
      result: [script(outside, "1"), script("../outside.ts", "2"), script("file:///tmp/a.ts", "3")],
    });
    const reads: string[] = [];
    const result = await parseV8(content, "v8.json", {
      sourceRoot: process.cwd(),
      fs: fsOf(async (filePath) => {
        reads.push(filePath);
        return source;
      }),
    });
    expect(reads).toEqual([]);
    expect(result).toEqual([]);
  });

  test("throws CrapError when the file is not V8 coverage", async () => {
    await expect(parseV8("not json", "bad.json")).rejects.toThrow(CrapError);
    await expect(parseV8("{}", "bad.json")).rejects.toThrow(CrapError);
    await expect(parseV8(payloadWithRange(10, 0, -5), "bad.json")).rejects.toThrow(CrapError);
    await expect(parseV8(payloadWithRange(1.5, 2, 1), "bad.json")).rejects.toThrow(CrapError);
  });

  test("reads a file whose name starts with two dots", async () => {
    const result = await parseV8(payload("..generated/a.ts"), "v8.json", {
      sourceRoot: "/repo",
      fs: fsOf(async () => source),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.filePath).toBe(path.resolve("/repo", "..generated/a.ts"));
  });

  test("throws when an offset is past the end of an empty source", async () => {
    await expect(
      parseV8(payloadWithRange(0, 1, 1), "bad.json", {
        fs: fsOf(async () => ""),
      }),
    ).rejects.toThrow(CrapError);
  });

  test("throws when an offset is past the end of the source", async () => {
    await expect(
      parseV8(payloadWithRange(0, 9999, 1), "bad.json", {
        fs: fsOf(async () => "hi\n"),
      }),
    ).rejects.toThrow(CrapError);
  });

  test("does not read a path whose real path is outside the source root", async () => {
    const root = path.resolve("/repo");
    const link = path.join(root, "link.ts");
    const outside = path.resolve("/outside/secret.ts");
    const reads: string[] = [];
    const result = await parseV8(payload(link), "v8.json", {
      sourceRoot: root,
      fs: fsOf(
        async (filePath) => {
          reads.push(filePath);
          return source;
        },
        (filePath) => (filePath === link ? outside : filePath),
      ),
    });
    expect(reads).toEqual([]);
    expect(result).toEqual([]);
  });

  test("reads the canonical path when it stays inside the source root", async () => {
    const root = path.resolve("/repo");
    const link = path.join(root, "link.ts");
    const target = path.join(root, "src", "real.ts");
    const reads: string[] = [];
    const result = await parseV8(payload(link), "v8.json", {
      sourceRoot: root,
      fs: fsOf(
        async (filePath) => {
          reads.push(filePath);
          return source;
        },
        (filePath) => (filePath === link ? target : filePath),
      ),
    });
    expect(reads).toEqual([target]);
    expect(result[0]?.filePath).toBe(target);
  });

  test("warns and skips a source file it cannot read", async () => {
    const warnings: string[] = [];
    const result = await parseV8(payload("missing-file.ts"), "v8.json", {
      warn: (msg) => warnings.push(msg),
    });
    expect(result).toEqual([]);
    expect(warnings[0]).toContain("cannot read source file");
  });
});
