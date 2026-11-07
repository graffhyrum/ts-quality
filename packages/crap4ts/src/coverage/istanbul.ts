import { type } from "arktype";
import type { FileCoverage, StatementCoverage } from "../types";
import { CrapError } from "../types";
import { IstanbulFileSchema, IstanbulJsonSchema, StatementLocationSchema } from "../schemas";

export function parseIstanbul(content: string, filePath: string): FileCoverage[] {
  const parsed = IstanbulJsonSchema(content);
  if (parsed instanceof type.errors)
    throw new CrapError(`Invalid coverage file: ${filePath}\n${parsed.summary}`);
  return convertEntries(parsed);
}

function convertEntries(data: Record<string, unknown>): FileCoverage[] {
  const results: FileCoverage[] = [];
  for (const [file, entry] of Object.entries(data)) {
    const validated = IstanbulFileSchema(entry);
    if (validated instanceof type.errors)
      throw new CrapError(`Invalid Istanbul entry for "${file}": ${validated.summary}`);
    results.push(convertFile(file, validated));
  }
  return results;
}

function convertFile(file: string, entry: typeof IstanbulFileSchema.infer): FileCoverage {
  const statements = buildStatements(entry.statementMap, entry.s);
  return { filePath: entry.path ?? file, statements };
}

function buildStatements(
  statementMap: Record<string, unknown>,
  hits: Record<string, number>,
): StatementCoverage[] {
  return Object.entries(statementMap).map(([id, raw]) => {
    const loc = validateLocation(id, raw);
    return { startLine: loc.start.line, endLine: loc.end.line, hits: hits[id] ?? 0 };
  });
}

function validateLocation(id: string, raw: unknown) {
  const result = StatementLocationSchema(raw);
  if (result instanceof type.errors)
    throw new CrapError(`Invalid statement location "${id}": ${result.summary}`);
  return result;
}
