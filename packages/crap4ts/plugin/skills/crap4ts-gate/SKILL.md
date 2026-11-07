---
name: crap4ts-gate
description: Runs the crap4ts gate and reports the exit code. Use when the user asks to run the CRAP gate or asks whether the project is flagged.
---

# crap4ts gate

1. Run `bun ${CURSOR_PLUGIN_ROOT}/scripts/gate.ts`.
2. Repeat `exit`, `crappyCount`, `crappyPercent`, and `message` from the JSON.
3. When `exit` is 1, run the crap4ts-triage skill.
4. When `exit` is 2, stop. Do not triage.
5. Do not open `.crap4ts/report.json`. Do not choose an edit from the gate JSON.
