# Init runner

Init runner lets a user detect a supported test runner in a project and write coverage config so they can produce a coverage file for crap4ts.

## Sub-features

- `init-bun` detects a Bun project and writes `bunfig.toml` with coverage settings.
- `init-skip-existing` skips writing when `bunfig.toml` already exists (warns).
- `init-none` exits `1` when no supported runner is found.

## How to get to it (user POV)

- Run `crap4ts --init` from a project directory.

## Driving it with bun src/index.ts

Preconditions:

- Doctor passed (in the crap4ts repo).
- A **disposable** empty directory under the system temp folder (never the crap4ts repo root).
- Absolute path to this repo’s `src/index.ts` available as `$CRAP4TS` (e.g. `C:/Users/…/crap4ts/src/index.ts`).
- `$EVIDENCE` directory created (in the crap4ts repo).

- **Bun detect + write.** Create `$TMP/crap4ts-init-$RUN_ID` with `package.json` containing `"scripts":{"test":"bun test"}`. `cd` there. Run `bun $CRAP4TS --init`. Exit `0`. Stdout contains `Written:` and a path ending in `bunfig.toml`, plus next-step lines mentioning `bun test` and `crap4ts -c coverage/lcov.info -f lcov`. File `bunfig.toml` contains `coverage = true` and `coverageReporter = ["lcov"]`.
- **Skip existing.** From the same disposable dir, run `bun $CRAP4TS --init` again. Exit `0`. Stderr or stdout contains `Skipping:` and the existing `bunfig.toml` path. File contents unchanged.
- **None found.** Create `$TMP/crap4ts-init-none-$RUN_ID` with `package.json` `{"name":"none"}` and no Bun lockfile/deps/scripts. `cd` there. Run `bun $CRAP4TS --init`. Exit `1`. Stderr contains `No supported test runner detected`.
- **Proof.** Copy the written `bunfig.toml` to `$EVIDENCE/init-bunfig.toml` and save command transcripts under `$EVIDENCE/init-*.txt`. Write `init-runner` to `$EVIDENCE/feature.txt`. Delete the disposable dirs after copying proof.

## Gotchas

- Running `--init` in the crap4ts repo itself is invalid for verification: the repo already has Bun signals and may already have `bunfig.toml` (skip path), and it would mutate developer config.
- Detection accepts Bun lockfiles, `@types/bun` / `bun` deps, or any script value containing `bun test`.
- Supported runners today: `bun` only (stderr lists them on miss).
