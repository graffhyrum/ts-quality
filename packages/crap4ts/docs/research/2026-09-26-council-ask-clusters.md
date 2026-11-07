# Council ask clusters (2026-09-26)

Primary sources only. Each cluster is one conventional answer.

## Hook contract

Questions: stop-hook exit code on failure; whether the hook must jail `CURSOR_PLUGIN_ROOT`.

- Exit `0` means the hook succeeded and Cursor uses the JSON. A non-empty `followup_message` is then submitted as the next user message. Source: [Cursor Hooks](https://cursor.com/docs/hooks) — "Exit code `0` - Hook succeeded, use the JSON output" and "When provided and non-empty, Cursor will automatically submit it as the next user message."
- Any exit other than `0` or `2` is a failed hook. The action proceeds and the JSON is not the success output. Source: same page — "Other exit codes - Hook failed, action proceeds (fail-open by default)."
- Exit `2` blocks the action. Source: same page — "Exit code `2` - Block the action."
- Cursor expands `${CURSOR_PLUGIN_ROOT}` to the plugin install path. Source: [Cursor plugins reference](https://cursor.com/docs/reference/plugins) — "Cursor expands `${CURSOR_PLUGIN_ROOT}` ... to the plugin's install path."
- Path confinement of package files is a client duty. Source: [Agent Plugins spec](https://agent-plugins.org/specification) — "the filesystem-resolved path MUST remain within the filesystem-resolved plugin root."

Answer: emit `followup_message` with exit `0`. That is how a stop hook continues the agent. A non-zero exit drops that message and fail-opens. Do not re-check `CURSOR_PLUGIN_ROOT` inside the hook. `hooks.json` already uses `${CURSOR_PLUGIN_ROOT}`, which Cursor expands.

## CI commands and Bun version

Questions: pin Bun or use `latest`; run global `rule-validator` / `stepdown-rule` in CI; pass `plugin` globs to stepdown.

- setup-bun, when `bun-version` is omitted, reads `package.json` `packageManager`, then `engines.bun`, then `latest`. Source: [oven-sh/setup-bun README](https://github.com/oven-sh/setup-bun) — "By default, if no version is specified, the action will: 1. Check `package.json` for the `packageManager` field."
- Explicit `bun-version: latest` skips that chain. The README shows it as an override, not the default.
- GitHub Actions installs dependencies from the manifest, then runs package scripts. Source: [Building and testing Node.js](https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-nodejs) — "Using `npm install` installs the dependencies defined in the `package.json` file."
- Bun's CI guide is `setup-bun`, then `bun install`, then project commands. Source: [Bun GitHub Actions guide](https://bun.com/docs/guides/runtime/cicd).
- stepdown-rule default patterns are `src/**/*.ts`. Other trees are extra arguments. Source: [stepdown-rule README](https://github.com/graffhyrum/stepdown-rule) — `stepdown-rule analyze "src/**/*.ts" "lib/**/*.ts"` and "`patterns` (default: `src/**/*.ts`)".

Answer: set `packageManager` to the Bun version you run, and omit `bun-version: latest`. CI runs scripts that `bun install` can execute. It does not call global CLIs that are not dependencies. When `plugin` is in the score set, the stepdown invocation includes that glob. The tool does not do that by default.

## Type of `TriageAction`

Question: flat type plus runtime checks, or a discriminated union.

- Source: [TypeScript handbook, Discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) — "The problem with this encoding of `Shape` is that the type-checker doesn't have any way to know whether or not `radius` or `sideLength` are present based on the `kind` property." The fix on that page is one type per `kind`, with the payload required on that member.

Answer: `TriageAction` is a discriminated union on `kind`. `parseTriageAction` stays as the JSON boundary.

## Missing V8 source

Question: fail the run, or warn and skip.

- Node's test-runner coverage, when `readFileSync` throws: "The file can no longer be read. It may have been deleted among other possibilities. Leave it out of the coverage report." Source: [nodejs `lib/internal/test_runner/coverage.js`](https://github.com/nodejs/node/blob/main/lib/internal/test_runner/coverage.js).
- Istanbul's report context throws if it must display source: "Unable to lookup source." Source: [istanbul-lib-report `context.js`](https://github.com/istanbuljs/istanbuljs/blob/master/packages/istanbul-lib-report/lib/context.js).

Answer: warn and skip. That matches Node when coverage cannot read a file. Istanbul throws only when a report must print the source text.
