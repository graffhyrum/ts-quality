// Checks a packed tarball's file list and manifest against what consumers need.

export type PackedManifest = {
  readonly name: string;
  readonly version: string;
  readonly bin?: Record<string, string> | string;
  readonly main?: string;
  readonly exports?: unknown;
  readonly dependencies?: Record<string, string>;
};

const FORBIDDEN = [
  /(^|\/)node_modules\//,
  /(^|\/)\.mcp_data\//,
  /(^|\/)\.env/,
  /\.test\.ts$/,
  /^coverage\//,
];

export function packedProblems(
  files: readonly string[],
  manifest: PackedManifest,
): string[] {
  const present = new Set(files.map((f) => f.replace(/^package\//, "")));
  return [
    ...missingTargets(present, manifest),
    ...workspaceSpecifiers(manifest),
    ...forbiddenFiles(present),
  ];
}

function missingTargets(
  present: ReadonlySet<string>,
  manifest: PackedManifest,
): string[] {
  return entryTargets(manifest)
    .map((target) => target.replace(/^\.\//, ""))
    .filter((target) => !present.has(target))
    .map((target) => `missing entry target ${target}`);
}

function entryTargets(manifest: PackedManifest): string[] {
  const bins =
    typeof manifest.bin === "string"
      ? [manifest.bin]
      : Object.values(manifest.bin ?? {});
  return [
    ...bins,
    ...(manifest.main ? [manifest.main] : []),
    ...exportTargets(manifest.exports),
  ];
}

function exportTargets(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(exportTargets);
}

function workspaceSpecifiers(manifest: PackedManifest): string[] {
  return Object.entries(manifest.dependencies ?? {})
    .filter(([, spec]) => spec.startsWith("workspace:"))
    .map(([dep]) => `unresolved workspace specifier for ${dep}`);
}

function forbiddenFiles(present: ReadonlySet<string>): string[] {
  return [...present]
    .filter((file) => FORBIDDEN.some((pattern) => pattern.test(file)))
    .map((file) => `forbidden file ${file}`);
}
