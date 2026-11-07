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
- Changesets owns versions (`.changeset/`, root `@changesets/cli` only). `privatePackages.tag` is
  `false`: Changesets never tags. `bun run version-packages` runs `changeset version && bun install`
  so workspace versions in `bun.lock` stay current.
- `version.yml` only opens the "Version Packages" PR. That PR is pushed with `GITHUB_TOKEN`, which
  does not trigger workflows: run CI on its branch with "Run workflow" (`ci.yml` has
  `workflow_dispatch`) before merging.
- Release tag per package: `<dir>-v<version>` (e.g. `stepdown-rule-v0.4.7`). Imported tags keep
  `<dir>/v<version>`.

## Release readiness (fail-closed)
`bun run release:plan <dir> --release --repo owner/name` refuses unless the ref is `refs/heads/main`,
the tree is clean, no changesets are pending, and every tool package's version was never released
(neither imported `<dir>/v<version>` nor new `<dir>-v<version>`) and is above every released version.
A package whose `<dir>-v<version>` tag exists and is unchanged since is skipped; changed since is an
error. Without `--release` the plan is a dry run (`kind: "dry-run"`) used by CI smoke; draft-releases
accepts only `kind: "release"` manifests built at the checked-out commit.

## Distribution
- `release.yml`: manual, main only, serialized, clean checkout of the dispatched commit, every gate,
  readiness, then DRAFT releases. Notes carry the package CHANGELOG section, install URL, and the
  sha256 of every asset. Drafts are not public and create no tag until a maintainer publishes them.
- Tools install by release asset URL, e.g.
  `bun add -d https://github.com/<owner>/ts-quality/releases/download/crap4ts-v2.1.4/graffhyrum-crap4ts-2.1.4.tgz`.
- stepdown-rule standalone binaries: the `stepdown-rule-v<version>` release carries the five platform
  binaries and `SHA256SUMS`. Download yours from that release page, check it against `SHA256SUMS`,
  and put it on PATH. `install.sh`/`install.ps1` are not shipped from this repo because they target
  the original repo's `releases/latest`; the original repo's releases keep them.
- After a maintainer publishes drafts, `bun scripts/verify-release.ts <planDir> <emptyDir>`
  downloads every asset from its public URL, re-hashes it against the manifest, installs each
  tarball by URL, and runs each bin with `--help`.
- No registry publication runs from this repo. crap4ts' GitHub Packages publication lives in its
  original repo and is unchanged.
- The original repos stay as they are; existing `github:graffhyrum/<tool>#vX` installs keep
  working. They are not synced from here.

## Standalone template
`bun scripts/export-template.ts <emptyDir> <specs.json>` copies the template's files as committed at HEAD (refusing uncommitted template changes)
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

## Follow-up notes
- Pending ts-template changesets are genuinely unreleased: in the original ts-template history,
  all five were added by commits that descend from the 0.2.0 version commit (`44573ea`,
  2026-01-06): `quality-gate` (b3bbb8e), `todo-app` (e24a05a), `mutate4ts-gate` (3f81280),
  `rule-validator-1-2-audit` (4d1e7b6), `mutate4ts-v1-pin` (7234ef8). No 0.2.x release followed.
- `bun scripts/template-specs.ts <out.json> --repo owner/name` maps every tool to its newest
  PUBLISHED release (not just the latest release run), downloads each tarball, and checks it against
  the sha256 in that release's notes. It fails closed if any tool has no published release. Its
  output is the specs file for `export-template.ts`.
- `draft-releases.ts` checks every tag before creating any draft. If a run stops partway, the next
  run refuses and names the leftover releases; review and delete leftover drafts
  (`gh release delete <tag> --repo <repo>`) or publish them, then rerun.
