# Output formats

Output formats let a user choose table, JSON, or HTML reports and optionally write the report to a file instead of stdout.

## Sub-features

- `out-table` prints a colorized terminal table with a PASS/FLAGGED footer.
- `out-json` prints a `ProjectSummary` JSON object.
- `out-html` prints a self-contained HTML report with sortable columns.
- `out-file` writes the chosen format via `--output-file`.

## How to get to it (user POV)

- Pass `-o table` (default), `-o json`, or `-o html`.
- Pass `--output-file <path>` to write the report to disk (stdout then shows `Report written to …`).

## Driving it with bun src/index.ts

Preconditions:

- Doctor passed.
- Fixtures `test/fixtures/simple.ts` and `test/fixtures/coverage-istanbul.json` exist.
- `$EVIDENCE` directory created.

- **Table flagged.** Run `bun src/index.ts -c test/fixtures/coverage-istanbul.json test/fixtures/simple.ts --all -t 5 -o table`. Exit `1`. Stdout contains header `Function`, status `CRAPPY` for `withSwitch`, and footer text `Project: FLAGGED` (ANSI color codes may wrap the flag word).
- **JSON.** Run `bun src/index.ts -c test/fixtures/coverage-istanbul.json test/fixtures/simple.ts --all -t 5 -o json`. Exit `1`. Stdout parses as JSON with `isFlagged` `true`.
- **HTML to file.** Run `bun src/index.ts -c test/fixtures/coverage-istanbul.json test/fixtures/simple.ts --all -t 5 -o html --output-file $EVIDENCE/report.html`. Exit `1`. Stdout contains `Report written to`. File `$EVIDENCE/report.html` contains `FLAGGED` and `class="crappy"`.
- **Pass table.** Run `bun src/index.ts -c test/fixtures/coverage-istanbul.json test/fixtures/simple.ts -o table`. Exit `0`. Stdout contains `No crappy functions found` or a footer with `PASS` when functions are shown.
- **Proof.** Keep `$EVIDENCE/report.html` and a copy of the JSON stdout as `$EVIDENCE/output-formats.json`. Write `output-formats` to `$EVIDENCE/feature.txt`.

## Gotchas

- `--output-file` still uses the process exit code from scoring (`0`/`1`/`2`); success writing the file does not force exit `0`.
- Table output includes ANSI escape codes — strip them or match substrings carefully.
- Empty crappy list message differs by format: table/HTML say `No crappy functions found`; JSON keeps `functions: []` with non-zero `totalFunctions`.
