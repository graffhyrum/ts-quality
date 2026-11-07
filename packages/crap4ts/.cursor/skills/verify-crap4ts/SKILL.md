---
name: verify-crap4ts
description: "Drive the crap4ts CLI the way a user does — score coverage against sources, check exit codes, reports, and --init. Use when proving a crap4ts change works end-to-end, not only via unit tests."
---

# verify-crap4ts

crap4ts is a **CLI** (no server, no UI). Verification = install deps once, then run `bun src/index.ts …` (or `bunx crap4ts` when installed) against disposable inputs and capture stdout/stderr/exit code and any `--output-file`.

Repo root = working directory unless a recipe says otherwise.

## Launch

Short-lived CLI — no long-lived process.

1. From repo root: `bun install`
2. Ready when `bun src/index.ts --version` prints the `version` from `package.json` and exits `0`.
3. Each drive is its own process. Prefer an isolated evidence dir:

```bash
RUN_ID=$(date +%Y%m%d-%H%M%S)-$$
EVIDENCE=.cursor/skills/verify-crap4ts/artifacts/$RUN_ID
mkdir -p "$EVIDENCE"
```

On PowerShell:

```powershell
$RUN_ID = Get-Date -Format "yyyyMMdd-HHmmss-" ; $RUN_ID += $PID
$EVIDENCE = ".cursor/skills/verify-crap4ts/artifacts/$RUN_ID"
New-Item -ItemType Directory -Force -Path $EVIDENCE | Out-Null
```

Teardown: delete only scratch/temp dirs you created for `--init` or temp coverage. **Never delete `$EVIDENCE`.**

## Doctor

Read-only health check. Run before any drive when something looks wrong:

```bash
bun .cursor/skills/verify-crap4ts/helpers/doctor.ts
```

Expect exit `0` and lines confirming Bun, `package.json` version match, fixtures present, and `node_modules` present. Exit `1` = do not drive until fixed.

## Drive

Harness = shell + `bun src/index.ts` from repo root. Give each command its own `<name>` so a later run does not replace an earlier capture:

```bash
bun src/index.ts <args> >"$EVIDENCE/<name>.stdout.txt" 2>"$EVIDENCE/<name>.stderr.txt"
echo $? >"$EVIDENCE/<name>.exit.txt"
```

PowerShell:

```powershell
bun src/index.ts <args> 1>"$EVIDENCE\<name>.stdout.txt" 2>"$EVIDENCE\<name>.stderr.txt"
$LASTEXITCODE | Set-Content "$EVIDENCE\<name>.exit.txt"
```

Stable handles: flag names from `--help`, JSON keys (`totalFunctions`, `crappyCount`, `isFlagged`, `functions[].name`), table footer strings `PASS` / `FLAGGED`, HTML markers `PASS` / `FLAGGED` / `class="crappy"`.

Use committed fixtures under `test/fixtures/` unless a feature file names other paths. Read `.cursor/skills/verify-crap4ts/features/README.md` first, then the feature file for the path under test.

## Evidence

Proof lives under `.cursor/skills/verify-crap4ts/artifacts/<RUN_ID>/` and **survives cleanup**.

Standards:

- Exercise the real CLI entry (`src/index.ts` / bin `crap4ts`), not internal `runPipeline` imports.
- Capture the command line used, stdout, stderr, exit code, and any `--output-file` bytes.
- For mutations (`--init`), prove the written file contents from a **disposable project directory**, not the repo root.
- Prefer `-o json` for stable assertions; use table/HTML when proving those formats.
- Record the feature ID (filename stem) in `$EVIDENCE/feature.txt`.

## Cleanup

- Kill only processes you started (CLI exits itself; nothing to kill for normal runs).
- Remove disposable project dirs created for `--init` (under `$TEMP` / `%TEMP%`).
- Do **not** remove `$EVIDENCE` or rewrite committed fixtures.

## Helpers

| Script | Invocation | Purpose |
|--------|------------|---------|
| Doctor | `bun .cursor/skills/verify-crap4ts/helpers/doctor.ts` | Read-only readiness |

## Isolation

Two score runs can share the repo and fixtures (read-only). **`--init` must use a fresh temp project** — never run `--init` against this repo (it may already have `bunfig.toml` and would skip or mutate local config).
