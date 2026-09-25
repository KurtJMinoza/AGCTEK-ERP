---
name: integration
description: >-
  Cross-module ERP integration. Use for MM events, outbox/inbox, SD/PP/FICO consumers,
  idempotency, and boundaries between modules.
---

# Integration — Agent Skill

**Contract:** [AGENTS.md](../../../AGENTS.md) · **Master flow:** [docs/MASTER_ENTERPRISE_SYSTEM_FLOW.md](../../../docs/MASTER_ENTERPRISE_SYSTEM_FLOW.md) · **MM events:** [materials-management/SKILL.md](../materials-management/SKILL.md)

## Invariant

Modules do **not** directly write another module’s tables.

Prefer:

```text
Domain transaction → Outbox → Typed event → Consumer → Consumer-owned transaction
```

Module roles (CRM / SD / MM / SCM / FICO) and event examples: [MASTER_ENTERPRISE_SYSTEM_FLOW.md](../../../docs/MASTER_ENTERPRISE_SYSTEM_FLOW.md) §§26–31.

## MM integration targets

SD, Production, FICO, Maintenance, Analytics, Notifications — via documented contracts.

## Authoritative docs

- [docs/MM_INTEGRATION_CONTRACTS.md](../../../docs/MM_INTEGRATION_CONTRACTS.md)
- [docs/MM_INTEGRATION_RULES.md](../../../docs/MM_INTEGRATION_RULES.md)

## Backend (inspect before changing)

- `backend/src/mm/common/` — events, idempotency
- Prisma: `MmDomainEventOutbox`, `MmEventConsumerReceipt`, `MmAccountingEvent`
- Module-specific `*integration*` folders under `backend/src/`

## Requirements

Idempotency keys, correlation IDs, retry-safe consumers, clear event payloads. Never duplicate a second outbox for the same boundary.
