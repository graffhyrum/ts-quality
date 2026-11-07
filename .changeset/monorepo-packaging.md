---
"@graff/rule-validator": patch
"@stepdown/analyzer": patch
---

Packaging for release tarballs: `files` now ships the `src` bin targets and excludes test files, compiled release binaries, and local tool data; rule-validator declares its direct `minimatch` dependency.
