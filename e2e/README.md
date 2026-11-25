# E2E regression (`e2e/`)

Playwright Test specs generated or maintained after AI exploratory QA.

```text
e2e/
  auth/     authentication
  mm/       materials / inventory
  sd/       sales
  pos/      point of sale
  fico/     finance / journals / GL
```

Prerequisites: edge + frontend + backend running (`npm run pm2:start` after builds).

```bash
npm run test:e2e
E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e
```
