---
"mutate4ts": major
---

No-targeting invocation now runs a full-project discovery scan instead of mutating cwd-only defaults. Add file-list targeting (`--files`, `--files-from`, legacy optional `<sourceFile>`), JSON quality reports, on-disk baseline at `.quality/mutate4ts-baseline.json`, and `--scan` behavior per the shared file-scoped quality gate ADR.