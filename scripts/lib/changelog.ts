/** Returns the `## <version>` section of a Changesets CHANGELOG, or null when absent. */
export function changelogSection(
  changelog: string,
  version: string,
): string | null {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
}
