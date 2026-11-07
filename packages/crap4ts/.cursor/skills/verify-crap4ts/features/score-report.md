# Score report

Score report lets a user point crap4ts at source files and a coverage file, then see per-function complexity, coverage, CRAP score, and whether each function is crappy.

## Sub-features

- `score-istanbul` scores `test/fixtures/simple.ts` with Istanbul JSON coverage.
- `score-lcov` scores the same sources with LCOV coverage (`-f lcov`).
- `score-all` includes non-crappy functions via `--all`.
- `score-threshold` treats more functions as crappy when `-t` is lowered.

## How to get to it (user POV)

- Run `crap4ts -c <coverage> [files…]` (defaults: Istanbul path `./coverage/coverage-final.json`, threshold `30`).
- Pass `-f lcov` or `-f istanbul` when format must be explicit; V8 always needs `-f v8`.
- Pass `--all` to list every function, not only crappy ones.

## Driving it with bun src/index.ts

Preconditions:

- Doctor passed.
- Fixtures `test/fixtures/simple.ts`, `test/fixtures/coverage-istanbul.json`, and `test/fixtures/coverage.lcov` exist.
- `$EVIDENCE` directory created.

- **Istanbul default path.** Score the fixture sources. Run `bun src/index.ts -c test/fixtures/coverage-istanbul.json test/fixtures/simple.ts -o json`. Exit `0`. Stdout JSON has `totalFunctions` `9`, `crappyCount` `0`, `isFlagged` `false` (default threshold `30`).
- **Show all functions.** Re-run with `--all`. Run `bun src/index.ts -c test/fixtures/coverage-istanbul.json test/fixtures/simple.ts --all -o json`. Exit `0`. Stdout `functions` array length is `9` and includes names `simple`, `withSwitch`, `withIf`.
- **Lower threshold.** Flag more functions. Run `bun src/index.ts -c test/fixtures/coverage-istanbul.json test/fixtures/simple.ts --all -t 5 -o json`. Exit `1`. Stdout has `isFlagged` `true`, `crappyCount` `5`, and `withSwitch` with `isCrappy` `true` and `crapScore` `20`.
- **LCOV entry.** Same sources, LCOV file. Run `bun src/index.ts -c test/fixtures/coverage.lcov -f lcov test/fixtures/simple.ts --all -o json`. Exit `0`. Stdout `totalFunctions` `9` and `simple.coverage` is `1`.
- **Proof.** Save the `-t 5` JSON to `$EVIDENCE/score-report.json` and write `score-report` to `$EVIDENCE/feature.txt`. Artifact shows `FLAGGED` semantics via `isFlagged: true` and named crappy functions.

## Gotchas

- Default output is crappy-only. Without `--all`, a clean run prints `"functions": []` even when `totalFunctions` is non-zero.
- V8 coverage requires `-f v8`; auto-detect covers Istanbul/LCOV only.
- Absolute `filePath` values in JSON depend on cwd — assert on `name`, scores, and counts, not full paths.
- Exit `1` means the project is flagged, not that the CLI crashed.
