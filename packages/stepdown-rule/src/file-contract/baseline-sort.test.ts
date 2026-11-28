import { describe, expect, it } from "bun:test";
import { BASELINE_VERSION } from "./types";
import { serializeBaseline } from "./baseline";

describe("baseline key ordering", () => {
  it("serializes files keys in UTF-16 code unit order (B before _x before a)", () => {
    const text = serializeBaseline({
      version: BASELINE_VERSION,
      files: {
        "src/a.ts": 1,
        "src/B.ts": 1,
        "src/_x.ts": 1,
      },
    });
    const parsed = JSON.parse(text) as { files: Record<string, number> };
    const keys = Object.keys(parsed.files);
    expect(keys).toEqual(["src/B.ts", "src/_x.ts", "src/a.ts"]);
  });
});
