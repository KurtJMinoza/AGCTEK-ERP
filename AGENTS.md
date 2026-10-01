# ERP Engineering Agent Contract

You are working on an **existing enterprise ERP** (AGCTEK). This file is the **permanent operating contract**: how to inspect, decide, implement, validate, and avoid duplicating what already exists.

**Act as:** Senior Software Architect, Backend Engineer, Frontend Engineer, Database Architect, QA Engineer, Security Engineer, and domain-aware ERP Engineer.

**Primary goals:** Accuracy · Reuse · Validation · Minimal unnecessary changes · Architectural consistency · No redundant implementations · Production-safe behavior.

---

## Master enterprise architecture (read first)

**Canonical business-system contract:** [`docs/MASTER_ENTERPRISE_SYSTEM_FLOW.md`](docs/MASTER_ENTERPRISE_SYSTEM_FLOW.md)

**Primary E2E acceptance scenario:** [`docs/MASTER_E2E_SALES_ORDER_SCENARIO.md`](docs/MASTER_E2E_SALES_ORDER_SCENARIO.md) — validate cross-module work against §32 post-conditions.

That document defines module ownership (CRM · SD · MM · SCM · FICO · PP), end-to-end flows (O2C, P2P, MRP, QI, warehouse, MM→SCM, GI→FICO), forbidden overlaps, and the enterprise principles:

```text
CRM = CUSTOMER RELATIONSHIP · SD = COMMERCIAL ORDER · MM = MATERIAL + INVENTORY
SCM = PHYSICAL MOVEMENT · FICO = FINANCIAL EFFECT

ONE inventory posting engine · ONE ATP authority · ONE MRP engine
ONE event/outbox contract · ONE owner per business concept · NO duplicate logic
```

All Skills, `MM_*` / `SCM_*` docs, API design, and implementation phases **must follow** that contract. This file (`AGENTS.md`) remains **how** to change the repo safely.

---

## Context hierarchy

```text
docs/MASTER_ENTERPRISE_SYSTEM_FLOW.md  = WHAT the ERP is (flows + ownership)
AGENTS.md (this file)                  = HOW the agent works (stable, project-wide)
backend/AGENTS.md                      = NestJS / Prisma / API conventions
src/AGENTS.md                          = Next.js / ECME UI conventions
.cursor/rules/*.mdc                    = Scoped Cursor rules (UI, modules, MM gate)
.cursor/skills/*/SKILL.md              = WHAT each domain knows (load when relevant)
docs/MM_* · docs/SCM_* · …             = Domain depth (must not contradict master flow)
```

```text
        docs/MASTER_ENTERPRISE_SYSTEM_FLOW.md
                       │
                    AGENTS.md
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   backend/AGENTS   src/AGENTS    .cursor/rules
        │              │                │
        └──────────────┼────────────────┘
                       ▼
                    SKILLS (MM, Quality, MRP, Integration, …)
                       ▼
                    DOMAIN DOCS + REPOSITORY
```

**Do not** paste entire domain architectures into this file. Use the master flow doc, Skills, and `docs/` for depth.

### Mandatory workflow loop

```text
SEARCH → UNDERSTAND → CHECK FOR EXISTING → IDENTIFY OWNER
  → PLAN MINIMAL CHANGE → IMPLEMENT → TEST → TYPECHECK → LINT → BUILD
  → SEARCH FOR DUPLICATES / REGRESSIONS → REPORT
```

For large work: **Plan first**, review approach, then implement in phases (validate each phase).

---

## 1. Existing system first

This is **not** greenfield.

Before creating or changing anything:

1. Inspect the existing implementation.
2. Search for equivalent functionality.
3. Identify the current **owner** of the behavior.
4. Identify reusable services, components, APIs, models, routes, tests.
5. Check relevant architecture documentation.
6. Only then propose implementation.

Never assume a feature is missing because it is not visible in one file.

Search before adding: service, controller, model, schema, route, component, hook, utility, event, permission, workflow, validation, database table.

**Canonical patterns:** inspect `docs/CANONICAL_PATTERNS.md` and follow referenced implementations before inventing new patterns.

---

## 2. No redundant implementation

**Default:** IF IT ALREADY EXISTS → **ENHANCE IT**.

Do **not** create a second implementation for the same responsibility (service, table, API, business rule, calculation, workflow, audit, event bus, inventory engine, document flow, frontend widget).

Before adding anything, answer:

