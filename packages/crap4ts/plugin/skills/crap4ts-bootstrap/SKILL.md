---
name: crap4ts-bootstrap
description: Installs @graffhyrum/crap4ts, writes the gate config, and optionally adds the CI workflow. Use when the user asks to add, install, or configure crap4ts.
---

# crap4ts bootstrap

1. When the user asks to install, run `bun ${CURSOR_PLUGIN_ROOT}/scripts/bootstrap.ts --apply`.
   When the user asks for CI, run `bun ${CURSOR_PLUGIN_ROOT}/scripts/bootstrap.ts --apply --ci`.
   Otherwise run `bun ${CURSOR_PLUGIN_ROOT}/scripts/bootstrap.ts`.
2. Obey the JSON. Do not add steps.
3. When `reference` is `github-packages.md`, read that file.
4. Stop on every `code`. Repeat `message`. Do not run `message` as a shell command. To install, re-run with `--apply`. Do not invent a token.
