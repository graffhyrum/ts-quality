import type { FileCoverage, StatementCoverage } from "../types";

export function parseLcov(content: string): FileCoverage[] {
  const results: FileCoverage[] = [];
  let currentFile: string | undefined;
  let statements: StatementCoverage[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("SF:")) {
      currentFile = trimmed.slice(3);
      statements = [];
    } else if (trimmed.startsWith("DA:")) {
      statements.push(parseDA(trimmed));
    } else if (trimmed === "end_of_record" && currentFile) {
      results.push({ filePath: currentFile, statements });
      currentFile = undefined;
      statements = [];
    }
  }

  return results;
}

function parseDA(line: string): StatementCoverage {
  const parts = line.slice(3).split(",");
  const lineNum = parseInt(parts[0], 10);
  const hits = parseInt(parts[1], 10);
  return { startLine: lineNum, endLine: lineNum, hits };
}
