# deslop-please-ts

[![CI](https://github.com/graffhyrum/deslop-please-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/graffhyrum/deslop-please-ts/actions/workflows/ci.yml)
[![Bun](https://img.shields.io/badge/Bun-1.4.4-f9f1e1?logo=bun)](https://bun.sh)

An opinionated architectural linter for TypeScript and JavaScript. It finds sloppy code structure and follows _A Philosophy of Software Design_ by John Ousterhout: deep modules, narrow interfaces.

This is a TypeScript port of [deterministic-machines/deslop-please](https://github.com/deterministic-machines/deslop-please), the Rust linter. The Rust version reads a Cargo workspace through SCIP. This version reads a `tsconfig.json` project through the TypeScript compiler API. A module is one file. Directories are layout only.

This is a linter, not a project template. The multi-tenant todo app under `src/packages/todo-app/` is a sample package kept as a fixture. It is not the product.

## Run it

```bash
bun install
bun run deslop path/to/your/project
```

```text
> bun run deslop tests/fixtures/sample

error[field-leak]: `items` is known outside its module in 1 place(s)
  --> helper.ts:2:1
  = note: owner: helper.ts
  = note: used at main.ts:5
deslop-please-ts: 1 errors, well done!
```

Exit codes are `0` for a clean project, `1` when errors are found, and `2` for bad input or an internal error. The linter writes diagnostics to stdout and nothing else when the project is clean.

```bash
bun run deslop .                     # lint the current directory
bun run deslop . --model             # print the extracted model instead
bun run deslop . --held-in-mind 10   # raise the width and tangle threshold
bun run deslop . --max-lines 500     # raise the long-file threshold
bun run deslop --help
```

## The six checks

| Check            | What it flags                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `module-cycle`   | A strongly connected group of files in the value import graph. Type-only imports do not count. Dynamic imports do.              |
| `tangle`         | A strongly connected group of items that reference each other across file boundaries and is larger than the held-in-mind limit. |
| `field-leak`     | A class field read or written from a file other than the one that owns it.                                                      |
| `shallow-module` | A caller that learns more exports of one module than the held-in-mind limit. The interface is wider than its use.               |
| `wide-directory` | A directory with more direct children than the held-in-mind limit.                                                              |
| `long-file`      | A source file with more physical lines than the line limit. Test, spec, and declaration files are exempt.                       |

The defaults are `7` for the held-in-mind limit and `300` lines for a long file. Both are tunable with flags. The `7` comes from the working-memory limit used by the Rust original. The `300` matches the ESLint `max-lines` default. The research behind both is in `docs/research/`.

## Status

The compiler API model and all six checks are implemented and tested. The model records modules, items, references, import edges, export flags, and line counts. The CLI runs the checks and renders rustc-style diagnostics.

Four definitions are still provisional. Issues #4, #6, #7, and #8 ask what counts as a module cycle, a tangle, a field leak, and a shallow module in TypeScript. The current implementation is a documented reading of the Rust original, not a settled specification. Resolve those tickets before treating the diagnostics as final.

Debt suppression has no built-in allow file in v1. Use a compliance ratchet baseline outside the tool. Workspace and monorepo discovery is not implemented yet. The packaged tool publishes to npm in a later step.

## How it is built

`src/model.ts` builds the model from the TypeScript compiler API. It discovers files through `tsconfig.json`, enumerates declarations as items, resolves cross-file symbol identity, and records each use as a reference.

`src/lint.ts` runs the six checks as pure functions over that one model. `src/cli.ts` parses arguments, runs the checks, and sets the exit code. Fixture projects live under `tests/fixtures/`. The `sample` fixture has a field leak. The `clean` fixture has none.

Formatting is automatic. `bun run vet` formats in place as its first step instead of failing on unformatted files. The pre-commit hook formats staged source files and re-stages them. Neither step needs a separate manual pass. `bun run fmt:check` stays available for CI runs that want an explicit verification.

The quality gate still comes from the template this repo was seeded from. It requires 100% function and line coverage on every non-test file under `src/`, and it holds the linter source itself: `src/model.ts`, `src/lint.ts`, and `src/cli.ts`. `bun run vet` passes end to end today, formatting, boundaries, mutation testing, and coverage included.

Process entrypoints live in `bin/`, not `src/`. `bin/deslop.ts` is the product entry and `bin/serve.ts` starts the sample app. They hold only stdio wiring and `process.exit`, which no in-process test can exercise safely, and Bun honours no coverage-ignore comment. Tests spawn them instead, so their behavior is verified where it can be without distorting the gate.

## Commands

| Command                  | Description                             |
| ------------------------ | --------------------------------------- |
| `bun run deslop`         | Run the linter on the current directory |
| `bun run dev`            | Run the CLI with reload                 |
| `bun run build`          | Bundle the CLI for Node into `./dist`   |
| `bun run test`           | Run all tests                           |
| `bun run test <pattern>` | Run tests matching a pattern            |
| `bun run typecheck`      | Type-check with `bun check`             |
| `bun run lint`           | Lint with oxlint (type-aware)           |
| `bun run fmt`            | Format with `bun fmt`                   |
| `bun run vet`            | Quiet quality gate                      |

## License

MIT
