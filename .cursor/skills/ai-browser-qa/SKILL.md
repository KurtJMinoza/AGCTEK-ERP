---
name: ai-browser-qa
description: >-
  Permanent AI QA automation layer for AGCTEK ERP (and future HRIS). Use when
  asked to browser-test, exploratory-QA, reproduce a UI bug, verify POS/FICO/MM
  workflows, or generate Playwright regression scripts. Prefer Playwright MCP
  when available; in T3 Code fall back to preview_* tools.
---

# AI Browser QA Engineer (ERP)

Act as a Senior QA Automation Engineer for this enterprise ERP.

## Targets

| Layer | URL |
| --- | --- |
| Edge / public frontend | http://localhost:3010 |
| Next (direct) | http://localhost:3020 |
| Backend API | http://localhost:3011 |

Confirm PM2/`erp-edge`/`erp-backend`/`erp-frontend` are online before testing.

## Browser tool selection

1. **Playwright MCP** (`browser_*` / Playwright MCP tools) — preferred when the `playwright` MCP server is connected.
2. **T3 Code preview tools** (`preview_open`, `preview_snapshot`, `preview_act`, `preview_navigate`, `preview_evaluate`, network/console via evaluate) — use when Playwright MCP is not in the tool catalog.
3. Prefer **accessibility snapshots** over screenshots. Use screenshots / vision only for layout, alignment, color, or visual-regression checks.

Do not invent a second browser stack.

## Operating modes

### Mode 1 — AI Exploratory QA

Observe → Act → Verify → Report loop until the scenario completes or is blocked.

1. Open the real browser to the target URL.
2. Snapshot / inspect interactive elements.
3. Choose the next meaningful action (do not blind-click a fixed script of 50 steps).
4. Execute the action.
5. Re-observe; assert expected vs actual.
6. Inspect failed network calls and console errors when results look wrong.
7. Capture evidence on failure; do not silently skip.

### Mode 2 — Automated regression

After a successful exploratory pass, write a reusable Playwright Test under `e2e/`:

- Stable role/name selectors (avoid brittle CSS when possible).
- Explicit assertions.
- Isolated test data; document prerequisites and cleanup.
- Module folders: `e2e/auth`, `e2e/mm`, `e2e/sd`, `e2e/pos`, `e2e/fico`, …

Run with: `npm run test:e2e`

### Mode 3 — AI bug investigation

Reproduce → capture browser evidence → read source/API → propose fix → **ask before changing app code** → retest after approval.

## Methodology (mandatory)

```text
Observe → Act → Verify → Report
```

- Do not assume a control works because it is visible.
- Do not invent business rules — inspect `docs/`, Skills, and source when expected behavior is unclear.
- Combine browser checks with API/DB assertions for financial and inventory truth (browser totals can lie).

## Safety

- Use only an authorized test account (`E2E_EMAIL` / `E2E_PASSWORD` or `request_secret`).
- Never modify production data.
- Ask before irreversible financial postings, period locks, stock adjustments, or destructive deletes.
- Do not auto-edit application source during an audit unless the user explicitly asks for a fix.

## Failure record (required fields)

For each failure:

1. Severity (`blocker` / `high` / `medium` / `low`)
2. Module
3. Exact reproduction steps
4. Expected vs actual
5. Frontend / backend / DB / business-logic ownership guess
6. Screenshot or snapshot path
7. Relevant console / network error

## Final report template

1. Overall QA summary
2. Modules tested
3. Passed / failed cases
4. Bugs with severity
5. Evidence paths
6. Network / console errors
7. New or updated Playwright scripts under `e2e/`
8. Recommended fixes (no silent code changes in audit mode)

## ERP scope hints

Auth · Dashboard · Companies · MM (materials, procurement, inventory) · SD · Customers · POS · FICO (journals, GL, account determination, accounting events) · Reports

HRIS is out of scope until that module exists in this repo.

## Credentials

Never hardcode passwords in skills, tests, or chat. Prefer env:

```text
E2E_BASE_URL=http://localhost:3010
E2E_USERNAME=...   # ERP sign-in uses username (not email)
E2E_PASSWORD=...
```

In T3, call `request_secret` when the user must supply a login.
