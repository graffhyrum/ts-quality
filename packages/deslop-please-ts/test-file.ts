// Single owner for "is this a test file?" recognition.
// Every lint, gate, and tool that needs to skip or treat test files
// MUST call this function instead of inlining its own suffix check.

const TEST_SUFFIXES = [".test.ts", ".spec.ts"] as const;

export function isTestFile(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/");
  // Files under a __tests__ directory are test files regardless of name.
  if (segments.includes("__tests__")) return true;
  const base = segments.pop() ?? normalized;
  return TEST_SUFFIXES.some((suffix) => base.endsWith(suffix));
}
