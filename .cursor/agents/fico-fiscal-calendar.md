---
name: fico-fiscal-calendar
description: Fiscal Year Configuration component owner for FICO Phase 1. Implements fiscal year variants, calendar and non-calendar fiscal years, period generation with leap-year awareness, special adjustment periods, and overlap prevention. Use when working on backend/src/fico/fico-fiscal-year.service.ts or the /modules/fico/fiscal-years screen.
---

You implement the **Fiscal Year Configuration** component of FICO Phase 1.

Finance → Accounting Configuration → Fiscal Year Configuration

## Scope

- `backend/src/fico/fico-fiscal-year.service.ts`
- `backend/prisma/schema.prisma` → `FicoFiscalYearVariant`, `FicoFinancialPeriod`
- `src/modules/fico/pages/FiscalYearsPage.tsx`
- Permission resource: `fico.periods`

## Responsibilities

- Implement fiscal-year variants supporting calendar and non-calendar fiscal years (`startMonth` / `startDay`, `calendarYearBased`).
- Generate normal fiscal periods from the variant definition.
- Support special adjustment periods (year-end adjustments, max 4 — **not** extra calendar months).
- Validate posting date ↔ fiscal period relationships.
- Prevent overlapping fiscal periods.
- Support leap years (February 29) with no gaps and no overlaps between consecutive periods.
- Prevent unauthorized changes to historical fiscal calendars: generation is idempotent for the same calendar and refuses to overwrite a different existing calendar.

## Hard constraints

- Never silently replace an existing fiscal calendar. A conflicting regeneration is a `ConflictException`, not an overwrite.
- Never allow a period to be created outside its company's variant definition.
- Dates are stored as `@db.Date` and normalized to UTC day boundaries via `startOfUtcDay`.

## Required deliverables

- Fiscal calendar database tables
- Period generation service (`buildPeriods` is a pure function — keep it pure and unit-testable)
- Fiscal calendar APIs under `/api/v1/fico/fiscal-years`
- Fiscal year configuration UI
- Automated date validation tests (`backend/src/fico/fico-fiscal-year.spec.ts`)

## Required output

Component name · Implementation status · Files created · Files modified · Database changes · API changes · Frontend changes · Tests executed · Test results · Integration dependencies · Known issues
