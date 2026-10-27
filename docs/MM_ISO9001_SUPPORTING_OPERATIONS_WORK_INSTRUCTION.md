# MM ISO 9001 — Supporting Operations & Technology Work Instruction

Operational controls and evidence for barcode/RFID, mobile warehouse execution, controlled documents, audit trail, and compliance monitoring. **Does not constitute ISO 9001 certification.**

## Architecture (mandatory)

| Rule | Owner |
| --- | --- |
| Physical inventory changes | `InventoryPostingService` only |
| Scan / RFID read | Validate → domain service → posting when required |
| Scan events | Append-only `MmScannerEvent` |
| Controlled document versions | Immutable; effective version not overwritten |
| Reports / dashboards | Official MM tables and engines — no shadow stock |
| Approvals | Server-side (`MmApprovalWorkflow`, scan overrides, document approve) |
| Compliance audit | Append-only `MmComplianceAuditEntry` |

## Barcode registry

- API: `GET/POST /api/v1/mm/supporting-ops/barcode-registry`
- Company-scoped uniqueness; `ACTIVE` vs `ARCHIVED`; packaging quantity on registry row
- Resolve path rejects archived / out-of-effect barcodes

## RFID

- API: `GET /api/v1/mm/supporting-ops/rfid-tags`, `POST .../assign`, `POST .../read`
- Reads deduplicated; **reads do not post inventory**

## Scan sessions & overrides

- `POST /api/v1/mm/supporting-ops/scan-sessions/start|complete`
- `POST /api/v1/mm/supporting-ops/scan-overrides` + supervisor `decide`
- Overrides tracked in Exception Center

## Mobile execution (existing + putaway)

- `POST /api/v1/mm/mobile/{receiving|putaway|picking|counting}/scan`
- Device registry: `GET/POST /api/v1/mm/supporting-ops/warehouse-devices`
- Revoked devices cannot authorize scans

## Controlled documents

- `POST /api/v1/mm/supporting-ops/controlled-documents`
- Version upload (base64 payload) → checksum stored; approve makes one **EFFECTIVE** revision
- Author cannot self-approve when separation applies

## Audit trail

- `GET /api/v1/mm/supporting-ops/compliance-audit?companyId=`

## UI (ECME)

| Screen | Route |
| --- | --- |
| Barcode Registry | `/modules/mm/barcode-rfid/barcode-registry` |
| RFID Tags | `/modules/mm/barcode-rfid/rfid-tags` |
| Mobile Receiving / Putaway / Picking / Packing / Counting | `/modules/mm/barcode-rfid/mobile-*` |
| Warehouse Devices | `/modules/mm/barcode-rfid/warehouse-devices` |
| Document Management | `/modules/mm/supporting-operations/document-management` |
| Audit Trail | `/modules/mm/supporting-operations/audit-trail` |
| Compliance Dashboard | `/modules/mm/supporting-operations/compliance-dashboard` |

Compliance KPI API: `GET /api/v1/mm/supporting-ops/compliance-dashboard/summary?companyId=`

Workflow admin reuses `/api/v1/mm/workflows` (procurement); extend definitions as needed.

Exception Center domain: `supporting_ops` (scan overrides, controlled document review/expiry).

## Reports

Existing `GET /api/v1/mm/reports/*` and dashboard KPIs query ledger, balances, and valuation engine — no duplicate analytics stock table.
