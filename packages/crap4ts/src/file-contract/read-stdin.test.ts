import { describe, expect, test } from "bun:test";
import { readStdinUtf8 } from "./read-inputs";

async function bytes(lines: string): Promise<AsyncIterable<Uint8Array>> {
  return {
    async *[Symbol.asyncIterator]() {
      yield new TextEncoder().encode(lines);
    },
  };
}

describe("stdin path list", () => {
  test("readStdinUtf8 decodes UTF-8 chunks", async () => {
    const text = await readStdinUtf8(await bytes("src/a.ts\nsrc/b.ts\n"));
    expect(text).toBe("src/a.ts\nsrc/b.ts\n");
  });
});
