import { SelectorFailure } from "./failure.ts";
import { gitFailure, spawnGit } from "./git.ts";
import {
  decodeUtf8,
  partialPaths,
  toSelection,
  type Selection,
} from "./name-status.ts";

export type Mode =
  | { readonly kind: "staged" }
  | { readonly kind: "since"; readonly rev: string };

/**
 * Paths changed in the index (staged) or in `<rev>...HEAD` (since).
 * Refuses when an emitted path's worktree bytes are not the bytes the diff describes.
 */
export async function selectPaths(cwd: string, mode: Mode): Promise<Selection> {
  const toplevel = await repoRoot(cwd);
  const hasHead = await gitSucceeds(
    ["rev-parse", "--verify", "--quiet", "HEAD"],
    toplevel,
  );
  if (mode.kind === "since" && !hasHead) {
    throw new SelectorFailure(2, "file-selector: --since needs a commit");
  }
  if (mode.kind === "since") await verifyRev(mode.rev, toplevel);
  const diffArgs =
    mode.kind === "staged"
      ? [
          "diff",
          "--cached",
          "-z",
          "--name-status",
          "--find-renames",
          ...(hasHead ? ["HEAD"] : []),
        ]
      : ["diff", "-z", "--name-status", "--find-renames", `${mode.rev}...HEAD`];
  const diff = await requireGit(diffArgs, toplevel);
  const selection = toSelection(diff);
  const dirtyArgs =
    mode.kind === "staged"
      ? ["diff", "--no-renames", "--name-only", "-z"]
      : ["diff", "--no-renames", "--name-only", "-z", "HEAD"];
  const dirty = await requireGit(dirtyArgs, toplevel);
  const partial = partialPaths(selection.files, splitDirty(dirty));
  if (partial.length > 0) {
    throw new SelectorFailure(
      1,
      partial
        .map((file) => `file-selector: partially staged: ${file}`)
        .join("\n"),
    );
  }
  return selection;
}

/** Git ends `--show-toplevel` with a newline. A trailing space in the path stays. */
function stripTerminatingNewline(text: string): string {
  if (text.endsWith("\r\n")) return text.slice(0, -2);
  if (text.endsWith("\n")) return text.slice(0, -1);
  return text;
}

async function repoRoot(cwd: string): Promise<string> {
  const result = await spawnGit(["rev-parse", "--show-toplevel"], cwd);
  if (result.exitCode !== 0) {
    throw new SelectorFailure(2, "file-selector: not a git repository");
  }
  const root = stripTerminatingNewline(decodeUtf8(result.stdout));
  if (root.length === 0) {
    throw new SelectorFailure(2, "file-selector: not a git repository");
  }
  return root;
}

async function verifyRev(rev: string, cwd: string): Promise<void> {
  const result = await spawnGit(
    ["rev-parse", "--verify", "--quiet", "--end-of-options", `${rev}^{commit}`],
    cwd,
  );
  if (result.exitCode !== 0) {
    throw new SelectorFailure(2, `file-selector: unknown revision ${rev}`);
  }
}

async function requireGit(
  args: readonly string[],
  cwd: string,
): Promise<Uint8Array> {
  const result = await spawnGit(args, cwd);
  if (result.exitCode !== 0) throw gitFailure(args, result);
  return result.stdout;
}

async function gitSucceeds(
  args: readonly string[],
  cwd: string,
): Promise<boolean> {
  const result = await spawnGit(args, cwd);
  return result.exitCode === 0;
}

function splitDirty(bytes: Uint8Array): string[] {
  if (bytes.length === 0) return [];
  return decodeUtf8(bytes)
    .split("\0")
    .filter((file) => file.length > 0);
}
