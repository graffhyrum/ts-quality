import type { MutationResult, MutationOutcome } from "./execute.ts";

function formatReport(results: readonly MutationResult[]): string {
  const lines = results.map(formatResult);
  return [...lines, ...formatErrorMessages(results), "", formatSummary(results)].join("\n");
}

function formatErrorMessages(results: readonly MutationResult[]): string[] {
  const counts = new Map<string, number>();
  for (const { outcome } of results) {
    if (outcome.status === "error")
      counts.set(outcome.message, (counts.get(outcome.message) ?? 0) + 1);
  }
  if (counts.size === 0) return [];
  const entries = [...counts].map(([message, n]) => `    ${message} (${n}x)`);
  return ["", "  Error messages:", ...entries];
}

function formatResult(result: MutationResult): string {
  const loc = `${result.site.filePath}:${result.site.line}`;
  const status = result.outcome.status.toUpperCase();
  return `  ${status.padEnd(9)} ${loc} ${result.site.description}`;
}

function formatSummary(results: readonly MutationResult[]): string {
  const killed = count(results, "killed");
  const survived = count(results, "survived");
  const timeout = count(results, "timeout");
  const errors = count(results, "error");
  const score =
    results.length > 0 ? (((killed + timeout) / results.length) * 100).toFixed(1) : "0.0";
  return [
    `Mutation Score: ${score}%`,
    `  ${killed} killed, ${survived} survived, ${timeout} timed out, ${errors} errors`,
    `  ${results.length} total mutations`,
  ].join("\n");
}

function count(results: readonly MutationResult[], status: MutationOutcome["status"]): number {
  return results.filter((r) => r.outcome.status === status).length;
}

export function indentTestOutput(text: string): string {
  return text
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}

export { formatReport, formatSummary };
