# crap4ts

CRAP (Change Risk Analysis and Predictions) score calculator for TypeScript and JavaScript codebases. Identifies high-risk functions by combining cyclomatic complexity with test coverage data.

This is a clean-room port of [crap4clj](https://github.com/unclebob/crap4clj) by Robert C. Martin. The original Clojure implementation was studied for its public interface and CRAP algorithm behavior, then re-implemented from scratch in TypeScript without referencing the source code.

## What is a CRAP score?

The CRAP metric flags functions that are both complex and poorly tested:

```
CRAP(C, cov) = C² × (1 - cov)³ + C
```

- **C** = cyclomatic complexity
- **cov** = coverage ratio (0.0–1.0)

A function with complexity 10 and 0% coverage scores **110**. The same function with 100% coverage scores **10**. The default threshold for "crappy" is **30**.

## Install

Requires [Bun](https://bun.sh) v1.1+.

### From GitHub Packages

```bash
# Authenticate to GitHub Packages (once per machine)
# Create a classic PAT with `read:packages` (and `repo` if the package is private)
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc
echo "@graffhyrum:registry=https://npm.pkg.github.com" >> ~/.npmrc

bun add -g @graffhyrum/crap4ts
# or project-local:
bun add -d @graffhyrum/crap4ts
```

### From source

```bash
bun install
```

## Usage

```bash
crap4ts [options] [files/globs...]
```

### Examples

```bash
# Analyze with Istanbul coverage (default path)
crap4ts -c ./coverage/coverage-final.json src/**/*.ts

# LCOV format, only show crappy functions
crap4ts -c coverage.lcov -f lcov --only-crappy

# HTML report with custom threshold
crap4ts -c coverage.json -t 20 -o html --output-file report.html

# V8 coverage, sort by complexity
crap4ts -c v8-coverage.json -f v8 --sort complexity
```

### Options

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--coverage` | `-c` | `./coverage/coverage-final.json` | Coverage file path |
| `--format` | `-f` | auto-detect | Coverage format: `istanbul`, `lcov`, `v8` |
| `--threshold` | `-t` | `30` | CRAP score threshold |
| `--project-threshold` | | `0` | % of crappy functions that flags the project |
| `--output` | `-o` | `table` | Report format: `table`, `json`, `html` |
| `--output-file` | | stdout | Write report to file |
| `--sort` | | `score` | Sort by: `score`, `name`, `complexity`, `coverage` |
| `--only-crappy` | | `false` | Show only functions exceeding threshold |
| `--include` | | `**/*.{ts,tsx,js,jsx}` | Source file glob |
| `--exclude` | | `**/node_modules/**` | Exclusion glob |

### Exit codes

- **0** — project passes (crappy % within project threshold)
- **1** — project flagged (too many crappy functions), or `--init` found no test runner
- **2** — the run did not score the project (missing coverage, bad arguments, V8 without `-f v8`, or no source files)

## Output formats

**Table** — color-coded terminal output with function scores and a project summary.

**JSON** — full `ProjectSummary` object for programmatic consumption.

**HTML** — self-contained interactive report with sortable columns and color-coded rows.

## Coverage formats

| Format | File type | Detection |
|--------|-----------|-----------|
| Istanbul | JSON | Content structure |
| LCOV | Text | `.info` extension or `SF:` prefix |
| V8 | JSON | Must specify `-f v8` |

## Development

```bash
bun test          # Run tests
bun run check     # Type check with tsc
bun run score     # CRAP-score this repo (needs coverage/lcov.info)
bun run vet       # Lint, format, typecheck, and gates
```

`bun run gate` runs the repo rules, `bun test --coverage`, then `bun run score`. The score uses `coverage/lcov.info` on `src` and `plugin` and skips `*.test.ts`. The project limit is 0. Exit 1 means this repo has a crappy function.

### Releases

This project uses [Changesets](https://github.com/changesets/changesets) and publishes to [GitHub Packages](https://github.com/features/packages).

1. After making a user-facing change, run `bun run changeset` and commit the generated file.
2. Merge to `main`. The Release workflow opens a **Version Packages** PR (or updates it).
3. Merge that PR to publish `@graffhyrum/crap4ts` to GitHub Packages and create a GitHub release tag.

## License

MIT. See [LICENSE](LICENSE).