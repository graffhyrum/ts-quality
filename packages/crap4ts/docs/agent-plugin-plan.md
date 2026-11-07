# crap4ts agent plugin plan

Status: plugin code is in `plugin/`. This file is the review artifact. It matches the code after council round 1.

## Who it is for

An agent in a consumer repository installs the Cursor plugin once. The plugin carries three skills, three Bun scripts, and one stop hook. CI calls the `crap4ts` binary. CI does not load the plugin.

The maintainer keeps the CLI as the calculator. Scripts classify. The model edits source only after a script names one action.

## Plugin layout

Matches the Continual Learning plugin shape.

```
.cursor-plugin/plugin.json
skills/crap4ts-bootstrap/SKILL.md
skills/crap4ts-gate/SKILL.md
skills/crap4ts-triage/SKILL.md
skills/crap4ts-triage/join.md
skills/crap4ts-triage/split.md
skills/crap4ts-triage/test.md
scripts/bootstrap.ts
scripts/gate.ts
scripts/triage.ts
hooks/hooks.json
hooks/stop.ts
templates/gate.yml
```

`plugin.json` sets `"skills": "./skills/"` and `"hooks": "./hooks/hooks.json"`.

The stop hook command uses `bun` and `${CURSOR_PLUGIN_ROOT}`, the same pattern as Continual Learning `hooks/hooks.json`.

## Records

Scripts are the only writers. Skills trust the records.

### GateConfig

Version 1. Fields: `coverageCommand`, `crapArgs`, `threshold`, `projectThreshold`. Path: `.crap4ts/gate.json` in the consumer repo.

`coverageCommand` must be exactly `bun test --coverage`. `gate.ts` refuses any other command.

`threshold` is the CRAP cutoff. `gate.ts` passes it to `crap4ts` as `-t`. The same number is the split floor. Complexity at or above `threshold` is `split`, because the score cannot fall below complexity. Complexity below `threshold` with a numeric coverage is `test`.

`projectThreshold` is passed as `--project-threshold`. `crapArgs` may only supply `-c` and `-f`. Other flags and positionals are dropped. The typed fields win. `threshold` must be 0 through 1000. `projectThreshold` must be 0 up to but not including 100.

### GateResult

Version 1. Fields: `exit` (0, 1, or 2), `isFlagged`, `crappyCount`, `crappyPercent`, `report`, `message`. `report` is the path `.crap4ts/report.json`. The file is written only after the stdout parses as a project summary. The model does not receive the full report.

### TriageAction

Kind is `fix-join`, `split`, or `test`. Fields: `filePath`, `startLine`, `endLine`, `complexity`, `coverage` (`number | null`), `crapScore`, `reference` (`join.md`, `split.md`, or `test.md`).

Rules:

- `fix-join` only when `coverage` is null.
- `split` only when complexity is at least the threshold.
- `test` only when complexity is below the threshold and coverage is a number.
- Sort crappy functions by `crapScore` descending, then `startLine`, then `filePath`, then `name`.
- Drop an action whose `filePath` resolves outside the repository root.
- Stdout of `triage.ts` is the first action plus `remaining`. Triage does not write a second file.
- `crapArgs` may only supply `-c` and `-f`. Other flags and positionals are dropped.
- `coverageCommand` must be exactly `bun test --coverage`.
- A `-c` path must resolve inside the repository.
- `threshold` must be 0 through 1000. `projectThreshold` must be 0 up to but not including 100.

Empty `actions` means no in-repo function was named. The project can still be flagged. Stop and say that.

## CLI facts the scripts must not reinvent

Source of truth is the current tree, not the README where they disagree.

