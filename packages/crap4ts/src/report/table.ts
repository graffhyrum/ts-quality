import type { ProjectSummary, FunctionCrap } from "../types";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

export function renderTable(summary: ProjectSummary): string {
  if (summary.functions.length === 0) return renderEmptyTable(summary);
  return renderFullTable(summary);
}

function renderEmptyTable(summary: ProjectSummary): string {
  return [
    `No crappy functions found. Use --all to see all functions.`,
    "",
    formatFooter(summary),
  ].join("\n");
}

function renderFullTable(summary: ProjectSummary): string {
  const rows = summary.functions.map(formatRow);
  const widths = computeWidths(rows);
  const lines = [
    formatHeader(widths),
    separator(widths),
    ...rows.map((r) => formatDataRow(r, widths)),
    separator(widths),
    formatFooter(summary),
  ];
  return lines.join("\n");
}

type Row = [string, string, string, string, string, string];

function formatRow(fn: FunctionCrap): Row {
  const covStr = fn.coverage === null ? "N/A" : `${(fn.coverage * 100).toFixed(1)}%`;
  const status = statusLabel(fn);
  return [
    fn.name,
    `${fn.filePath}:${fn.startLine}`,
    String(fn.complexity),
    covStr,
    fn.crapScore.toFixed(1),
    status,
  ];
}

function statusLabel(fn: FunctionCrap): string {
  if (fn.coverage === null) return `${YELLOW}⚠ no cov${RESET}`;
  if (fn.isCrappy) return `${RED}CRAPPY${RESET}`;
  return `${GREEN}OK${RESET}`;
}

const HEADERS: Row = ["Function", "Location", "Cmplx", "Coverage", "CRAP", "Status"];

function computeWidths(rows: Row[]): number[] {
  return HEADERS.map((h, i) => Math.max(h.length, ...rows.map((r) => stripAnsi(r[i]).length)));
}

function formatHeader(widths: number[]): string {
  return `${BOLD}${HEADERS.map((h, i) => h.padEnd(widths[i])).join("  ")}${RESET}`;
}

function separator(widths: number[]): string {
  return `${DIM}${widths.map((w) => "─".repeat(w)).join("──")}${RESET}`;
}

function formatDataRow(row: Row, widths: number[]): string {
  return row
    .map((cell, i) => {
      const plain = stripAnsi(cell);
      return `${cell}${" ".repeat(Math.max(0, widths[i] - plain.length))}`;
    })
    .join("  ");
}

function formatFooter(summary: ProjectSummary): string {
  const flag = summary.isFlagged ? `${RED}FLAGGED${RESET}` : `${GREEN}PASS${RESET}`;
  return [
    `${BOLD}${countLabel(summary)}${RESET}`,
    `Crappy: ${summary.crappyCount} (${summary.crappyPercent.toFixed(1)}%)`,
    `Project: ${flag}`,
  ].join("  |  ");
}

function countLabel(summary: ProjectSummary): string {
  if (summary.functions.length < summary.totalFunctions) {
    return `Showing ${summary.functions.length} of ${summary.totalFunctions} functions`;
  }
  return `Total: ${summary.totalFunctions} functions`;
}

function stripAnsi(str: string): string {
  // oxlint-disable-next-line no-control-regex -- intentional ANSI escape stripping
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}