- Does equivalent functionality already exist?
- Who owns it?
- Can it be extended or reused?
- Why is a new implementation necessary?

If existing code is wrong, **fix it**—do not silently build a parallel replacement.

### Single-engine rule (MM and platform)

Prefer **one** authoritative engine per concern:

- Inventory posting → `InventoryPostingService` + immutable ledger
- ATP → `InventoryAvailabilityService`
- Reservations / allocations → reservation services (not direct qty mutation)
- Workflow → existing workflow services
- Organization scope → org / MM scope services
- Audit → existing audit infrastructure
- Events → domain event / outbox infrastructure
- Accounting GL → FICO
- MRP calculations → planning / MRP domain (read-only on stock)
- Valuation → valuation engine / services

---

## 3. Single source of truth

| Concept | Authoritative owner |
| --- | --- |
| Physical stock changes | `InventoryPostingService` → `MmInventoryTransaction` |
| Operational on-hand | `MmInventoryBalance` (derived) |
| Availability | `InventoryAvailabilityService` |
| Material identity | Material Master (MM-01) |
| Supplier identity | Supplier Master (MM-02) |
| Warehouse topology | Warehouse Master (MM-03) |
| Planning output | MRP / planning (MM-05)—**never** posts inventory |

---

## 4. Materials Management invariants

```text
Business Operation
  → Domain Service
  → InventoryPostingService
  → MmInventoryTransaction (immutable)
  → MmInventoryBalance
  → Valuation (when cost-relevant)
  → Audit / Domain Events
  → MmAccountingEvent (FICO bridge)
```

**Never bypass** `InventoryPostingService` for physical stock changes.

Never update inventory quantity from: controller, React, scanner, MRP, procurement, quality, warehouse task handlers, returns—or by writing balances directly.

Reservations/allocations do **not** reduce physical on-hand. Goods Issue performs outbound reduction. Posted transactions are immutable; corrections use **reversals**.

**MM skill (required for MM work):** `.cursor/skills/materials-management/SKILL.md`  
**Gate rule:** `.cursor/rules/mm-architecture.mdc`

---

## 5. Domain ownership (MM-01 … MM-15)

Respect boundaries: Material Master, Supplier, Warehouse, Valuation, Planning/MRP, Procurement, Receiving/Quality, **Inventory Core**, Warehouse Execution, Inventory Control, Returns/Disposal, Barcode/Mobile, Supplier Performance, Analytics, Dashboard.

Do not move ownership without architectural justification. See `docs/MM_DEPENDENCY_MAP.md`.

---

## 6. MRP rules (summary)

MRP is **planning only**. May read inventory, availability, demand, supply; may recommend PRs/planned orders. Must **never** post inventory or mutate ledger/balances. Recommendations must be **explainable**.

**Detail:** `.cursor/skills/mrp/SKILL.md`, `docs/MM_MRP_ARCHITECTURE.md`

---

## 7. Quality rules (summary)

Quality decides whether stock may be used; inventory owns quantity and movement. Quality must **not** directly modify balances. Flow: Receiving → GR → Inspection Lot → Decision → status/movement via `InventoryPostingService`.

**Detail:** `.cursor/skills/quality/SKILL.md`, `docs/MM_QUALITY_ARCHITECTURE.md`

---

## 8. Cross-module integration

Do not directly modify another module’s tables. Prefer: domain transaction → outbox → typed event → consumer → consumer-owned transaction.

**Master ownership & event catalog:** `docs/MASTER_ENTERPRISE_SYSTEM_FLOW.md`  
**Detail:** `.cursor/skills/integration/SKILL.md`, `docs/MM_INTEGRATION_CONTRACTS.md`

---

## 9. Database rules

Before schema changes: search models, relations, migrations, naming, indexes, uniqueness. Prefer **extending** models over overlapping new ones. Consider FKs, org scope, audit, lifecycle/status. Never ship a migration without verifying full DB impact.

**Scoped rule:** `.cursor/rules/database.mdc`

---

## 10. API rules

MM API root: `/api/v1/mm` (global prefix in `backend/src/main.ts`).

Before new endpoints: search existing routes, controllers, frontend services. One **canonical** API per responsibility—avoid duplicate list/search/foo variants. Validate auth, authorization, org scope, DTOs, state transitions, idempotency, audit, events.

**Scoped rule:** `.cursor/rules/api.mdc`

---

## 11. Frontend rules

Frontend is **not** the business authority. Display state, collect input, call APIs—do not authoritatively compute inventory, ATP, valuation, MRP, supplier scores, or accounting in React.

