# AI Browser QA — AGCTEK ERP

Permanent AI QA automation layer for exploratory browser testing, Playwright regression, and AI-assisted bug investigation.

## Three modes

| Mode | Tooling | Purpose |
| --- | --- | --- |
| **1. Exploratory QA** | Playwright MCP or T3 `preview_*` | AI explores workflows, finds bugs, writes reports |
| **2. Regression** | Playwright Test (`e2e/`) | Repeatable scripts after a successful exploratory pass |
| **3. Bug investigation** | AI + browser + source | Reproduce, classify, propose fix, retest after approval |

Agent instructions: [`.cursor/skills/ai-browser-qa/SKILL.md`](../.cursor/skills/ai-browser-qa/SKILL.md)

## Playwright MCP (Cursor)

Configured in [`.cursor/mcp.json`](../.cursor/mcp.json):

```json
"playwright": {
  "command": "npx",
  "args": [
    "-y",
    "@playwright/mcp@latest",
    "--caps=testing,network,storage,devtools,vision"
  ]
}
```

Capabilities:

| Cap | Purpose |
| --- | --- |
| `testing` | Assertions / testing helpers |
| `network` | Inspect requests |
| `storage` | Cookies / auth state |
| `devtools` | Debugging |
| `vision` | Visual interaction (use sparingly) |

Reload MCP servers in Cursor after changing `mcp.json`. In **T3 Code**, if Playwright MCP tools are not listed, use the built-in `preview_*` tools instead — same Observe → Act → Verify loop.

## Regression commands

```bash
npm run test:e2e          # headless Chromium
npm run test:e2e:ui       # Playwright UI mode
npm run test:e2e:headed   # headed browser
```

Environment (do not commit secrets):

```bash
E2E_BASE_URL=http://localhost:3010
E2E_USERNAME=...
E2E_PASSWORD=...
```

## What MCP alone cannot guarantee

| Need | Approach |
| --- | --- |
| Accounting / inventory truth | API or DB assertions alongside UI |
| Permanent regression | Write Playwright Test files under `e2e/` |
| Domain rules | Read `docs/` and Skills; do not invent |

## Safety

Authorized test account only. Ask before irreversible financial or stock operations. Prefer snapshots over vision screenshots unless checking layout.
