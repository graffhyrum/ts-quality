# 0001: File-scoped quality gates

## Status

Proposed, 2026-11-27. Accepted when the pull request that adds this file merges.

Tracking issue: https://github.com/graffhyrum/ts-quality/issues/12

## Context

A commit hook should run rule-validator, mutate4ts, stepdown-rule, and crap4ts on the files in that commit. A pre-push hook and CI should run the same commands on the whole project. Today the four CLIs do not share a path-list contract, and none of them should learn git.

On `main` at `aa02b45`:

- `rule-validator` takes one optional glob positional `[pattern]`, default `**/*.{ts,tsx,js,jsx}`. `doctor` is a separate subcommand.
- `mutate4ts` requires one `<sourceFile>` positional. It has no multi-file run and no project-wide run. `src/baseline.ts` times a pre-mutation test command. It is not a per-file debt baseline.
- `stepdown-rule` `analyze` (the default command) and `fix` take `[patterns...]`, default `src/**/*.ts`. The agents variants of those two commands take the same patterns. `doctor` does not.
- `crap4ts` takes `[files/globs...]` positionals. The implementation resolves each positional with `path.resolve` and skips a path that does not exist. It does not expand a glob in a positional. The include glob used when there are no positionals is `**/*.{ts,tsx,js,jsx}`.