**Detail:** `src/AGENTS.md`, `.cursor/rules/erp-ui.mdc`, `.cursor/rules/erp-modules.mdc`

---

## 12. Implementation workflow

| Phase | Action |
| --- | --- |
| **A — Discover** | Search repo; files, deps, callers, tests, docs, models |
| **B — Plan** | Current vs desired; gap; minimal change; migration/API/test impact |
| **C — Implement** | Smallest complete change; no unrelated refactors |
| **D — Validate** | Targeted tests → typecheck → lint → integration/build as applicable |
| **E — Review** | Duplicates, dead code, bypassed architecture, missing auth/scope/audit |
| **F — Report** | Files changed, behavior, schema, APIs, tests run, risks |

---

## 13. Validation requirement

A task is **not** complete because code was generated. Complete only when architecture is respected, applicable validation **ran**, and duplicates were checked.

If validation could not run, state exactly what was **not** validated. **Never claim tests passed without running them.**

**Scoped rule:** `.cursor/rules/testing.mdc`

---

## 14. Change safety

Prefer small, localized, backward-compatible, reversible changes. Avoid unnecessary rewrites and API churn. Large work → phased delivery with validation between phases.

---

## 15–20. Operations discipline

- **Errors:** Deterministic, readable validation; distinguish auth, scope, not found, conflict, concurrency, integration failures.
- **State machines:** Valid transitions only; no arbitrary status jumps (e.g. POSTED → DRAFT) without documented reversal flows.
- **Idempotency:** Posting, GR/GI, scanner, mobile, integrations, transfers, adjustments—retries must not duplicate effects.
- **Concurrency:** Protect inventory, reservations, allocations, posting, counts, approvals—enforce in domain/DB, not only UI.
- **Performance:** Fix measured problems (N+1, repeated fetches); use pagination, indexes, lazy refs—no caches that lie about business state.
- **Security:** Server-side authz and org scope; never rely on hidden UI alone.

---

## 21. Documentation is authoritative

For MM and cross-cutting work, read relevant `docs/MM_*.md` and Skills **before** implementing. If code and docs disagree: detect, determine actual behavior, do not assume—update docs when behavior intentionally changes.

Examples: `MM_ARCHITECTURE.md`, `MM_TRANSACTION_RULES.md`, `MM_FORBIDDEN_PATTERNS.md`, `MM_QUALITY_ARCHITECTURE.md`, `MM_MRP_ARCHITECTURE.md`, `MM_INTEGRATION_CONTRACTS.md`.

---

## 22. Canonical code

When a pattern exists elsewhere in the repo, **follow it** (controller, service, DTO, list page, form, audit, events). See `docs/CANONICAL_PATTERNS.md`.

---

## 23. No unnecessary repetition

Reuse established findings from earlier search in the same task. Do not re-scan unrelated areas or regenerate duplicate analysis blocks.

---

## 24. When uncertain

Do not invent. Search repo, docs, tests, callers, schema. State remaining uncertainty with evidence.

---

## 25. Definition of done (checklist)

Before reporting completion, verify applicable items:

- [ ] Existing functionality inspected; reuse where possible
- [ ] No duplicate domain/service/API introduced; correct module ownership
- [ ] DB migration validated (if any)
- [ ] Authorization and organization scope validated
- [ ] Workflow/status transitions and idempotency (where applicable)
- [ ] Audit/events (where applicable)
- [ ] Tests added/updated; **typecheck, lint, relevant tests actually run**
- [ ] Build when appropriate; related flows checked
- [ ] Docs updated if architecture changed

---

## Nested agent instructions

| Path | Scope |
| --- | --- |
| [backend/AGENTS.md](backend/AGENTS.md) | NestJS, Prisma, MM backend, tests |
| [src/AGENTS.md](src/AGENTS.md) | Next.js, ECME UI, module pages |
| [.cursor/skills/materials-management/SKILL.md](.cursor/skills/materials-management/SKILL.md) | Full MM contract |
| [.cursor/skills/quality/SKILL.md](.cursor/skills/quality/SKILL.md) | Quality / inspection |
| [.cursor/skills/mrp/SKILL.md](.cursor/skills/mrp/SKILL.md) | Planning / MRP |
| [.cursor/skills/integration/SKILL.md](.cursor/skills/integration/SKILL.md) | Cross-module events |

**UI catalog:** `docs/COMPONENT_CATALOG.md`
