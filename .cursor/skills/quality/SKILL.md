---
name: quality
description: >-
  Materials Management quality / inspection domain. Use for receiving inspection lots,
  sampling, results, defects, NC, usage decisions, holds, and quality→inventory handoff.
---

# Quality (MM-07) — Agent Skill

**Contract:** [AGENTS.md](../../../AGENTS.md) · **Master flow:** [docs/MASTER_ENTERPRISE_SYSTEM_FLOW.md](../../../docs/MASTER_ENTERPRISE_SYSTEM_FLOW.md) · **MM master skill:** [materials-management/SKILL.md](../materials-management/SKILL.md)

## Ownership

Quality decides **whether** stock may be used. Inventory owns **quantity**, **movement**, and **ledger**.

Quality must **not** directly update `MmInventoryBalance` or bypass `InventoryPostingService`.

## Flow

```text
Receiving → Goods Receipt → Inspection Lot → Inspection / Results
  → Quality Decision → stock status / movement via InventoryPostingService
```

## Authoritative docs

- [docs/MM_QUALITY_ARCHITECTURE.md](../../../docs/MM_QUALITY_ARCHITECTURE.md)
- [docs/MM_QUALITY_RULES.md](../../../docs/MM_QUALITY_RULES.md)
- [docs/MM_FORBIDDEN_PATTERNS.md](../../../docs/MM_FORBIDDEN_PATTERNS.md)

## Backend (inspect before changing)

- `backend/src/mm/receiving/`
- `backend/src/mm/inbound/`
- Prisma: `MmInspectionLot`, `MmQualityDecision`, `MmQualityHold`, related models

## Before implementing

Search existing inspection lot services, decision handlers, and posting callbacks. Extend—do not duplicate a second quality posting path.
