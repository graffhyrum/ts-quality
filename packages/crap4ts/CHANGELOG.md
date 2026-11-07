# @graffhyrum/crap4ts

## 2.1.3

### Patch Changes

- 3a9c68d: Remove dependency-cruiser and the lint:boundaries script.

## 2.1.2

### Patch Changes

- 8febb15: Make `bun run vet` quiet on success while still printing full output on failure.

## 2.1.1

### Patch Changes

- 912fdce: Add rule-validator and stepdown-rule as dev dependencies, wire them into vet, and align CI/release workflows for automatic publishing.

## 2.1.0

### Minor Changes

- f603213: Add `--quiet` (`-q`) flag to suppress output on success while still printing the full report on failure.

## 2.0.0

### Major Changes

- 20ba41e: Flag a project when any function is crappy. The default `--project-threshold` is 0.

### Minor Changes

- c035ba9: Record the 2026-09-26 council notes and remove review files already folded into the distillation.
- aa3bde7: Add a Cursor plugin that bootstraps crap4ts, runs the CRAP gate, and names the next edit.
- 4638095: The README lists exit code 2 for runs that do not score the project.
- 77df9ac: Tell the triage skill which split and test moves lower a CRAP score.

### Patch Changes

- 2626db2: Document the Cursor plugin plan and the 2026-09-26 review notes.
- 26d5456: Unknown CLI arguments exit 2. The CI workflow authenticates to GitHub Packages with the workflow token.
- b7f7cc9: Treat an empty GitHub Packages token as missing, and copy a plugin file only when the source exists.
- a5f77c6: Run the coverage gate and the CRAP score in CI. Pin Bun with the packageManager field.
- b17a526: Fail the coverage-gap report when the coverage table is missing.
- d11e061: Check that code outside a package imports only that package's root files.
- 3cd4c46: Add a helper that appends one JSONL council-findings record.
- 20c0e83: `runPipeline` returns `0`, `1`, or `2`, matching the CLI exit contract.
- 2ab689f: update TS to V6
- c10db61: Run the CLI from `runCli` so a caller can handle the exit code without stopping the process.
- 52f90e4: Strip tokens and unsafe characters from plugin gate and triage messages before they reach the agent.
- cbf9eda: Reject a V8 coverage URL that points outside the source root, including a symlink target outside that root, and reject an offset past the end of the file.
- 1f5dd0e: Add a local skill that checks the CLI help, exit, init, and report contract.

## 1.1.0

### Minor Changes

- c33be0e: Added interview pack documentation with STAR story, architecture overview, and demo guide
- 0659077: Set up Changesets and GitHub Actions to publish scoped package to GitHub Packages (GPR)

### Patch Changes

- de15de0: Added GitHub repository metadata (repository, bugs, homepage) to package.json
