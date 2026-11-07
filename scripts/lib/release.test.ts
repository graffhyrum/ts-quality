import { describe, expect, test } from "bun:test";
import { assetNameProblems, parsePlanArgs } from "./args.ts";
import { changelogSection } from "./changelog.ts";
import { dirtyPaths } from "./export.ts";
import {
  compareSemver,
  packageVerdict,
  releasedVersions,
  repoProblems,
  type PackageFacts,
} from "./readiness.ts";

const HEAD = "h".repeat(40);

describe("parsePlanArgs", () => {
  test("accepts flags before or after the output directory", () => {
    expect(parsePlanArgs(["--repo", "o/r", "out"])).toEqual({
      outDir: "out",
      repo: "o/r",
      mode: "dry-run",
    });
    expect(parsePlanArgs(["out", "--release", "--repo", "o/r"])).toEqual({
      outDir: "out",
      repo: "o/r",
      mode: "release",
    });
  });

  test("release mode requires a strict owner/name", () => {
    expect(() => parsePlanArgs(["out", "--release"])).toThrow(
      "--release needs --repo",
    );
    expect(() =>
      parsePlanArgs(["out", "--release", "--repo", "OWNER"]),
    ).toThrow();
    expect(() => parsePlanArgs(["out", "--repo", "a/b/c"])).toThrow(
      "invalid --repo",
    );
  });

  test("rejects unknown flags and extra positionals", () => {
    expect(() => parsePlanArgs(["out", "--bogus"])).toThrow();
    expect(() => parsePlanArgs(["out", "extra"])).toThrow("usage");
  });
});

describe("readiness", () => {
  const facts = (overrides: Partial<PackageFacts> = {}): PackageFacts => ({
    dir: "packages/crap4ts",
    name: "@graffhyrum/crap4ts",
    version: "2.1.4",
    tags: ["crap4ts/v2.1.3", "crap4ts/v2.0.0"],
    currentTagTarget: null,
    changedSinceLastRelease: true,
    ...overrides,
  });

  test("reads versions from imported and new tag formats", () => {
    expect(
      releasedVersions("packages/crap4ts", [
        "crap4ts/v2.1.3",
        "crap4ts-v2.1.4",
        "mutate4ts/v1.0.0",
      ]),
    ).toEqual(["2.1.3", "2.1.4"]);
  });

  test("compares semver numerically", () => {
    expect(compareSemver("2.10.0", "2.9.9")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
  });

  test("a version above every released one is releasable", () => {
    expect(packageVerdict(facts(), HEAD)).toEqual({
      kind: "release",
      dir: "packages/crap4ts",
    });
  });

  test("a version shipped from the original repo is never republished", () => {
    const verdict = packageVerdict(facts({ version: "2.1.3" }), HEAD);
    expect(verdict.kind).toBe("problem");
  });

  test("a version below a released one is rejected", () => {
    expect(packageVerdict(facts({ version: "2.0.1" }), HEAD).kind).toBe(
      "problem",
    );
  });

  test("an existing new-format tag is already released only when the package is unchanged", () => {
    const tagged = facts({
      tags: ["crap4ts-v2.1.4"],
      currentTagTarget: "c".repeat(40),
    });
    expect(
      packageVerdict({ ...tagged, changedSinceLastRelease: false }, HEAD).kind,
    ).toBe("already-released");
    expect(packageVerdict(tagged, HEAD).kind).toBe("problem");
  });

  test("repo must be main, clean, and have no pending changesets", () => {
    expect(
      repoProblems({
        pendingChangesets: [],
        head: HEAD,
        ref: "refs/heads/main",
        clean: true,
      }),
    ).toEqual([]);
    expect(
      repoProblems({
        pendingChangesets: ["a.md"],
        head: HEAD,
        ref: "refs/heads/feature",
        clean: false,
      }),
    ).toHaveLength(3);
  });
});

describe("release notes and assets", () => {
  const changelog =
    "# pkg\n\n## 1.2.1\n\n### Patch Changes\n\n- fix\n\n## 1.2.0\n\n- old\n";

  test("extracts exactly one version section", () => {
    expect(changelogSection(changelog, "1.2.1")).toBe(
      "### Patch Changes\n\n- fix",
    );
    expect(changelogSection(changelog, "9.9.9")).toBeNull();
  });

  test("asset names must be safe and unique", () => {
    expect(assetNameProblems(["/a/x-1.0.0.tgz", "/b/SHA256SUMS"])).toEqual([]);
    expect(assetNameProblems(["/a/x y.tgz", "/a/z.tgz", "/b/z.tgz"])).toEqual([
      'unsafe asset name "x y.tgz"',
      "duplicate asset name z.tgz",
    ]);
  });
});

describe("export dirty check", () => {
  test("lists modified and untracked paths", () => {
    expect(
      dirtyPaths(
        " M templates/ts-template/a.ts\0?? templates/ts-template/b.ts\0",
      ),
    ).toEqual(["templates/ts-template/a.ts", "templates/ts-template/b.ts"]);
    expect(dirtyPaths("")).toEqual([]);
  });
});

describe("workflows", () => {
  const load = async (name: string) =>
    Bun.YAML.parse(
      await Bun.file(`.github/workflows/${name}`).text(),
    ) as Record<string, any>;

  test("release runs only on main, serialized, fail-closed before drafting", async () => {
    const wf = await load("release.yml");
    expect(Object.keys(wf.on)).toEqual(["workflow_dispatch"]);
    expect(wf.jobs.draft.if).toBe("github.ref == 'refs/heads/main'");
    expect(wf.concurrency.group).toBe("draft-releases");
    const runs: string[] = wf.jobs.draft.steps.flatMap((s: { run?: string }) =>
      s.run ? [s.run] : [],
    );
    const plan = runs.findIndex((r) => r.includes("--release"));
    const drafts = runs.findIndex((r) => r.includes("draft-releases"));
    expect(plan).toBeGreaterThan(-1);
    expect(drafts).toBeGreaterThan(plan);
    expect(runs.some((r) => r.includes("publish"))).toBe(false);
  });

  test("ci can be dispatched manually and runs every gate", async () => {
    const wf = await load("ci.yml");
    expect(Object.keys(wf.on)).toContain("workflow_dispatch");
    const runs = wf.jobs.gates.steps
      .flatMap((s: { run?: string }) => (s.run ? [s.run] : []))
      .join("\n");
    for (const gate of [
      "bun audit",
      "check:root",
      "bun run vet",
      "test:plain",
      "smoke:export",
    ])
      expect(runs).toContain(gate);
  });

  test("version workflow never publishes", async () => {
    const wf = await load("version.yml");
    const action = wf.jobs.version.steps.find((s: { uses?: string }) =>
      s.uses?.startsWith("changesets/action"),
    );
    expect(action.with.publish).toBeUndefined();
  });
});
