// Pure rules for exporting the template as a standalone project.

const EXCLUDED = [
  /^bun\.lock$/,
  /^\.husky\//,
  /(^|\/)\.env/,
  /(^|\/)node_modules\//,
  /(^|\/)coverage\//,
  /(^|\/)dist\//,
];

export function isExportable(file: string): boolean {
  return !EXCLUDED.some((pattern) => pattern.test(file));
}

type Manifest = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/** Replaces every workspace: specifier; throws when a mapping is missing. */
export function rewriteWorkspaceSpecs<T extends Manifest>(
  pkg: T,
  specs: Readonly<Record<string, string>>,
): T {
  return {
    ...pkg,
    ...rewriteField(pkg, "dependencies", specs),
    ...rewriteField(pkg, "devDependencies", specs),
  };
}

function rewriteField(
  pkg: Manifest,
  field: "dependencies" | "devDependencies",
  specs: Readonly<Record<string, string>>,
): Manifest {
  const deps = pkg[field];
  if (!deps) return {};
  const rewritten = Object.fromEntries(
    Object.entries(deps).map(([name, spec]) => [
      name,
      resolveSpec(name, spec, specs),
    ]),
  );
  return { [field]: rewritten };
}

function resolveSpec(
  name: string,
  spec: string,
  specs: Readonly<Record<string, string>>,
): string {
  if (!spec.startsWith("workspace:")) return spec;
  const replacement = specs[name];
  if (!replacement)
    throw new Error(`no export specifier for workspace dependency ${name}`);
  return replacement;
}

/** Hook auto-setup must not ship: no prepare/postinstall that installs Git hooks. */
export function hookSetupProblems(pkg: Manifest): string[] {
  const scripts = pkg.scripts ?? {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return [
    ...["prepare", "postinstall"]
      .filter((key) =>
        /husky|hooksPath|lefthook|simple-git-hooks/.test(scripts[key] ?? ""),
      )
      .map((key) => `script ${key} installs git hooks`),
    ...["husky", "lefthook", "simple-git-hooks"]
      .filter((dep) => dep in deps)
      .map((dep) => `hook manager dependency ${dep}`),
  ];
}

/** Paths with uncommitted changes under the template, from `git status --porcelain -z`. */
export function dirtyPaths(porcelainZ: string): string[] {
  return porcelainZ
    .split("\0")
    .filter((entry) => entry.length > 3)
    .map((entry) => entry.slice(3));
}
