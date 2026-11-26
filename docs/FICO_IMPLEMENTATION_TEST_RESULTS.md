# FICO implementation test results

This file records **actual** test runs from the repository toolchain. Update after each hardening pass.

## Commands

```bash
cd backend
npm run test -- --testPathPattern=src/fico
npm run build
```

## Latest run (agent session)

Command: `npx jest src/fico --runInBand --forceExit`

| Metric | Result |
| --- | --- |
| Test suites | **22 passed**, 0 failed |
| Tests | **192 passed**, 0 failed |
| New suites | `fico-currency-policy.spec.ts`, `fico-financial-posting.engine.spec.ts` |
| Spec fixes | `fico-accounting-events.service.spec.ts` (processor ctor), `fico-account-determination.service.spec.ts` |

## Coverage gaps (honest)

Sections **33.4–33.8** (MM, POS, concurrency, rollback injection, acceptance scenarios A–H as integration tests) require database-backed or harness fixtures not fully present in this repo snapshot. Unit coverage exists for:

- Posting validation controls
- Journal approval workflow (partial)
- Document numbering
- Financial posting engine line rules
- Currency policy

## Build

`npm run build` requires `npx prisma generate` after schema changes (Windows: stop Node processes if EPERM on Prisma engine DLL).