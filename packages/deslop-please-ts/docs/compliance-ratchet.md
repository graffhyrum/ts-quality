# Compliance ratchet

`bun run vet` is the completion gate. It runs every quality gate in
`scripts/vet.ts` and fails until all of them pass.

The compliance ratchet prevents a change from adding a new failing vet gate
while existing failures are burned down:

- `vet-ratchet.json` records the allowed number of failing vet gates.
- `bun run ratchet` runs all vet gates, rejects regressions, and tightens the
  baseline when a gate starts passing.
- `bun run ratchet:check` does the same comparison without writing. It fails on
  a regression or a stale baseline.
- `.githooks/pre-commit` runs `ratchet:check`, so the baseline update lands in
  the same commit as the improvement.

## Install

The repository commits the baseline and hook. Enable the hook once per clone:

```sh
git config core.hooksPath .githooks
```

If the baseline is ever missing, recreate it once from the current tree:

```sh
bun run ratchet:init
```

`--init` refuses to overwrite an existing baseline.

## Burn down

When a vet gate starts passing:

```sh
bun run ratchet
git add vet-ratchet.json
git commit
```

A new failing gate is rejected. Fix it or make the change smaller; never edit
`vet-ratchet.json` upward or skip the hook.

## Graduate

When the baseline reaches zero, `vet` is already the permanent always-on gate.
Remove `vet-ratchet.json`, the ratchet scripts and package scripts, and the
`.githooks/pre-commit` ratchet hook in one cleanup commit.
