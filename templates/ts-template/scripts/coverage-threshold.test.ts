import { expect, test } from "bun:test";
import { collectFailures } from "./coverage-threshold.ts";

const covered = {
  path: "src/index.ts",
  functionsFound: 1,
  functionsHit: 1,
  linesFound: 4,
  linesHit: 4,
};

test("a source file with no LCOV record fails the gate", () => {
  const failures = collectFailures(
    [covered],
    ["src/index.ts", "src/unused.ts"],
  );
  expect(failures).toEqual(["src/unused.ts: no coverage record"]);
});

test("an absolute LCOV path matches the repo source path", () => {
  const absolute = {
    path: `${process.cwd()}/src/index.ts`,
    functionsFound: 1,
    functionsHit: 1,
    linesFound: 4,
    linesHit: 4,
  };
  expect(collectFailures([absolute], ["src/index.ts"])).toEqual([]);
});

test("a recorded file under the threshold fails the gate", () => {
  const partial = {
    path: "src/index.ts",
    functionsFound: 2,
    functionsHit: 1,
    linesFound: 4,
    linesHit: 4,
  };
  const failures = collectFailures([partial], ["src/index.ts"]);
  expect(failures).toEqual([
    "src/index.ts: 50.0% functions (threshold 100%), 100.0% lines (threshold 100%)",
  ]);
});
