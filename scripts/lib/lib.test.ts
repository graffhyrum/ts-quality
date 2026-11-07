import { describe, expect, test } from "bun:test";
import {
  hookSetupProblems,
  isExportable,
  rewriteWorkspaceSpecs,
} from "./export.ts";
import { packedProblems } from "./packed.ts";
import {
  releaseAssetUrl,
  releaseTag,
  tarballName,
  TOOL_PACKAGES,
} from "./workspace.ts";

describe("workspace naming", () => {
  test("tarball names match bun pm pack output", () => {
    expect(tarballName("@graff/rule-validator", "1.2.0")).toBe(
      "graff-rule-validator-1.2.0.tgz",
    );
    expect(tarballName("mutate4ts", "1.0.0")).toBe("mutate4ts-1.0.0.tgz");
  });

  test("release tags come from the directory and current version, not imported tags", () => {
    expect(releaseTag("packages/stepdown-rule", "0.4.7")).toBe(
      "stepdown-rule-v0.4.7",
    );
    expect(releaseTag("packages/crap4ts", "2.1.4")).not.toBe("crap4ts/v2.1.4");
  });

  test("asset urls are GitHub release download urls", () => {
    expect(
      releaseAssetUrl("o/r", "crap4ts-v2.1.4", "graffhyrum-crap4ts-2.1.4.tgz"),
    ).toBe(
      "https://github.com/o/r/releases/download/crap4ts-v2.1.4/graffhyrum-crap4ts-2.1.4.tgz",
    );
  });

  test("mutate4ts builds before the template gates run", () => {
    expect(TOOL_PACKAGES.at(-1)?.gates).toContain("build");
  });
});

describe("packedProblems", () => {
  const manifest = {
    name: "x",
    version: "1.0.0",
    bin: { x: "./src/cli.ts" },
    main: "./dist/index.js",
  };

  test("accepts a tarball containing every entry target", () => {
    expect(
      packedProblems(
        ["package/src/cli.ts", "package/dist/index.js", "package/package.json"],
        manifest,
      ),
    ).toEqual([]);
  });

  test("reports missing bins, workspace specifiers, and forbidden files", () => {
    const problems = packedProblems(
      ["package/src/a.test.ts", "package/.mcp_data/db"],
      {
        ...manifest,
        exports: { ".": "./dist/index.js" },
        dependencies: { y: "workspace:*" },
      },
    );
    expect(problems).toEqual([
      "missing entry target src/cli.ts",
      "missing entry target dist/index.js",
      "missing entry target dist/index.js",
      "unresolved workspace specifier for y",
      "forbidden file src/a.test.ts",
      "forbidden file .mcp_data/db",
    ]);
  });

  test("accepts a string bin", () => {
    expect(
      packedProblems(["package/cli.js"], {
        name: "x",
        version: "1",
        bin: "cli.js",
      }),
    ).toEqual([]);
  });
});

test("allows source directories named coverage but not a top-level coverage report", () => {
  expect(
    packedProblems(
      ["package/src/coverage/v8.ts", "package/coverage/lcov.info"],
      {
        name: "x",
        version: "1",
      },
    ),
  ).toEqual(["forbidden file coverage/lcov.info"]);
});

describe("template export rules", () => {
  test("excludes lockfile, hooks, caches, and env files", () => {
    expect(
      [
        "bun.lock",
        ".husky/pre-commit",
        ".env.local",
        "coverage/x",
        "dist/a.js",
      ].filter(isExportable),
    ).toEqual([]);
    expect(isExportable("src/index.ts")).toBe(true);
  });

  test("rewrites workspace specifiers and keeps others", () => {
    const pkg = { devDependencies: { a: "workspace:*", b: "^1.0.0" } };
    expect(rewriteWorkspaceSpecs(pkg, { a: "https://x/a.tgz" })).toEqual({
      devDependencies: { a: "https://x/a.tgz", b: "^1.0.0" },
    });
  });

  test("refuses an unmapped workspace specifier", () => {
    expect(() =>
      rewriteWorkspaceSpecs({ dependencies: { a: "workspace:*" } }, {}),
    ).toThrow("a");
  });

  test("flags git hook auto-setup", () => {
    expect(
      hookSetupProblems({
        scripts: { prepare: "husky" },
        devDependencies: { husky: "^9" },
      }),
    ).toEqual([
      "script prepare installs git hooks",
      "hook manager dependency husky",
    ]);
    expect(
      hookSetupProblems({ scripts: { prepare: "bun run build" } }),
    ).toEqual([]);
  });

  test("the current template manifest installs no hooks", async () => {
    const pkg = await Bun.file("templates/ts-template/package.json").json();
    expect(hookSetupProblems(pkg)).toEqual([]);
  });
});
