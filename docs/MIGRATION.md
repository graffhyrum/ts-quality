# ts-quality monorepo: migration notes

## Why one repository
rule-validator, stepdown-rule, crap4ts, and mutate4ts gate each other (each uses the others as
dev tools) and ts-template consumes all four. As separate repos that coupling was a cycle of
GitHub-ref dev dependencies: a security fix in one root could not pass `bun audit` until the others
had released. Here they link with `workspace:*`, so one lockfile and one `bun audit` cover the
whole graph and a fix lands in one change.

## Layout
- `packages/<tool>`: each tool keeps its package name, bin name, config, bunfig thresholds, and
  scripts. Gates run inside the package directory (`scripts/vet-all.ts`), never as one root
  `bun test`, so per-package coverage thresholds and test module caches stay separate.
- `templates/ts-template`: the template, developed against the workspace tools.
- `bunfig.toml` sets `linker = "isolated"`: each package sees only its declared dependencies.
- History: each original repo was moved under its directory in one commit and merged without
  rewriting. Original tags are kept with a directory prefix (`crap4ts/v2.1.3`).

## Gates (CI runs all of them)
| Command | What it checks |
| --- | --- |
| `bun audit` | whole workspace graph, no overrides |
| `bun run check:root` | root scripts: format, lint, typecheck, unit tests |
| `bun run vet` | each package's own gates in its own directory |
| `bun run test:plain` | plain sequential `bun test` per package (catches cross-file mock leaks) |
| `bun run smoke:export <emptyDir>` | packs tarballs, checks contents, exports the template, installs it over HTTP in a fresh git repo, asserts no `core.hooksPath`, re-installs with `--frozen-lockfile`, runs its `vet` and `build` |

## Versions and tags
- Changesets owns versions (`.changeset/`). `privatePackages.tag` is `false`: Changesets never
  tags; versions come from each `package.json`, never from imported tag names.
- `version.yml` only opens the "Version Packages" PR.
- Release tag per package: `<dir>-v<version>` (e.g. `stepdown-rule-v0.4.7`), URL-safe and distinct
  from imported `<dir>/v<version>` tags.

## Distribution
- `release.yml` is manual (`workflow_dispatch`). It reruns every gate, packs with
  `scripts/release-plan.ts` (tarball names, sha256, asset URLs in `manifest.json`), and creates
  DRAFT releases for versions without one. Drafts are not public and create no tag until a
  maintainer publishes them.
- Consumers install a tool with its release asset URL, for example
  `bun add -d https://github.com/<owner>/ts-quality/releases/download/crap4ts-v2.1.4/graffhyrum-crap4ts-2.1.4.tgz`.
- No registry publication runs from this repo. crap4ts' existing GitHub Packages publication
  lives in its original repo and is unchanged.
- The original repos stay as they are; existing `github:graffhyrum/<tool>#vX` installs keep
  working. They are not synced from here.

## Standalone template
`bun scripts/export-template.ts <emptyDir> <specs.json>` copies the template's tracked files
(minus lockfile, hooks, env files, caches), replaces every `workspace:` specifier with the
mapped specifier (refusing unmapped ones), and refuses non-empty destinations. The export has no
`bun.lock`: the first `bun install` in the exported project generates it against the release
URLs, and that lockfile is committed so its CI's `--frozen-lockfile` install holds. The exported
tree is what `graffhyrum/ts-template` (the GitHub template repo) receives.

The template installs no Git hooks: no `.husky`, no `prepare` hook setup. Run `bun run vet`
before committing; CI runs the same gate.

## Verified vs pending
- Verified locally: every gate above, including install over a local HTTP server.
- Pending a real release: download from an actual GitHub release asset URL, and the first export
  pushed to `graffhyrum/ts-template`.
