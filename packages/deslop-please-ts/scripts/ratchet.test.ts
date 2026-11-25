import { expect, test } from "bun:test";
import {
  compareReport,
  parseBaseline,
  parseVetReport,
  type Baseline,
} from "./ratchet.ts";
import type { VetReport } from "./vet.ts";

const baseline: Baseline = {
  version: "1",
  failures: { fmt: 1, test: 1 },
};

test("allows an existing failing gate without loosening the baseline", () => {
  const report = reportFor({ fmt: 1, test: 1 });
  const result = compareReport(report, baseline);

  expect(result.regressions).toEqual([]);
  expect(result.improvements).toEqual([]);
  expect(result.next).toEqual(baseline);
});

test("rejects a newly failing gate", () => {
  const report = reportFor({ fmt: 1, lint: 1, test: 1 });
  const result = compareReport(report, baseline);

  expect(result.regressions).toEqual(["lint: 0 -> 1"]);
  expect(result.next.failures).toEqual({ fmt: 1, test: 1 });
});

test("tightens the baseline when a failing gate passes", () => {
  const report = reportFor({ fmt: 1 });
  const result = compareReport(report, baseline);

  expect(result.regressions).toEqual([]);
  expect(result.improvements).toEqual(["test: 1 -> 0"]);
  expect(result.next.failures).toEqual({ fmt: 1 });
});

test("treats a removed gate as an improvement", () => {
  const report = reportFor({});
  const result = compareReport(report, baseline);

  expect(result.improvements).toEqual(["fmt: 1 -> 0", "test: 1 -> 0"]);
  expect(result.next.failures).toEqual({});
});

test("reports improvements and regressions independently", () => {
  const report = reportFor({ lint: 1 });
  const result = compareReport(report, baseline);

  expect(result.regressions).toEqual(["lint: 0 -> 1"]);
  expect(result.improvements).toEqual(["fmt: 1 -> 0", "test: 1 -> 0"]);
});

test("parses a baseline and rejects negative counts", () => {
  expect(parseBaseline('{"version":"1","failures":{"fmt":1}}')).toEqual({
    version: "1",
    failures: { fmt: 1 },
  });
  expect(() => parseBaseline('{"version":"1","failures":{"fmt":-1}}')).toThrow(
    "invalid vet-ratchet.json",
  );
});

test("parses a vet report", () => {
  expect(parseVetReport('{"results":[{"label":"fmt","exitCode":1}]}')).toEqual({
    results: [{ label: "fmt", exitCode: 1 }],
  });
});

function reportFor(failures: Readonly<Record<string, number>>): VetReport {
  const labels = ["audit", "fmt", "lint", "test"];
  return {
    results: labels.map((label) => ({
      label,
      exitCode: failures[label] === undefined ? 0 : failures[label],
    })),
  };
}
