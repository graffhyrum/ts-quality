# Fix coverage join

`coverage: null` means the file did not join.

Run from the repository root.

V8 needs `-f v8`.

Do not edit the function until a later run returns `split` or `test`.

Check `-c` and `-f` in `.crap4ts/gate.json`. Then run `bun ${CURSOR_PLUGIN_ROOT}/scripts/gate.ts`. If that gate exits 1, run triage again.

Do not change `threshold` or `projectThreshold`. Do not add `--exclude`.
