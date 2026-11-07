# Add a covering test

Complexity is below the threshold and coverage is a number, including 0.

Add a test that executes a statement inside `action.filePath` from `action.startLine` to `action.endLine`.

Put the test in a test file. Do not edit the function. Do not export it for the test.

Use the first move that fits:

1. Call the function with an input that enters the uncovered branch. Assert the value the code returns now. If that value looks like a bug, record it and tell the user. Do not fix the function.
2. When the function already takes a dependency as a parameter, pass a fake from the test.
3. When the function calls an imported clock, file system, or network and has no such parameter, replace that import in the test with `mock.module`. Do not mock the module that holds the function.
4. When the function is not exported, call the nearest exported function whose path runs through the span. A caller with an empty array does not run a `.map` callback.

A hit count above 1 does not help. A second test that runs only lines that are already covered adds nothing.

If no input from outside can reach the lines, stop and report that. Do not edit the function to make the branch reachable.

Then run `bun ${CURSOR_PLUGIN_ROOT}/scripts/gate.ts`. If that gate exits 1, run triage again.

Complexity 5 at 0% coverage scores 30. Any coverage above 0 clears that case under the default threshold. A higher complexity needs more of its statements covered. One hit on every statement in the span is full coverage.
