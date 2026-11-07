import type { ProjectSummary, TriageAction } from "./types";

export type ClassifyResult = {
  isFlagged: boolean;
  crappyPercent: number;
  actions: TriageAction[];
};

export function classify(
  summary: ProjectSummary,
  threshold: number,
  every = false,
): ClassifyResult {
  const { isFlagged, crappyPercent } = summary;

  if (!every && !isFlagged) {
    return { isFlagged, crappyPercent, actions: [] };
  }

  const actions: TriageAction[] = [];
  for (const fn of summary.functions) {
    if (!fn.isCrappy) continue;

    const base = {
      filePath: fn.filePath,
      startLine: fn.startLine,
      endLine: fn.endLine,
      name: fn.name,
      complexity: fn.complexity,
      crapScore: fn.crapScore,
    };
    if (fn.coverage === null) {
      actions.push({ ...base, kind: "fix-join", coverage: null, reference: "join.md" });
      continue;
    }
    if (fn.complexity >= threshold) {
      actions.push({ ...base, kind: "split", coverage: fn.coverage, reference: "split.md" });
      continue;
    }
    actions.push({ ...base, kind: "test", coverage: fn.coverage, reference: "test.md" });
  }

  actions.sort((a, b) => {
    if (b.crapScore !== a.crapScore) return b.crapScore - a.crapScore;
    if (a.startLine !== b.startLine) return a.startLine - b.startLine;
    if (a.filePath !== b.filePath) return a.filePath < b.filePath ? -1 : 1;
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return 0;
  });

  return { isFlagged, crappyPercent, actions };
}
