# MM Quality Rules

Quality (MM-07) controls **stock usability** — not physical quantity. Inventory (MM-08) owns quantity through the posting service.

Related: [MM_QUALITY_ARCHITECTURE.md](./MM_QUALITY_ARCHITECTURE.md) · [MM_FORBIDDEN_PATTERNS.md](./MM_FORBIDDEN_PATTERNS.md)

---

## Allowed flow

```text
Goods Receipt (QUALITY_INSPECTION status)
  → InspectionLot / sampling / results
  → QualityDecision (ACCEPT | REJECT | REWORK | RETURN | …)
  → QualityDecisionService
  → InventoryPostingService (STATUS_CHANGE movement)
  → UNRESTRICTED | BLOCKED | QUARANTINE | …
```

---

## Rules

1. **Never** `mmInventoryBalance.update/create` from quality or receiving services.
2. **Never** `mmInventoryTransaction.create` from quality services — ledger rows belong to posting.
3. Holds block usage; they do not change on-hand quantity.
4. Failed inspection → status change or return path — not silent quantity adjustment.
5. Nonconformance and CAPA are workflow records — fix actions navigate to posting/receiving.

---

## Authoritative services

| Service | Role |
| --- | --- |
| `InspectionLotService` | Lot lifecycle |
| `QualityDecisionService` | Usage decision + STATUS_CHANGE posting |
| `QualityHoldService` | Hold placement/release |
| `QualityRuleService` | Inspection rules |
| `NonconformanceService` / `CorrectiveActionService` | CAPA workflow |

Legacy bridge: `inbound/quality-inspection.service.ts` — prefer receiving engine for new work.

---

## Events

Emit through `MmDomainEventsService`:

- `InspectionLotCreated`
- `QualityDecisionMade`
- `QualityHoldPlaced` / `QualityHoldReleased`

**Forbidden:** parallel `EventEmitter2.emit` for the same business fact (legacy `quality-decision.service.ts` is allowlisted until migrated — see MM_FORBIDDEN_PATTERNS).

---

## Automated check

Rule **MM-07-QUALITY** in `backend/src/mm/architecture/mm-guardrails.spec.ts` scans `quality/` and `receiving/` for direct balance/ledger writes.
