# Research: Sensible default thresholds for wide-directory and long-file in TS codebases

**Ticket:** [#3](https://github.com/graffhyrum/deslop-please-ts/issues/3)
**Date:** 2026-11-23
**Scope:** Research only — no implementation.

## Question

What are sensible default thresholds for two of the six architectural sloppiness lints in a TypeScript/JavaScript codebase?

- **wide-directory**: how many direct children (files + subdirectories) in one directory before it is "too wide"? Baseline 7.
- **long-file**: how many lines before a file is "too long"? Baseline 300.

Sub-questions: are these the right units? Should thresholds differ by file type (tests, config, generated)?

## Method

1. Primary-source check: ESLint `max-lines` (the de-facto standard for JS/TS file length) and Miller's-law / working-memory rationale for directory width.
2. Empirical calibration against three local TS codebases: `deslop-please-ts`, `ts-template`, `ts-quality` (a mid-size monorepo, ~291 source files). Counted direct children per directory and lines per file with `find`/`wc`; broke out test vs. non-test files.

## Findings

### long-file

- **Primary source:** ESLint's `max-lines` rule uses **300 lines** as its default `max`, and documents that "recommendations usually range from 100 to 500 lines." Bun's linter mirrors the same default (`max = 300`). This independently validates the 300 baseline.
- **Unit:** physical lines (total file lines) is the right, tooling-friendly unit. ESLint counts physical lines (with optional `skipBlankLines`/`skipComments`). Counting "code lines" (excluding blanks/comments) is more precise but adds parsing cost and editor disagreement; keep physical lines as default and expose `skipBlankLines`/`skipComments` as tunable flags, matching ESLint.
- **Calibration (ts-quality, 291 files):** median 58 lines, p95 289, p99 451, max 681. Only 15 files (5%) exceed 300. Of those, 11 are test files (`.test.ts`) and 2 are data-heavy type/schema files (`types.ts`, `arktype-schema-strings.ts`). Non-test source files rarely exceed 300 (2 of 192).
- **File-type differentiation:**
  - **Test files** legitimately run long (integration/E2E tests accumulate cases). Recommend either exempting `*.test.*`/`*.spec.*` and `tests/**`/`__tests__/**` by default, or applying a higher threshold (e.g. 500) to tests. Exemption is simpler and matches how lint configs already special-case tests.
  - **Generated files, fixtures, big data tables** are long by design — exclude via globs (ESLint itself says to turn the rule off for these).
  - **Type/schema declaration files** (`*.d.ts`, generated types) should be excluded; hand-written schema-string modules can stay under 300 or be allow-listed.
- **Conclusion:** keep **300 physical lines** as the default for non-test source files. Tunable behind a seam (per the map's "Tunable behind a seam" note).

### wide-directory

- **Primary source:** no mainstream linter ships a "max files per directory" default for TS/JS (ESLint has no such rule; `max-depth` is nesting depth, not width). The 7 baseline comes from Miller's law (working-memory limit, 7±2 items) and Ousterhout's "deep modules" framing — a directory is a grouping, and beyond ~7 siblings it stops being navigable as one unit. The Rust original (`deslop-please`) uses 7 (`HELD_IN_MIND`).
- **Unit:** number of **direct children** (files + subdirectories), excluding hidden, vendor, generated, and build-output directories. This is the "width" of a directory and matches the lint's name. Counting only source files would miss mixed-concern directories (e.g. a dir with 5 source files + 5 test files); counting all children captures the navigation smell.
- **Calibration (ts-quality):** 59 directories, median width 4, mean 7.5, max 37. With threshold 7: 23 dirs (39%) flagged. With 10: 15 (25%). With 15: 6 (10%). The widest are `src/` (35 files) and `src/rules/` (34 files) — genuine "bucket" directories that the lint is meant to push toward sub-grouping.
- **File-type differentiation:** exclude test directories (`tests/`, `__tests__/`, `fixtures/`, `goldens/`), generated/vendor (`node_modules`, `dist`, `coverage`, `.git`), and docs/post-mortems. These are legitimately wide and are not architectural smells.
- **Conclusion:** keep **7** as the default. It is aggressive (flags ~2 in 5 directories on a real mid-size monorepo) but that is the intended behavior of a smell lint — it prompts grouping, and the compliance-ratchet baseline absorbs legitimate wide dirs. Tunable behind a seam. If noise proves unacceptable in practice, raise to 10; the research does not justify changing the default from the held-in-mind constant.

## Summary of defaults (unchanged)

| Lint           | Default | Unit                                                                           | File-type notes                                                                            |
| -------------- | ------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| wide-directory | 7       | direct children (files + subdirs), excluding hidden/vendor/generated/test dirs | Exclude tests, fixtures, generated, vendor                                                 |
| long-file      | 300     | physical lines                                                                 | Exempt tests (or 500), generated, fixtures, `*.d.ts`; optional skipBlankLines/skipComments |

## Recommendation

Keep both defaults at their baselines: **7 / 300**. Long-file 300 is corroborated by ESLint's established default; wide-directory 7 has no competing standard and is defensible as a working-memory smell threshold. Differentiate by file type via exclusion globs (tests, generated, fixtures, vendor) rather than by changing the numeric defaults.

## Sources

- ESLint `max-lines` rule docs (default `max: 300`, "recommendations usually range from 100 to 500 lines"): https://eslint.org/docs/latest/rules/max-lines
- Bun linter `max-lines` (default `max = 300`): https://bun.com/docs/lint/rules/eslint/max-lines
- Ousterhout, _A Philosophy of Software Design_ — deep vs. shallow modules (working-memory / interface-cost framing): https://softengbook.org/articles/deep-modules
- Miller's law (7±2) — rationale for `HELD_IN_MIND = 7` in the Rust original.
- Empirical calibration: local repos `/home/graff/projects/{deslop-please-ts,ts-template,ts-quality}` (file/dir counts via `find`/`wc`).
- Project map (issue #1): constants note "start at 7 (HELD_IN_MIND) ... 300 lines for long-file".
  PY