- Package `@graffhyrum/crap4ts`. Bin runs `src/index.ts` on Bun. Published to GitHub Packages. Restricted. License UNLICENSED. No `engines` field.
- Config is argv only. No config file in the CLI.
- `--init` detects Bun only. It writes `bunfig.toml` for LCOV when missing. It prints `crap4ts -c coverage/lcov.info -f lcov`. If `bunfig.toml` exists, it skips the write and still exits 0.
- Bare `crap4ts` reads `./coverage/coverage-final.json`.
- Exit 0: project not flagged. Exit 1: `crappyPercent > projectThreshold` (default 0, strict greater-than). Exit 1 also means `--init` found no runner.
- Exit 2: `CrapError`, missing coverage, bad args, V8 file without `-f v8`, or no source files. The README lists 0, 1, and 2.
- Function crappy when `score >= threshold` (default 30). At full coverage, score equals complexity. Complexity 30 at full coverage stays crappy. Complexity 5 at 0% coverage scores 30 and is crappy. Complexity 4 at 0% scores 20 and is not.
- Null coverage uses 0 in the formula `C^2 * (1 - cov)^3 + C`. The table label can say `no cov` while JSON `isCrappy` is true.
- Display filter runs after summarize. `--all` does not change the exit code. Default JSON `functions` is crappy-only. Totals use the full set.
- Identity is absolute `filePath` plus `startLine` plus `endLine`. Name is not unique.
- Coverage join uses `path.resolve` against the process cwd. Positionals are literal paths. The shell must expand globs. PowerShell does not.
- V8 is not auto-detected.
- `--only-crappy` is not in the current `src/cli.ts` options. An unknown flag throws from `parseArgs`.
- Complexity walk does not count nested functions in the parent. Counted nodes include `if`, loops, `case` (not `default`), `?:`, `catch`, and `&&`, `||`, `??`.

## Skills

Descriptions are one sentence. Bodies are routers. A skill reads at most one reference, and only when the script names it.

| Skill | Triggers | Body |
| --- | --- | --- |
| `crap4ts-bootstrap` | add, install, configure | Run `scripts/bootstrap.ts`. Obey its JSON. |
| `crap4ts-gate` | run the gate, is the project flagged | Run `scripts/gate.ts`. Repeat exit, crappyCount, crappyPercent. |
| `crap4ts-triage` | gate exited 1, or what to change | Run `scripts/triage.ts`. Read the named reference. Follow that reference. Run the gate script again. |

Bootstrap does not score. The gate skill does not choose an edit. Triage does not install.

Bootstrap without `--apply` prints `bun add` and stops. It does not invent a GitHub token. With `--apply`, it installs, runs `bunx crap4ts --init`, and writes the default `GateConfig`. It does not parse `--init` stdout. With `--ci`, it copies `templates/gate.yml` to `.github/workflows/crap4ts.yml`. The workflow authenticates to GitHub Packages with `secrets.GITHUB_TOKEN` and `packages: read`, then runs `bun test --coverage` and `bunx crap4ts` with the same default coverage path and thresholds. The token works only after that repository is granted read access to the package. The workflow fails on exit 1.

`gate.ts` and bootstrap spawn `bunx crap4ts`, not a bare `crap4ts` on `PATH`.

`github-packages.md` loads only when bootstrap returns `needs-token`.

## Stop hook

`hooks/stop.ts` is a command hook. It is not a prompt hook.

If `.crap4ts/gate.json` is absent, print `{}` and exit 0.

If the file is present, `status` is `completed`, and `loop_count` is 0, run `gate.ts`, then `triage.ts` when the gate exits 1.

Exit 0 prints `{}`. Exit 2 returns `followup_message` with the gate `message`. The project was not scored. Exit 1 with an action returns `followup_message` that names the `crap4ts-triage` skill and tells the model to run `scripts/triage.ts` before any edit. The message does not include `filePath` or the function list.

## What the model does

Run the script the skill names. Read one reference. Edit the function in the first action. Run the gate script again.

The model does not classify, recompute CRAP, lower `--threshold`, raise `--project-threshold`, add `--exclude`, or delete a function only to cut the percent.

## Out of scope for this plan

Changing the CRAP formula, the default thresholds, or the CLI flag set. The author did not state why 30 or 5. The plugin treats them as the current defaults.
