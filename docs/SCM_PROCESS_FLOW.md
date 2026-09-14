# SCM End-to-End Process Flow — UI mapping

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

| Flow box | UI / API | Notes |
| --- | --- | --- |
| **3.1** Order Pooling & Consolidation | Shipments (READY filter) → multi-select → **Load plan** drawer | READY = MM packed release |
| **3.2** Volume & Weight → **qty MVP** | `VehicleCapacityMonitor` + `computeCapacity` / server `assign-load` | Item quantity only |
| **3.3** Route Planning & Sequence | Review step stop list; Up/Down deliver order; `stopOrder` on assign | Manual L0; no VRP |
| **3.4** Time Windows | Shipment create windows → stop `windowStart`/`windowEnd`; soft warn if missing | Hard optimization N/A |
| **3.5** Plan Review & Approval | Review manifest → **Save draft** (Trip `DRAFT`) / **Approve plan** (Trip `PLANNED`) | Shipments → `ASSIGNED` |

```text
READY → Load plan → DRAFT (draft) or PLANNED (approved)
PLANNED → Dispatch → ASSIGNED → Start (GI) → IN_TRANSIT
```

## Broader EXECUTE mapping

| UI action | Phase | Core submodule |
| --- | --- | --- |
| MM Ready for Dispatch (auto shipment) | **2.3** | Warehouse Interface & Order Release |
| Manual warehouse release (fallback) | **2.3** | Admin create READY |
| Load plan / Approve | **3.1–3.5** | Transportation Planning |
| Dispatch | **3.2** Fleet assignment | Fleet & Dispatch Management |
| Start trip + Tracking | **3.3** | In-Transit Monitoring (+ GI) |
| Demand planning page | **1** stub | Demand & Supply Planning |

## SCM module hub (`/modules/scm`)

Aligned to PDF pillars. Hub tiles:

| Tile | Role |
| --- | --- |
| Demand Planning | Pillar 1 stub |
| Planning Horizons | Saved config: horizon weeks, bucket (DAY/WEEK), frozen-zone days (`GET/PUT /scm/planning-settings`) |
| Transportation Management | Pillars 2–4 (`/scm` logistics spine) |
| Supply Chain Dashboard | Ops KPIs from shipments/trips/fleet/maintenance (`GET /scm/dashboard/summary`) — OTIF deferred |

Removed from hub: Supply Network, Product Locations, Warehouse Operations (MM territory / filler).

## Not in this pass

- Inter-warehouse STO (GI + destination GR)
- Multi-line `ShipmentLine` model
- Weight/volume as primary capacity rules
- Full VRP / traffic / HOS
- Demand planning MM↔SCM forecast sync

## Vehicle GPS (flespi + optional Traccar)

**Active:** flespi `concox` channel → Nest MQTT (`mqtt.flespi.io`) → `GpsLog` → Live Tracking.  
Ident = **first 14 digits of IMEI** → `Vehicle.telematicsDeviceId`. See **`docs/SCM_FLESPI_VL502.md`**.

**Optional later:** Huabao **:5015** → Traccar → Nest ingest — **`docs/SCM_TRACCAR_VL502.md`**.
