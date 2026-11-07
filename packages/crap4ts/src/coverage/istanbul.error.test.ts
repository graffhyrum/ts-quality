import { test, expect, describe } from "bun:test";
import { parseIstanbul } from "./istanbul";
import { CrapError } from "../types";

describe("Istanbul parser error paths", () => {
  test("throws CrapError on invalid JSON", () => {
    expect(() => parseIstanbul("not json", "bad.json")).toThrow(CrapError);
  });

  test("throws CrapError on missing statementMap", () => {
    const data = JSON.stringify({ "file.ts": { s: {} } });
    expect(() => parseIstanbul(data, "bad.json")).toThrow(CrapError);
  });

  test("throws CrapError on invalid statement location", () => {
    const data = JSON.stringify({
      "file.ts": {
        statementMap: { "0": "not-a-location" },
        s: { "0": 1 },
      },
    });
    expect(() => parseIstanbul(data, "bad.json")).toThrow(CrapError);
  });
});
