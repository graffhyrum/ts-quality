# crap4ts — Interview Pack

## Product Overview

**crap4ts** is a CLI tool that calculates CRAP (Change Risk Analysis and Predictions) scores for TypeScript/JavaScript codebases. It identifies high-risk functions by combining cyclomatic complexity with test coverage data.

> CRAP(C, cov) = C² × (1 - cov)³ + C

- **Complexity (C)**: cyclomatic complexity via AST analysis
- **Coverage (cov)**: test coverage ratio (0.0–1.0)
- **Threshold**: default 30 (score ≥ 30 = "crappy")

## Target Role Signal

**Senior SDET / Test Automation Lead**

This project signals readiness for senior SDET because:

1. **Built a custom tool** — Identified a gap inavailable tooling (no TypeScript CRAP calculator) and filled it
2. **Production usage** — Actually used in SDET workflows to find code smells
3. **Clean-room implementation** — Demonstrates IP awareness (re-implemented from spec, not copy-paste)
4. **Multi-format coverage parsing** — Shows ability to work with industry formats (Istanbul, LCOV, V8)

## Architecture

```
src/
├── complexity/     # AST visitor for cyclomatic complexity
├── coverage/       # Format parsers (istanbul, lcov, v8)
├── mapping/        # Map coverage to functions
├── crap/           # CRAP score computation
├── report/         # Output formatters (table, json, html)
├── detect/         # Test framework detection + gitignore
└── cli.ts          # Command-line interface
```

### Key Dependencies

- **TypeScript AST**: `ts-morph` for source code analysis
- **Coverage formats**: Istanbul JSON, LCOV text, V8 JSON
- **Output**: Terminal tables, JSON API, HTML reports

## SDET Use Case

**Problem**: In test automation, you need to know which test code is high-risk to prioritize refactoring or additional coverage.

**Solution**: Run crap4ts against your test files to surface functions that are both complex and poorly tested.

```bash
# Find high-risk test code
crap4ts -c ./coverage/coverage-final.json test/**/*.ts --only-crappy

# Output example:
# ┌─────────────────────────────────┬───────────┬──────────┬───────┐
# │ Function                        │ Complexity│ Coverage│ CRAP  │
# ├─────────────────────────────────┼───────────┼──────────┼───────┤
# │ validatePaymentWithDiscount     │ 12        │ 20%      │ 89    │
# │ processMultiCurrencyOrder      │ 8         │ 15%      │ 52    │
# └─────────────────────────────────┴───────────┴──────────┴───────┘
```

### How You Used It

- **Exploratory code-smell tool**: Ran against test suites to identify high-risk areas
- **Prioritization signal**: Focused refactoring efforts on functions with CRAP > 30
- **CI-ready**: Exit codes allow integration as quality gate

## Metrics & Sample Output

### CLI Output (Table)

```
Project: my-test-suite
Threshold: 30
Total functions: 47
Crappy functions: 8 (17.0%)
Status: ✓ PASS
```

### JSON Output (Programmatic)

```json
{
  "functions": [
    {
      "name": "validatePaymentWithDiscount",
      "filePath": "test/payment.test.ts",
      "startLine": 45,
      "endLine": 78,
      "complexity": 12,
      "coverage": 0.2,
      "crapScore": 89,
      "isCrappy": true
    }
  ],
  "totalFunctions": 47,
  "crappyCount": 8,
  "crappyPercent": 17.0,
  "isFlagged": false
}
```

### HTML Report

Self-contained interactive HTML with sortable columns, color-coded rows (green/yellow/red by risk).

## STAR Story

**Situation**: Test suite growing rapidly, needed way to identify which test code needed attention before CI failures became frequent.

**Task**: Build a tool to surface code-smell in test automation code — functions that were complex but untested.

**Action**:
- Researched existing solutions (found crap4clj for Clojure, nothing for TypeScript)
- Implemented clean-room port in TypeScript
- Added multi-coverage format support for flexibility
- Integrated into exploratory workflow

**Result**:
- Identified 8 high-risk test functions in first run
- Focused refactoring on CRAP > 30 areas
- Tool now part of pre-commit checklist

## Demo

[Record a 2-minute walkthrough covering:]
1. Running crap4ts against a test file
2. Pointing to a high-CRAP function
3. Explaining the risk score
4. Showing HTML report view

## Postmortem

### What Worked

- Clean-room approach was good interview conversation
- Multi-format support = broad applicability
- CLI-first = easy CI integration

### What You'd Do Differently

- Add GitHub Actions integration
- Add web UI for visualization
- Add real-time file watching (--watch mode)
- Publish to npm for broader consumption

### Lessons Learned

- TypeScript AST parsing is trickier than expected (decorators, overloads)
- Coverage format variations make parsing complex
- Would use a parser combinator library for robustness