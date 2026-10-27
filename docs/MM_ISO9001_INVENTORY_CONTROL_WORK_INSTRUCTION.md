# ISO 9001 Work Instruction — Inventory Control (Cycle Counting & Variance Analysis)

This document maps the AGCTEK MM-10 **Inventory Control** module to the ISO 9001–aligned process below. Physical inventory changes always post through `InventoryPostingService` (COUNT_GAIN / COUNT_LOSS); this work instruction covers the **operational and approval controls** before posting.

## Process overview

| Step | Activity | Role | System path | Control criteria |
| --- | --- | --- | --- | --- |
| 1 | Cycle counting | Inventory Auditor / Clerk | Count Planning → Count Sessions → Cycle Counting | Documented count policy & plan; blind count when policy requires; entries compared to system on-hand |
| 2 | Physical inventory | Warehouse Manager / Auditor | Physical Inventory → Recounts | Full warehouse count on schedule; **any first-pass discrepancy on physical inventory forces a mandatory recount** before variance closure |
| 3 | Variance analysis | Inventory Controller | Variance Analysis | Root cause + corrective action per variance; **formal variance report** (`VR-YYYYMMDD-#####`) before adjustment request |
| 4 | Adjustment approval | Finance Controller / Warehouse Manager | Adjustment Approval | **Approve** (no ledger write) then **Post to ledger** (inventory adjustment via MM-08) |

## End-to-end flow (count engine)

```text
MmCountPolicy → MmCountPlan → MmCountSession → MmCountTask
      → MmCountEntry (physical qty)
      → MmCountVariance (system vs physical)
      → [Mandatory recount if PHYSICAL_INVENTORY first pass ≠ system]
      → Investigation (rootCause, correctiveAction, investigatedBy)
      → Session variance report (varianceReportNumber)
      → MmCountAdjustmentRequest (PENDING_APPROVAL)
      → APPROVED (management) → POSTED (InventoryPostingService)
```

## API controls (canonical)

| Action | Method | Path |
| --- | --- | --- |
| List variances | GET | `/api/v1/mm/inventory-control/variances` |
| Investigate variance | PATCH | `/api/v1/mm/inventory-control/variances/:id/investigation` |
| Submit variance report | POST | `/api/v1/mm/inventory-control/count-sessions/:id/submit-variance-report` |
| Create adjustment request | POST | `/api/v1/mm/inventory-control/adjustment-requests` (requires submitted variance report) |
| Management approve | POST | `/api/v1/mm/inventory-control/adjustment-requests/:id/approve` |
| Post to ledger | POST | `/api/v1/mm/inventory-control/adjustment-requests/:id/post` |
| Finance approve (above threshold) | POST | `/api/v1/mm/inventory-control/adjustment-requests/:id/approve-finance` |
| Company count configuration | GET/POST | `/api/v1/mm/inventory-control/count-configuration` |
| Dashboard KPIs | GET | `/api/v1/mm/inventory-control/dashboard?companyId=` |
| Active hard freezes | GET | `/api/v1/mm/inventory-control/movement-freezes?companyId=` |

## Legacy count path

Older `MmInventoryCount` / count-line screens remain for backward compatibility. New ISO-governed work should use the **count engine** (plans & sessions). Legacy approval still uses `/counts/:id/approve` and `/counts/:id/post-adjustments` on the Adjustment Approval page.

## Records retained

- Count policies, plans, sessions, entries (who counted, when)
- Variance records with investigation fields
- Variance report number and submission timestamp on session
- Adjustment request with line-level root cause and approver
- Posted inventory adjustment / ledger transaction (immutable)

## Related docs

- `docs/MM_FULL_PROCESS_FLOW_QA.md` — Phase 9 inventory control QA steps
- `docs/MASTER_ENTERPRISE_SYSTEM_FLOW.md` — §23 Inventory control
- `docs/MM_ARCHITECTURE.md` — MM-10 ownership
