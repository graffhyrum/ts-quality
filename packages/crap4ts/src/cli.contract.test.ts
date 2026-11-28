import { describe, expect, test } from "bun:test";
import { parseCli } from "./cli";
import { CrapError } from "./types";

describe("file-list CLI validation", () => {
  test("rejects unknown report format", async () => {
    await expect(parseCli(["node", "crap4ts", "--report", "table"])).rejects.toThrow(CrapError);
  });

  test("rejects report json with legacy json output", async () => {
    await expect(parseCli(["node", "crap4ts", "--report", "json", "-o", "json"])).rejects.toThrow(
      CrapError,
    );
  });

  test("rejects contract flags with --init", async () => {
    await expect(parseCli(["node", "crap4ts", "--init", "--files", "a.ts"])).rejects.toThrow(
      CrapError,
    );
  });

  test("rejects stdin on both file and rename maps", async () => {
    await expect(
      parseCli(["node", "crap4ts", "--files-from", "-", "--renames-from", "-"]),
    ).rejects.toThrow(CrapError);
  });

  test("rejects seed with a file list", async () => {
    await expect(parseCli(["node", "crap4ts", "--seed", "--files", "a.ts"])).rejects.toThrow(
      CrapError,
    );
  });

  test("rejects seed combined with update-baseline", async () => {
    await expect(parseCli(["node", "crap4ts", "--seed", "--update-baseline"])).rejects.toThrow(
      CrapError,
    );
  });

  test("parses repeatable --files flags", async () => {
    const config = await parseCli([
      "node",
      "crap4ts",
      "--files",
      "src/a.ts",
      "--files",
      "src/b.ts",
    ]);
    expect(config.targeting.filesFlags).toEqual(["src/a.ts", "src/b.ts"]);
  });
});
