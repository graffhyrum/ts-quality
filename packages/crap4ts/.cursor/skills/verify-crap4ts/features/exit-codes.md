# Exit codes

Exit codes tell a user whether the project passed, was flagged for too many crappy functions, or never scored (bad input / missing coverage).

## Sub-features

- `exit-pass` exits `0` when the project is not flagged.
- `exit-flagged` exits `1` when crappy percent exceeds `--project-threshold`.
- `exit-missing-coverage` exits `2` when the coverage file is missing.
- `exit-bad-args` exits `2` on an unknown flag, a missing flag value, or an invalid flag value.
- `exit-init-none` exits `1` when `--init` finds no supported runner (covered in init-runner).

## How to get to it (user POV)

- Run a normal score command and inspect the process exit code.
- Trigger errors with a bad path, bad `-f`/`-o`/`--sort`/`-t`, or missing sources.

## Driving it with bun src/index.ts

Preconditions:

- Doctor passed.
- Fixtures present.
- `$EVIDENCE` directory created.
- A path that does not exist for the missing-coverage case (e.g. `$EVIDENCE/no-such-coverage.json`).

- **Pass.** Run `bun src/index.ts -c test/fixtures/coverage-istanbul.json test/fixtures/simple.ts -o json`. Exit `0`. Stdout `isFlagged` `false`.
- **Flagged.** Run `bun src/index.ts -c test/fixtures/coverage-istanbul.json test/fixtures/simple.ts -t 5 --project-threshold 0 -o json`. Exit `1`. Stdout `isFlagged` `true`.
- **Missing coverage.** Run `bun src/index.ts -c $EVIDENCE/no-such-coverage.json test/fixtures/simple.ts`. Exit `2`. Stderr contains `Coverage file not found`.
- **Bad format.** Run `bun src/index.ts -f bad`. Exit `2`. Stderr contains `Invalid format: bad`.
- **Unknown flag.** Run `bun src/index.ts --nope`. Exit `2`. Stderr contains `Unknown option`.
- **Missing value.** Run `bun src/index.ts -c`. Exit `2`. Stderr contains `argument missing`.
- **No sources.** Run `bun src/index.ts -c test/fixtures/coverage-istanbul.json --include "test/fixtures/does-not-exist-*.ts"`. Exit `2`. Stderr contains `No source files found`.
- **Proof.** Save each exit code line into `$EVIDENCE/exit-codes.txt` with the command label. Write `exit-codes` to `$EVIDENCE/feature.txt`.

## Gotchas

- Exit `1` is a successful score that failed the project threshold — stderr may be empty.
- `CrapError` messages go to stderr; exit code defaults to `2`.
- PowerShell `$LASTEXITCODE` can be wrong after pipelines — capture exit from the `bun` process alone.
