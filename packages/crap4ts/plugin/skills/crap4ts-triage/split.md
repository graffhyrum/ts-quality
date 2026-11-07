# Split a complex function

Complexity is at least the threshold.

At full coverage the score equals complexity, so tests cannot clear it.

Edit `action.name` in `action.filePath`, from `action.startLine` to `action.endLine`. A new helper in that same file may sit outside the span. Do not edit other files.

The move must remove at least one counted token from the named function: `if`, loop, `case`, `catch`, `?:`, `&&`, `||`, `??`, or the assignment forms `&&=`, `||=`, `??=`. If the count does not drop, it is not a split.

Put the helper next to the function. A nested helper is also allowed. Nested functions are scored on their own.

Keep each new helper at complexity 4 or below when you can. At 0% coverage, complexity 4 scores 20. Complexity 5 scores 30, so the next triage names it as a test. A helper at or above the threshold only moves the failure.

Use the first move that fits:

1. Move an `if` or a loop together with its body into a helper. Leave one call. Pass the values the block reads. Return the value it writes.
2. Move a condition that uses `&&`, `||`, or `??` into a named predicate. Leave the `if`.
3. Replace a `switch` or an `else if` chain that maps a key to a value or to one call with a `Record` next to the function. Do not add a class hierarchy.
4. Replace a `for` that filters or maps with `.filter`, `.map`, or `.flatMap`. Keep each callback at complexity 4 or below. If the loop uses `break`, `continue`, or `await` in order, use move 1 on the body instead.
5. Move one `try`/`catch` into a helper whose only job is that call and its error mapping.
6. Delete a guard when a built-in already returns the same result for that edge (`slice`, `Math.max`, `Math.min`). Check each deleted guard. If a caller expects an error, keep the guard.
7. When several decisions answer one question, move all of them into one helper with a small parameter list. The named function calls it once.
8. When the change you are making would add a branch, put the new logic in a new function and leave one call in the old function.
9. When the blocks share many locals, extract nested arrows that close over those locals. Do not start with a class.

Do not extract a log line or a plain assignment. Do not replace `a && a.b` with `a?.b` when a value can be `0`, `""`, or `false`.

Then run `bun ${CURSOR_PLUGIN_ROOT}/scripts/gate.ts`. If that gate exits 1, run triage again.

Complexity 30 at full coverage stays crappy under the default threshold.
