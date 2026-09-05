# Claude Code Project Guidelines

## Core System Context
You must always read, respect, and apply the principles defined in the following workspace documentation before executing any code modifications, refactors, or feature designs:
- **Product Context:** Refer to the requirements, goals, and logic outlined in `prd.md`.
- **Engineering Standards:** Adhere strictly to the architecture, constraints, and instructions inside `execution.md`.

## Development Commands
- **Install dependencies:** `npm install`
- **Run dev server:** `npm run dev`
- **Run test suite:** `npm test`

## Rules of Engagement
1. Do not ask for user confirmation to read `prd.md` or `exec.md`; they are your permanent anchor points.
2. If an explicit feature request contradicts `prd.md`, point out the discrepancy to the user before generating code.
3. Validate all generated scripts and architectures against the rules defined in `exec.md`.
