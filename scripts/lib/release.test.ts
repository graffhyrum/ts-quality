import { describe, expect, test } from "bun:test";
import { assetNameProblems, parsePlanArgs } from "./args.ts";
import { changelogSection } from "./changelog.ts";
import { dirtyPaths } from "./export.ts";
import {
  assetCheckProblem,
  classifyReleaseLookup,
  latestPublished,
  notedSha256,
} from "./published.ts";
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

describe("published release selection", () => {
  const rel = (tagName: string, isDraft = false, isPrerelease = false) => ({
    tagName,
    isDraft,
    isPrerelease,
  });

  test("picks the newest published release for the tool, ignoring drafts, prereleases, and other tools", () => {
    const releases = [
      rel("crap4ts-v2.1.4"),
      rel("crap4ts-v2.10.0", true),
      rel("crap4ts-v2.2.0", false, true),
      rel("crap4ts-v2.1.10"),
      rel("mutate4ts-v9.0.0"),
    ];
    expect(latestPublished("crap4ts", releases)).toEqual({
      tag: "crap4ts-v2.1.10",
      version: "2.1.10",
    });
  });

  test("returns null when the tool has no published release (fail closed)", () => {
    expect(
      latestPublished("stepdown-rule", [rel("stepdown-rule-v0.4.7", true)]),
    ).toBeNull();
  });

  test("reads the sha256 recorded for an asset in release notes", () => {
    const sha = "a".repeat(64);
    expect(notedSha256(`- \`x-1.0.0.tgz\` \`${sha}\``, "x-1.0.0.tgz")).toBe(
      sha,
    );
    expect(
      notedSha256(`- \`x-1.0.0.tgz\` \`${sha}\``, "y-1.0.0.tgz"),
    ).toBeNull();
  });
});

describe("release lookup fails closed", () => {
  test("only gh's exact not-found message counts as absent", () => {
    expect(classifyReleaseLookup(0, "")).toBe("exists");
    expect(classifyReleaseLookup(1, "release not found\n")).toBe("absent");
  });

  test("auth, network, and rate-limit failures are errors", () => {
    expect(classifyReleaseLookup(1, "HTTP 401: Bad credentials")).toBe("error");
    expect(
      classifyReleaseLookup(1, "dial tcp: lookup api.github.com: no such host"),
    ).toBe("error");
    expect(classifyReleaseLookup(1, "HTTP 403: API rate limit exceeded")).toBe(
      "error",
    );
    expect(classifyReleaseLookup(4, "")).toBe("error");
  });
});

describe("template spec asset checks", () => {
  const sha = "b".repeat(64);

  test("a matching download passes", () => {
    expect(assetCheckProblem(sha, 200, sha)).toBeNull();
  });

  test("a failed download fails closed and names the public-repo requirement", () => {
    expect(assetCheckProblem(sha, 404, null)).toContain("HTTP 404");
    expect(assetCheckProblem(sha, 404, null)).toContain("public repo");
  });

  test("a hash mismatch or missing noted hash fails", () => {
    expect(assetCheckProblem(sha, 200, "c".repeat(64))).toContain(
      "does not match",
    );
    expect(assetCheckProblem(null, 200, sha)).toContain("no sha256");
  });

  test("the newest published release wins even when a newer draft exists", () => {
    const releases = [
      { tagName: "mutate4ts-v1.0.2", isDraft: true, isPrerelease: false },
      { tagName: "mutate4ts-v1.0.1", isDraft: false, isPrerelease: false },
    ];
    expect(latestPublished("mutate4ts", releases)?.tag).toBe(
      "mutate4ts-v1.0.1",
    );
  });
});
