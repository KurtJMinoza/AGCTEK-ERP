# SCM End-to-End Process Flow — UI mapping

**Enterprise parent:** [`MASTER_ENTERPRISE_SYSTEM_FLOW.md`](./MASTER_ENTERPRISE_SYSTEM_FLOW.md) §§12–17 (MM→SCM handoff, logistics, GI, SD/CRM status).

Authoritative logistics phases: PLAN → PREPARE → EXECUTE → CONFIRM → CLOSE.

## MM → SCM outbound handoff (customer delivery)

```text
MM Pack → Ready for Dispatch (requires ship-to address)
  → auto-create SCM Shipment READY (packageId link)
Load plan → Trip DRAFT/PLANNED → Dispatch ASSIGNED
Trip start → MM Goods Issue (posted) + package DISPATCHED
  → Trip IN_TRANSIT
POD / deliver → Shipment DELIVERED (no GR for customer outbound)
```

| Step | Owner | Mechanism |
| --- | --- | --- |
| Package `READY_FOR_DISPATCH` | MM | `PackingService.markReadyForDispatch` |
| Create READY shipment | SCM | `ShipmentsService.createFromPackage` (idempotent) |
| GI on trip start | MM via SCM | `GoodsIssueService.issueAndPostFromPackage` |
| POD close | SCM | Existing deliver / POD (no goods receipt) |

Retry: `POST /mm/packages/:id/retry-scm-release` if package is READY but shipment create failed.

## Step 3 — Load Building & Route Optimization

Cargo-first since 2026-10 — full contract in [`SCM_TMS_CARGO_FIRST.md`](SCM_TMS_CARGO_FIRST.md).

| Flow box | UI / API | Notes |
| --- | --- | --- |
| **3.1** Order Pooling & Consolidation | **Load Building** (`/scm/load-building`) — available lines of READY shipments | READY = MM packed release; one `ShipmentLine` per package item |
| **3.2** Volume & Weight → **qty MVP** | `POST /scm/tms/load-plans/:id/lines` — server capacity check | Qty primary; weight/volume when vehicle limit > 0 |
| **3.3** Route Planning & Sequence | **Trip Planning** (`/scm/trip-planning`) — stops generated from cargo; reorder TO stops | Manual L0; no VRP |
| **3.4** Time Windows | Shipment windows → TO stop `windowStart`/`windowEnd`; TO baseline sorted by earliest window | Hard optimization N/A |
| **3.5** Plan Review & Approval | Trip **Validate** (`READY`) → **Dispatch** (`DISPATCHED`) | Driver app starts DISPATCHED trips |

```text
Load plan: DRAFT → VALIDATED → READY → (trip) ASSIGNED → DISPATCHED → COMPLETED
Trip:      PLANNED → READY → DISPATCHED → Start (GI) → IN_TRANSIT → COMPLETED
```

Deprecated (API kept, removed from UI): `POST /scm/trips/assign-load`, `POST /scm/trips` with shipment stops.

## Broader EXECUTE mapping

| UI action | Phase | Core submodule |
| --- | --- | --- |
| MM Ready for Dispatch (auto shipment) | **2.3** | Warehouse Interface & Order Release |
| Manual warehouse release (fallback) | **2.3** | Admin create READY |
| Load plan / Approve | **3.1–3.5** | Transportation Planning |
| Dispatch | **3.2** Fleet assignment | Fleet & Dispatch Management |
| Start trip + Tracking | **3.3** | In-Transit Monitoring (+ GI) |
| Demand Plan (versioned, horizon = scope) | **1** | Demand & Supply Planning — see [`SCM_DEMAND_PLAN.md`](SCM_DEMAND_PLAN.md) |

## SCM module hub (`/modules/scm`)

Aligned to PDF pillars. Hub tiles:

| Tile | Role |
| --- | --- |
| Demand Plan | Pillar 1: versioned demand plan (DRAFT → REVIEWED → APPROVED → PUBLISHED). Horizon (Operational / Tactical / Strategic) is a control on the plan, not a separate tile. API `/scm/demand/*` — see [`SCM_DEMAND_PLAN.md`](SCM_DEMAND_PLAN.md) |
| Transportation Management | Pillars 2–4 (`/scm` logistics spine) |
| Supply Chain Dashboard | Ops KPIs from shipments/trips/fleet/maintenance (`GET /scm/dashboard/summary`) — OTIF deferred |

Removed from hub: Supply Network, Product Locations, Warehouse Operations (MM territory / filler).

## Not in this pass

- Inter-warehouse STO (GI + destination GR)
- Multi-line `ShipmentLine` model
- Weight/volume as primary capacity rules
- Full VRP / traffic / HOS
- Demand planning MM↔SCM forecast sync

## Vehicle GPS (flespi)

**Active:** flespi `concox` channel → Nest MQTT (`mqtt.flespi.io`) → `GpsLog` → Live Tracking.  
Ident = **first 14 digits of IMEI** → `Vehicle.telematicsDeviceId`. See **`docs/SCM_FLESPI_VL502.md`**.