Home will call the selector from `vet --at-commit` (graffhyrum/home#117), from a pre-push hook (graffhyrum/home#122), and CI will run the full-project command once (graffhyrum/home#123). This repository does not change those hooks in the selector PR.

## Decision

### Selector

Package `@graffhyrum/file-selector`, binary `file-selector` (`packages/file-selector/src/cli.ts`). Hooks and CI may execute it. The four quality packages must not.

The selector is the only place that reads git. Packages do not grow `--staged` or `--since`.

```
file-selector [--staged] [--since <rev>] [--format text|json] [--cwd <dir>]
```

- `--staged` is the default. It diffs the index against `HEAD` (`git diff --cached -z --name-status --find-renames HEAD`). With no commit yet, it diffs the index against the empty tree.
- `--since <rev>` diffs `<rev>...HEAD` (triple-dot). It cannot be combined with `--staged`. `<rev>` is one revision, not a range: empty, leading `-`, `..`, whitespace, or a backslash is a usage error. Git must resolve `<rev>^{commit}`.
- `--cwd` defaults to the process cwd. The repository is discovered from that directory.
- The process drops `GIT_DIR`, `GIT_WORK_TREE`, `GIT_PREFIX`, `GIT_COMMON_DIR`, and `GIT_OBJECT_DIRECTORY` before it runs git. It keeps `GIT_INDEX_FILE`.
- `--help` and `--version` exit 0. Help goes to stdout. `--version` prints the package version and a newline.

Rename detection is git's default similarity (`--find-renames`, 50%). A rename git reports below that threshold is a delete plus an add, and the baseline does not carry. Packages must not add a second rename detector. A copy (`C`) is a new path. It is not a rename.

Text stdout (`--format text`, the default), from the git toplevel, using `/` separators, ordered by UTF-16 code units (JavaScript `<` on strings):

- One path per line, the paths a hook passes to `--files-from`.
- A non-empty list ends with one `\n`. There are no blank lines and no `\r`.
- An empty selection is zero bytes, exit 0.
- A rename contributes the new path only.
- A delete is omitted.
- A path containing `\n`, `\r`, `\0`, or `\` is exit 2 and produces no list. The selector does not rewrite separators.

JSON stdout (`--format json`) is one UTF-8 JSON value plus a trailing newline, and no other stdout bytes. Whitespace inside the value is insignificant. Keys are `schema`, `files`, `renames`, `deletes`, in that order:

```json
{
  "schema": "ts-quality/file-selector/v1",
  "files": ["sub/c.ts"],
  "renames": [{ "from": "a.ts", "to": "sub/c.ts" }],
  "deletes": ["old.ts"]
}
```

- `files` is the text list, including a rename's new path, excluding deletes.
- `renames` is sorted by `to`, then `from`. Every `to` is also in `files`. A rename's `from` is in neither `files` nor `deletes`.
- `deletes` is informational. Hooks must not pass it to a package.
- On exit 1 and exit 2, stdout is empty. There is no JSON document.

Exit codes:

| Code | Meaning |
| ---- | ------- |
| 0 | The list was written. It may be empty. |
| 1 | Refusal: a path in `files` is not safe to read from the worktree. Stdout is empty. Stderr is one line per path, sorted like `files`: `file-selector: partially staged: <path>` |
| 2 | Usage error, not a git repository, unknown revision, non-UTF-8 git output, or git failed. Stdout is empty. Stderr is `file-selector: <reason>`. |

#### Partial-staging policy

The selector **refuses** the run. It does not check an index snapshot.

The path list always comes from the git index (`--staged`) or from the commit range (`--since`), never from a scan of the worktree. An unstaged edit to a path that is not selected does not change the list and does not fail the run. An untracked file is ignored.

Refusal is for a path that **would be emitted** when the worktree bytes are not the bytes the selection describes:

- `--staged`: `git diff --name-only -z` (worktree versus the index) intersects `files`.
- `--since`: `git diff --name-only -z HEAD` (index or worktree versus `HEAD`) intersects `files`.

A staged delete is not in `files`, so a delete is never a partial-staging failure. The whole list is refused. The selector does not emit the paths that happen to be clean.

This is the policy because the packages read the worktree and have no git code. A path list cannot carry index bytes. A temporary checkout of the index would break relative imports, `tsconfig`, and the importer and test discovery that crap4ts and mutate4ts are required to do, and it would report findings against snapshot paths. Refusal makes a worktree read equal the selected blob for every emitted path. The caller stages the remaining hunks, or unstages the file, and runs the selector again.

The stderr line says `partially staged` for both modes. For `--since` it means the worktree or the index differs from `HEAD` for that path.

#### How hooks call it later

This PR does not change hooks or CI. Packages do not accept `--files` yet. Current hook and CI invocations stay as they are.

After the package PRs land, a pre-commit hook, with cwd at the git toplevel:

1. Run `file-selector --staged --format json`. On exit 1 or 2, abort the commit. Do not start a package.
2. If `files` is empty, exit 0. Do **not** start a package. An empty `--files-from -` stream is a full scan, so piping an empty selector result into a package would check the whole project.
3. Write `files` as LF-separated paths (the text format). Write `renames` as LF-separated `from<TAB>to` lines. Ignore `deletes`.
4. Run each package with `--files-from <paths> --renames-from <renames> --report json --update-baseline`, cwd still the toplevel.
5. Stage each `.quality/*-baseline.json` the package updated, so the rename carry and any shrink are in the same commit.

Pre-push and CI do not call the selector. They run the full-project command, the same command in both places, with no file flags and without `--update-baseline`:

```sh
rule-validator --report json
stepdown-rule analyze --report json
crap4ts --report json
mutate4ts --report json
```

CI remains the enforcement backstop and runs that command once.

### Package path-list contract

Each package CLI accepts:

- `--files <path>`, repeatable, one path per occurrence (`--files a.ts --files b.ts` and `--files=a.ts`). A bare word after `--files` is not swallowed, so a legacy positional can still follow other flags.
- `--files-from <path>`. `<path>` of `-` reads stdin until EOF. Any other value is a UTF-8 file. A leading UTF-8 BOM (`EF BB BF`) is exit 2. Split on `\n`, strip one trailing `\r` from each line, ignore a line that is empty after that. A line containing `\0` is exit 2. Do not trim spaces.
- `--renames-from <path>`, a file of `from<TAB>to` lines, same line rules. `-` means stdin only when `--files-from` is not also `-`. Both `-` is exit 2. A line that does not contain exactly one tab is exit 2.
- `--report json`. Stdout is the shared document below. The default (flag absent) keeps today's human output, and today's existing JSON flags (`rule-validator --json`, stepdown `--json` / `--format`, crap4ts `-o json`). Passing `--report json` together with one of those existing JSON or format flags is exit 2.
- `--baseline <path>`. Default path is below.
- `--update-baseline` and `--seed`, defined with the baseline.

No package flag reads git. `--renames-from` is a path-to-path table the hook produces. It is not a git query.

`--init` on crap4ts, `doctor` on rule-validator, and `doctor` on stepdown-rule do not take this contract. Passing any of the flags above to those commands is exit 2.

#### One selection set

```
literal = normalized paths from --files and --files-from
legacy  = legacy arguments that were present on the command line
if nothing in {--files, --files-from, legacy} was present:
  mode = full scan
else if --files-from was present and literal is empty and --files was absent and legacy was absent:
  mode = full scan
else:
  mode = scoped
  raw  = union(literal, expand(legacy))
```

A scoped set is filtered after that union. A full scan uses the discovery rule below and does not apply the "skip missing paths" rule to the discovered files.

Legacy spellings, present only when that tool already had them:

| Tool | Legacy spelling | How it fills the set |
| ---- | --------------- | -------------------- |
| rule-validator | `[pattern]` | Expanded with today's glob and today's excludes. Absent pattern on a full scan stays `**/*.{ts,tsx,js,jsx}`. |
| stepdown-rule analyze and fix, including agents | `[patterns...]` | Expanded with today's pattern and ignore rules. Absent patterns on a full scan stay `src/**/*.ts`. |
| crap4ts | `[files/globs...]` positionals | Same as `--files`: literal paths, not glob-expanded. |
| mutate4ts | `<sourceFile>` positional | One literal path, the same as `--files <sourceFile>`. The argument is optional once `--files` exists. |

If a legacy pattern was present and expands to zero paths, the run stays scoped and empty. It does not become a full scan. stepdown-rule in default output keeps today's no-files exit (3) for that case. With `--report json`, that case is exit 2 and no JSON.

#### Report narrowly, analyze widely

Findings, the per-file counts, and the pass/fail decision include only the selected in-scope files.

- rule-validator and stepdown-rule judge the selected files. They do not attribute a finding in an unselected file to the run.
- crap4ts and mutate4ts may read importers and the tests that cover a selected file in order to judge that file. A violation, survivor, or crappy function that belongs to a file that was not selected does not fail the run and does not appear in the report.
- A listed path that does not exist is skipped. It is not an error and it is not in the report. The selector already omits deletes; a caller may still pass one.
- A listed path whose extension is outside the tool's set is ignored. It is not an error and it is not in the report.

Extension set for an **explicit** list:

| Tool | Extensions that are in scope |
| ---- | ---------------------------- |
| rule-validator, crap4ts | `.ts` `.tsx` `.js` `.jsx` `.mts` `.cts` `.mjs` `.cjs` |
| stepdown-rule, mutate4ts | `.ts` `.tsx` `.mts` `.cts` |

A full scan does not use that table. It uses today's discovery, unchanged, so a no-flag run sees the same files as today:

- rule-validator: `**/*.{ts,tsx,js,jsx}` and today's excludes.
- stepdown-rule: `src/**/*.ts` and today's ignores.
- crap4ts: today's `--include` / `--exclude` / gitignore behavior.
- mutate4ts, which has no full scan today: every file under cwd matching `**/*.{ts,tsx,mts,cts}`, excluding `**/*.{test,spec}.{ts,tsx,mts,cts}`, `**/*.d.ts`, `**/node_modules/**`, `**/dist/**`, and `**/coverage/**`.

A scoped list that filters down to zero in-scope existing files is a successful empty report (exit 0), not a full scan. A typo or a delete-only list must not check the project. The exception is the empty `--files-from` stream with no other targeting, which is a full scan, and a stepdown legacy pattern that matches nothing, which keeps today's no-files exit.

crap4ts keeps skipping a gitignored explicit path unless `--no-gitignore` is set.

#### Baseline key

Packages do not call git. The hook's cwd is the git toplevel, and selector paths are already relative to that toplevel, so the strings match.

Normalize every explicit path, and every path a full scan reports, the same way:

1. Strip one trailing `\r`.
2. A line that is then empty is ignored (`--files-from` only).
3. Reject `\n` inside the path (exit 2).
4. If the path is absolute, make it relative to cwd. If that escapes cwd, exit 2.
5. `path.posix.normalize`. Reject a result that is absolute, empty, `.`, or contains a `..` segment.
6. Strip a leading `./`. Do not `realpath`. Symlink segments stay as written.

The key uses `/` separators. Keys are case-sensitive. Two spellings that normalize to the same key are one file.

#### On-disk baseline

One file per tool, cwd-relative, overridable with `--baseline <path>`:

| Tool | Default path |
| ---- | ------------ |
| rule-validator | `.quality/rule-validator-baseline.json` |
| mutate4ts | `.quality/mutate4ts-baseline.json` |
| stepdown-rule | `.quality/stepdown-rule-baseline.json` |
| crap4ts | `.quality/crap4ts-baseline.json` |

UTF-8, no BOM. Canonical bytes, so a rewrite is stable:

```json
{
  "version": 1,
  "files": {
    "src/a.ts": 2
  }
}
```

- `version` is the number `1`. Any other value is exit 2 and the file is not written.
- `files` maps a baseline key to an integer `>= 0`. A non-integer, a negative number, or a key that fails the key grammar is exit 2 and the file is not written.
- On write: keys sorted by UTF-16 code units, two-space indent, trailing newline, `version` then `files`. A missing key means the allowed count is 0. Keys whose count is 0 are omitted.
- Write the file only when the canonical bytes would change.

`violations` for a file:

| Tool | Integer |
| ---- | ------- |
| rule-validator | Error-severity findings in the file. Warnings are not part of the count and do not fail the run, matching today's warning-only exit 0. |
| stepdown-rule | `violations.length + nestedFunctionViolations.length + circularDependencies.length` on that file's analysis result, counted after `fix` when the command is `fix`. |
| crap4ts | Functions in the file whose CRAP score is over the file threshold (`isCrappy`). |
| mutate4ts | Surviving mutants in the file. A timeout counts as killed, not as a violation. An errored mutant is not a violation; it uses exit 3 from `packages/mutate4ts/docs/adr/0001-mutation-exit-codes.md`. |

#### Shrink-only

A missing baseline file means every allowed count is 0. The exit code then matches today's full scan on the same tree (any current violation fails). The package PR's "same result as today" test is this case, plus the same discovered file set.

`--seed` creates the file:

- The baseline path must not already exist. A file list must not be present (full scan only). `--update-baseline` must not be set. Otherwise exit 2 and do not write.
- Record each discovered in-scope file's current count when the count is `> 0`. Exit 0. This is how the adoption PR grandfathers current debt. Hooks and CI do not pass `--seed`.

After the file exists, a count cannot go up through the CLI. There is no flag that raises a stored number. Editing the JSON by hand is outside the CLI.

Check (no `--update-baseline`):

- Apply the rename map in memory first (below). Do not write.
- For each reported file, fail the file when `violations > allowed`.
- A file the run did not select is not compared.
- An orphan key whose file no longer exists is not an error.

`--update-baseline` (the file must already exist; otherwise exit 2, and the message tells the caller to `--seed` on a full scan):

- Apply the same check. If any selected file is over its allowed count, exit 1 and leave the file bytes unchanged, including any rename that was only in memory.
- On success, write: moved rename keys, a stored count lowered to the new actual count, and, on a full scan only, deletion of keys whose files do not exist. A partial run does not drop unselected keys.
- A new key with `violations > 0` is an increase over the implicit 0. Exit 1, no write. A new file with no violations is a pass and adds no key.
- Lowering a count is allowed. An equal count leaves the key in place.

Rename application, in memory and on a successful `--update-baseline` write:

- Build a directed graph of the pairs. A cycle, or two pairs with the same `to`, is exit 2.
- Apply pairs from the ends: while pairs remain, apply every pair whose `to` is not another remaining pair's `from`, then remove those pairs. If none are ready, the graph has a cycle (exit 2).
- Applying `from → to`: if `from` is absent, do nothing. If `to` is already present, exit 2. Otherwise set `to` to the stored integer and delete `from`.
- A pair whose `to` does not exist on disk is exit 2, so a bad map cannot move a key onto a missing path. A pair whose `from` is absent is a no-op.

The hook passes the rename map and `--update-baseline` on the rename commit, then stages the baseline file. The next commit does not contain that rename. Push and CI read the committed file and do not call the selector, so the key has to already be the new path. If the hook did not update the file, CI treats the new path as allowed 0 and fails when the carried debt is still there.

When the baseline file is present, it is the only pass/fail gate for violation counts. crap4ts `--project-threshold` does not also fail the run. When the baseline file is absent, crap4ts keeps today's `isFlagged` exit code, including a non-default project threshold.

#### Shared report

`--report json` writes this document to stdout and nothing else. Diagnostics, warnings, and usage errors go to stderr. Default mode (the flag absent) keeps today's stdout.

```json
{
  "schema": "ts-quality/quality-report/v1",
  "tool": "rule-validator",
  "exitCode": 0,
  "ok": true,
  "files": [
    { "path": "src/a.ts", "violations": 2, "baseline": 2, "status": "ok" }
  ],
  "totals": { "files": 1, "violations": 2, "failed": 0 }
}
```

Closed schema. Package PRs must not add fields. `tool` is `rule-validator`, `mutate4ts`, `stepdown-rule`, or `crap4ts`. `files` is sorted by `path`. `path` is the baseline key. `baseline` is the allowed count after rename carry. `status` is `ok` when `violations <= baseline`, otherwise `fail`. `totals.files` is `files.length`. `totals.violations` is the sum of `violations`. `totals.failed` is the number of `fail` rows. `exitCode` is the process exit code. `ok` is `exitCode === 0`.

Exit codes for `--report json`:

| Code | Meaning | Stdout |
| ---- | ------- | ------ |
| 0 | Every reported file is `ok`, and the tool has no fatal of its own. | JSON |
| 1 | One or more files are `fail`. | JSON |
| 2 | Usage, unreadable or invalid baseline, bad rename map, config error, or a fatal before a report. stepdown's no-files, config, and internal exits use 2 in this mode. | empty |
| 3 | mutate4ts only. The run finished and at least one mutant errored. Same meaning as ADR 0001. A file can be `ok` while `ok` is false. | JSON |
| 4 | mutate4ts only. Restoring a source file failed. Same meaning as ADR 0001. | empty |

When several mutate4ts outcomes happen in one run, the exit code is the highest of 1, 3, and 4, as ADR 0001 already says. Default mode, without `--report json`, keeps each tool's existing extra codes (stepdown 3, 4, and 5 included) so current callers do not change. The pass/fail decision for violation counts still follows the baseline in both modes.

mutate4ts `--scan` does not read or write a baseline and rejects `--report json` with exit 2. With a file list, `--scan` limits itself to those files and otherwise stays today's scan.

### Tests each later package PR must add

Do not stub these in the selector PR. Each package PR adds them against that package's CLI. Use a temp project directory. Do not use this monorepo's baseline files. Assert on the `--report json` document and the process exit code.

**Empty list and full scan.** Build two in-scope files that today's tool already flags, and one in-scope file it does not flag. With no baseline file:

- No file flags: the discovered set and the exit code match today's CLI on that tree.
- `--files-from -` with empty stdin, and no other targeting: the same document and the same exit code.
- `--files` of only the clean file: exit 0, and the dirty files are absent from `files`.
- `--files` of one dirty file: exit 1, `totals.failed === 1`, and the other dirty file is absent.

For mutate4ts, "today's CLI" in this test is `mutate4ts <sourceFile>` for a single file. The no-argument run is the new full scan and is asserted separately: it reports every file in the mutate4ts discovery set and no file outside it.

**`--files-from -` with many paths.** Write 2000 lines to stdin: 1998 existing in-scope paths, one path that does not exist, and one `README.md`. The process must accept the stdin (this is the case that does not fit on a Windows argv). The report's `files` length is the number of those paths that exist and are in the tool's extension set. The missing path and `README.md` are absent. Exit code matches a run of `--files` on one listed in-scope path repeated through the same filter, not a full scan. A scoped list that is only `missing.ts` exits 0 with `files: []`.

**Shrink-only baseline.** Seed a baseline, or write the canonical JSON directly, so `src/a.ts` is 2 and `src/b.ts` is 0. The file under test has the violations the test names.

- `a.ts` still has 2: exit 0, `status` `ok`, `baseline` 2, and the file bytes are unchanged when `--update-baseline` is absent.
- `a.ts` has 3: exit 1, `status` `fail`, `baseline` 2, and the file bytes are unchanged even with `--update-baseline`.
- `a.ts` has 1, without `--update-baseline`: exit 0, on-disk count stays 2.
- `a.ts` has 1, with `--update-baseline`: exit 0, on-disk count becomes 1.
- A new `src/c.ts` with 1 violation and no key: exit 1. With `--update-baseline`, the file is unchanged and the key is absent.
- A new `src/c.ts` with 0 violations: exit 0, and no key is added.
- Rename: on-disk key `old.ts` is 2, `--renames-from` contains `old.ts\tnew.ts`, `new.ts` exists and has 2 violations, `old.ts` does not exist. Without `--update-baseline`: exit 0, `files[0].path` is `new.ts`, `baseline` is 2, on-disk key stays `old.ts`. With `--update-baseline`: exit 0, the key is `new.ts` with 2, and `old.ts` is gone.
- The same rename with 3 violations at `new.ts`: exit 1, on-disk bytes unchanged.
- A partial `--update-baseline` that does not select a second baselined file leaves that second key in place. A full-scan `--update-baseline` after deleting a baselined file removes that key.
- `--seed` when the file already exists exits 2 and does not change it. `--seed` with `--files` exits 2. `--update-baseline` with no baseline file exits 2.

A violation planted only in a file that was not listed does not change the exit code of a scoped run. A new violation in a listed file does.

## Consequences

- The selector PR adds the CLI, this ADR, and a changeset. It does not parse `--files` in the four packages and it does not point hooks or CI at the selector.
- Package PRs implement the contract from this document. They duplicate the two JSON shapes as local types. They do not add a dependency on `@graffhyrum/file-selector`.
- Adoption order after the selector: rule-validator, mutate4ts, stepdown-rule, crap4ts. mutate4ts ships the no-argument full scan as a major bump. The other three keep their current no-flag discovery.
- A commit hook that pipes the selector's stdout without checking the exit code, or that starts a package when `files` is empty, will full-scan or will ignore a refusal. The hook section is the required call sequence.
- Rollback of the selector PR is a revert. The revert trigger is a selector that lists an unstaged path, emits a deleted path as a file to check, drops a rename's new path, or exits 0 while a selected path's worktree differs from the index.
