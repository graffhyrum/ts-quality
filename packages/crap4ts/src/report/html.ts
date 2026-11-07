import type { ProjectSummary, FunctionCrap } from "../types";

export function renderHtml(summary: ProjectSummary): string {
  if (summary.functions.length === 0) return renderEmptyHtml(summary);
  return renderFullHtml(summary);
}

function renderEmptyHtml(summary: ProjectSummary): string {
  return [
    renderHead(),
    `<p>No crappy functions found. Use <code>--all</code> to see all functions.</p>`,
    renderSummaryFooter(summary),
    renderTail(),
  ].join("\n");
}

function renderFullHtml(summary: ProjectSummary): string {
  return [
    renderHead(),
    renderTableHtml(summary),
    renderSummaryFooter(summary),
    renderScript(),
    renderTail(),
  ].join("\n");
}

function renderHead(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CRAP Report</title>
<style>${renderStyles()}</style>
</head>
<body>
<h1>CRAP Report</h1>`;
}

function renderStyles(): string {
  return `
  body { font-family: system-ui, sans-serif; margin: 2rem; background: #f5f5f5; }
  h1 { color: #333; }
  table { border-collapse: collapse; width: 100%; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  th, td { padding: 0.5rem 1rem; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #333; color: white; cursor: pointer; user-select: none; }
  th:hover { background: #555; }
  .crappy { background: #fff0f0; }
  .ok { color: #2a7; }
  .bad { color: #d33; font-weight: bold; }
  .warn { color: #b80; }
  .summary { margin-top: 1rem; padding: 1rem; background: white; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .flagged { color: #d33; font-weight: bold; }
  .pass { color: #2a7; font-weight: bold; }`;
}

function renderTableHtml(summary: ProjectSummary): string {
  return `<table id="crap-table">
<thead>
<tr>
  <th onclick="sortTable(0)">Function</th>
  <th onclick="sortTable(1)">Location</th>
  <th onclick="sortTable(2)">Complexity</th>
  <th onclick="sortTable(3)">Coverage</th>
  <th onclick="sortTable(4)">CRAP</th>
  <th onclick="sortTable(5)">Status</th>
</tr>
</thead>
<tbody>
${summary.functions.map(renderRow).join("\n")}
</tbody>
</table>`;
}

function renderSummaryFooter(summary: ProjectSummary): string {
  const cls = summary.isFlagged ? "flagged" : "pass";
  const label = summary.isFlagged ? "FLAGGED" : "PASS";
  return `<div class="summary">
  ${htmlCountLabel(summary)} |
  <strong>Crappy:</strong> ${summary.crappyCount} (${summary.crappyPercent.toFixed(1)}%) |
  <strong>Project:</strong> <span class="${cls}">${label}</span>
</div>`;
}

function htmlCountLabel(summary: ProjectSummary): string {
  if (summary.functions.length < summary.totalFunctions) {
    return `<strong>Showing:</strong> ${summary.functions.length} of ${summary.totalFunctions} functions`;
  }
  return `<strong>Total:</strong> ${summary.totalFunctions} functions`;
}

function renderScript(): string {
  return `<script>
let sortDir = {};
function sortTable(col) {
  const table = document.getElementById("crap-table");
  const tbody = table.querySelector("tbody");
  const rows = Array.from(tbody.querySelectorAll("tr"));
  sortDir[col] = !sortDir[col];
  rows.sort((a, b) => {
    const av = a.children[col].getAttribute("data-sort") || a.children[col].textContent;
    const bv = b.children[col].getAttribute("data-sort") || b.children[col].textContent;
    const an = parseFloat(av), bn = parseFloat(bv);
    const cmp = isNaN(an) || isNaN(bn) ? av.localeCompare(bv) : an - bn;
    return sortDir[col] ? cmp : -cmp;
  });
  rows.forEach(r => tbody.appendChild(r));
}
</script>`;
}

function renderTail(): string {
  return `</body>
</html>`;
}

function renderRow(fn: FunctionCrap): string {
  const cls = fn.isCrappy ? ' class="crappy"' : "";
  const covText = formatCoverage(fn.coverage);
  const covSort = fn.coverage === null ? "-1" : String(fn.coverage);
  const statusCls = fn.coverage === null ? "warn" : fn.isCrappy ? "bad" : "ok";
  return `<tr${cls}>
  <td>${escapeHtml(fn.name)}</td>
  <td>${escapeHtml(fn.filePath)}:${fn.startLine}</td>
  <td data-sort="${fn.complexity}">${fn.complexity}</td>
  <td data-sort="${covSort}">${covText}</td>
  <td data-sort="${fn.crapScore}">${fn.crapScore.toFixed(1)}</td>
  <td class="${statusCls}">${statusLabel(fn)}</td>
</tr>`;
}

function formatCoverage(coverage: number | null): string {
  return coverage === null ? "N/A" : `${(coverage * 100).toFixed(1)}%`;
}

function statusLabel(fn: FunctionCrap): string {
  if (fn.coverage === null) return "&#9888; no cov";
  if (fn.isCrappy) return "CRAPPY";
  return "OK";
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
