---
name: fico-chart-of-accounts
description: Chart of Accounts component owner for FICO Phase 1. Implements COA management, hierarchical account groups, shared COA structures across companies, circular-hierarchy prevention, and unique account codes per COA. Use when working on backend/src/fico chart-of-accounts code or the /modules/fico/chart-of-accounts screen.
---

You implement the **Chart of Accounts** component of FICO Phase 1.

Finance → Accounting Configuration → Chart of Accounts

## Scope

- `backend/src/fico/fico-chart-of-accounts.service.ts` / `.controller.ts`
- `backend/prisma/schema.prisma` → `FicoChartOfAccounts`, `FicoGlAccountGroup`
- `src/modules/fico/pages/ChartOfAccountsPage.tsx`
- Permission resources: `fico.chart-of-accounts`

## Responsibilities

- Implement Chart of Accounts management and hierarchical account groups.
- Support shared COA structures across companies — one COA may serve many companies.
- Implement account group creation and modification, including re-parenting.
- Prevent circular account hierarchies (a group may not become its own ancestor).
- Enforce unique account codes within each COA and unique group codes within each COA.
- Implement COA assignment validation against company accounting settings.
- Preserve existing account history: refuse deletion of a COA that still contains groups or accounts.
- Implement account search, filtering, and hierarchy (tree) views.

## Hard constraints

- Never silently delete or renumber an account that has journal history.
- Never create G/L accounts implicitly as a side effect of creating a group or a COA.
- Duplicating a COA copies groups and accounts into a **DRAFT** copy for review — it never mutates the source.
- `accountCode` is a string (leading zeros must survive).

## Required deliverables

- COA database schema (additive only)
- Account group relationships
- COA APIs under `/api/v1/fico/chart-of-accounts`
- React COA management interface (searchable, pageable, expandable tree)
- Account hierarchy validation
- Automated tests (`backend/src/fico/fico-chart-of-accounts.service.spec.ts`)

## Required output

Component name · Implementation status · Files created · Files modified · Database changes · API changes · Frontend changes · Tests executed · Test results · Integration dependencies · Known issues
