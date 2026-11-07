# crap4ts verification map

This directory is the maintained source for verifying user-facing CLI behavior of crap4ts. Read this index before driving, then use the matching feature file as the recipe.

## Baseline preconditions

- Repo root is the cwd for score/help/version drives.
- `bun install` has been run.
- `bun .cursor/skills/verify-crap4ts/helpers/doctor.ts` exits `0`.
- Evidence dir: `.cursor/skills/verify-crap4ts/artifacts/<RUN_ID>/` (create per run; keep after cleanup).
- Never run `--init` against the repo root — use a disposable temp project (see [init-runner](./init-runner.md)).
- Prefer committed fixtures under `test/fixtures/`.

## Driving conventions

- Entry command: `bun src/index.ts` from repo root (same bin as published `crap4ts`).
- Start every recipe from baseline unless its preconditions say otherwise.
- Treat every command as literal. Keep quoted paths and flags unchanged.
- Prefer `-o json` for assertions; use table/HTML only when proving those formats.
- Capture stdout, stderr, exit code, and any `--output-file` into `$EVIDENCE`.
- Write the feature stem into `$EVIDENCE/feature.txt`.

## Proof and skip reporting

- Exercise the real CLI path, not library imports used only by tests.
- CLI proof includes the command, stdout, stderr, and exit code.
- File-output proof includes the written file contents.
- Mutation proof (`--init`) includes a second read of the written config in the disposable dir.
- Record the feature ID and entry point with every artifact.
- Report an unreachable path with the attempted command and unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` — short IDs with one line each.
2. `How to get to it (user POV)` — every user entry point.
3. `Driving it with bun src/index.ts` — starts with `Preconditions:` and labeled bullets pairing each user action with an exact command and observable result.
4. `Gotchas` — traps that waste or invalidate a run.

Keep implementation details out of the map. Name only user paths, flags, required state, commands, and observable proof.

## Features

- [Score report](./score-report.md) — analyze sources against Istanbul/LCOV coverage and list function CRAP scores.
- [Output formats](./output-formats.md) — table, JSON, HTML, and `--output-file`.
- [Exit codes](./exit-codes.md) — `0` pass, `1` flagged / init miss, `2` unscored / bad args.
- [Help and version](./help-version.md) — `--help` and `--version`.
- [Init runner](./init-runner.md) — `--init` detects Bun and writes `bunfig.toml` in a disposable project.
