# PR #37 frontend recovery audit

Date: 2026-10-10  
Audit branch: `recovery/frontend-gap-audit`

## Baseline

| Label | Commit | Meaning |
| --- | --- | --- |
| MAIN | `7f2b3b6` | `origin/main` when the audit began |
| PRE | `30352f6` | Parent of the actual PR #37 revert; last tree before the revert |
| REVERT | `6e2c5ed` | `Revert "Merge pull request #37 from KurtJMinoza/mm"` |
| R39 | `7ab5e9d` | Merge commit for PR #39 |
| R39 tip | `efec62a` | Recovery commit merged by PR #39 |

The original plan identified `f742720` as the revert. That commit is actually the later
`fix(shop): restore checkout payments and order page` commit. The fatal revert is
`6e2c5ed`.

## Result

No frontend file from PRE is missing on MAIN:

```text
git diff --name-status --diff-filter=D 30352f6 7f2b3b6 -- src/
# no output
```

PR #39 restored the complete 17-path frontend patch removed by `6e2c5ed`. There is
therefore no evidence-backed `git checkout PRE -- <path>` candidate. Restoring PRE
wholesale would regress later checkout-payment, storefront ATP, packing, and Material
Master improvements.

The path-by-path classification is in
[`PR37_FRONTEND_GAP_AUDIT_2026-10-10.csv`](./PR37_FRONTEND_GAP_AUDIT_2026-10-10.csv).

## Remaining PRE-to-MAIN differences

Only four frontend files differ between PRE and MAIN:

- `MaterialsPage.tsx`: the later dedicated Batch / Serial column.
- `MarketplaceProvider.tsx`: later payment selection, `/shop/orders` navigation, and
  the storefront availability convenience gate. The server checkout gate remains
  authoritative.
- `MarketplaceCheckoutPage.tsx`: later checkout payment/default cleanup.
- `MarketplaceOrdersPage.tsx`: later import/lint cleanup.

These are post-PRE changes, not recovery gaps.

## Route and navigation audit

| Flow | Route | Registration | Build result |
| --- | --- | --- | --- |
| Material list/create entry | `/modules/mm/material-master/materials-skus` | MM registry plus thin App Router page | Emitted |
| Picking | `/modules/mm/warehouse-management/picking` | MM registry plus thin App Router page | Emitted |
| Packing | `/modules/mm/warehouse-management/packing` | MM registry plus thin App Router page | Emitted |
| SD sales orders | `/modules/sd/sales-orders` | SD route plus dashboard page | Emitted |
| Storefront checkout | `/shop/checkout` | App Router page | Emitted |
| Storefront orders | `/shop/orders` | App Router page restored by PR #39 | Emitted |

No audited P0 route is a static 404 or a dead module-registry target. Runtime RBAC,
API response behavior, and authenticated browser workflows still require a running
backend and seeded test users.

## Validation performed

- `npm run build`: passed; 223 static/dynamic pages generated.
- Repository-wide `npx tsc --noEmit --pretty false`: blocked by a pre-existing corrupt
  `.next/dev/types/routes.d.ts` cache artifact. The production build regenerated and
  compiled its own route types successfully, but the stale dev file remains included
  by `tsconfig.json`.
- Repository-wide lint: failed on the existing backlog (812 findings: 710 errors and
  102 warnings).
- Targeted lint of the 17 recovered frontend paths: SD/storefront paths passed; MM
  warehouse picking/packing/types retain 17 `no-explicit-any` errors and 4 warnings.
- `git diff --check`: passed before adding this report.

## Recovery decision

- LOST P0 paths: none.
- LOST P1 paths: none.
- Required frontend restore PRs: none.
- Intentional removal: `StorefrontOrdersDrawer.tsx`, replaced by the dedicated
  `/shop/orders` route in PR #37 and restored the same way in PR #39.
- Next release gate: run the authenticated smoke matrix against a seeded backend and
  record API/RBAC outcomes; do not restore additional PRE files unless that runtime
  pass identifies a concrete regression.
