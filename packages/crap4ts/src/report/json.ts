import type { ProjectSummary } from "../types";

export function renderJson(summary: ProjectSummary): string {
  return JSON.stringify(summary, null, 2);
}
