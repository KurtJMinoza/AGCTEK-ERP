# SCM End-to-End Process Flow — UI mapping

Authoritative logistics phases: PLAN → PREPARE → EXECUTE → CONFIRM → CLOSE.

## Step 3 — Load Building & Route Optimization (this pass)

| Flow box | UI / API | Notes |
| --- | --- | --- |
| **3.1** Order Pooling & Consolidation | Shipments (READY filter) → multi-select → **Load plan** drawer | READY = MM packed stub |
| **3.2** Volume & Weight → **qty MVP** | `VehicleCapacityMonitor` + `computeCapacity` / server `assign-load` | Item quantity only |
| **3.3** Route Planning & Sequence | Review step stop list; Up/Down deliver order; `stopOrder` on assign | Manual L0; no VRP |
| **3.4** Time Windows | Shipment create windows → stop `windowStart`/`windowEnd`; soft warn if missing | Hard optimization N/A |
| **3.5** Plan Review & Approval | Review manifest → **Save draft** (Trip `DRAFT`) / **Approve plan** (Trip `PLANNED`) | Shipments → `ASSIGNED` |

```text
READY → Load plan → DRAFT (draft) or PLANNED (approved)
PLANNED → Dispatch → ASSIGNED → Start → IN_TRANSIT
```

## Broader EXECUTE mapping

| UI action | Phase | Core submodule |
| --- | --- | --- |
| Warehouse release (create READY) | **2.3** | Warehouse Interface & Order Release |
| Load plan / Approve | **3.1–3.5** | Transportation Planning |
| Dispatch | **3.2** Fleet assignment | Fleet & Dispatch Management |
| Start trip + Tracking | **3.3** | In-Transit Monitoring |
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

- Real MM packed-order API
- Weight/volume as primary capacity rules
- Full VRP / traffic / HOS
- Driver mobile POD / FICO closure

## Vehicle GPS (flespi + optional Traccar)

**Active (local VL502 test):** flespi `concox` channel → Nest MQTT (`mqtt.flespi.io`) → `GpsLog` → Live Tracking.  
Ident = **first 14 digits of IMEI** → `Vehicle.telematicsDeviceId`. See **`docs/SCM_FLESPI_VL502.md`**.

**Optional later:** Huabao **:5015** → Traccar → Nest ingest — **`docs/SCM_TRACCAR_VL502.md`**.
