# Help and version

Help and version let a user inspect CLI usage and the installed package version without scoring a project.

## Sub-features

- `help-flag` prints usage via `-h` / `--help` and exits `0`.
- `version-flag` prints the package version via `--version` and exits `0`.

## How to get to it (user POV)

- Run `crap4ts --help` or `crap4ts -h`.
- Run `crap4ts --version`.

## Driving it with bun src/index.ts

Preconditions:

- Doctor passed.
- `$EVIDENCE` directory created.

- **Help.** Run `bun src/index.ts --help`. Exit `0`. Stdout starts with `Usage: crap4ts` and lists `--coverage`, `--init`, and `--version`.
- **Short help.** Run `bun src/index.ts -h`. Exit `0`. Same usage text.
- **Version.** Run `bun src/index.ts --version`. Exit `0`. Stdout is exactly the `version` string from `package.json` (currently `1.1.0` — re-read the file if the package bumped).
- **Proof.** Save help stdout to `$EVIDENCE/help.txt` and version stdout to `$EVIDENCE/version.txt`. Write `help-version` to `$EVIDENCE/feature.txt`.

## Gotchas

- Help and version call `process.exit(0)` inside the CLI parser — do not expect a scored report.
- Version must match `package.json`; a mismatch means doctor should have failed already.
