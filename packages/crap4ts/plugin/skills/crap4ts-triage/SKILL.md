---
name: crap4ts-triage
description: Names the next edit from a crap4ts report. Use when the gate exits 1. Run scripts/triage.ts before naming a function.
---

# crap4ts triage

1. Run `bun ${CURSOR_PLUGIN_ROOT}/scripts/triage.ts` before any edit. Do this even when a hook message already named a file. Add `--every` only when the user asked to clear every crappy function.
2. When `action` is null, stop. If the project is still flagged, say that no in-repo function was named.
3. Use `action.reference` only. Do not choose an edit from `kind`.
4. Read only that reference file in this skill directory.
5. Do what that reference says.
   - `join.md`: fix the coverage join. Do not edit the function.
   - `test.md`: add a test that hits `action.filePath` from `action.startLine` to `action.endLine`. Do not edit the function.
   - `split.md`: edit `action.name` in `action.filePath`. A helper in that same file may sit outside the function span. Do not edit other files.
6. Run `bun ${CURSOR_PLUGIN_ROOT}/scripts/gate.ts` again.
7. When gate `exit` is 0, stop. When `exit` is 1, go back to step 1. When `exit` is 2, stop and repeat `message`.
8. Do not open `.crap4ts/report.json`. Do not recompute CRAP. Do not change thresholds. Do not add `--exclude`.
