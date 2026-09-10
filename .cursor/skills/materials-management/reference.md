# Materials Management (MM) — Full Architectural Contract

This file is the complete MM engineering contract. The agent should follow
[SKILL.md](SKILL.md) first, then read this reference for detailed rules.

---

# Materials Management (MM) — ERP Engineering Skill

## PURPOSE

You are the Materials Management (MM) engineering specialist for this ERP.

Your responsibility is to design, implement, modify, debug, and review all MM functionality while preserving the established enterprise ERP architecture.

MM is responsible for the complete material lifecycle:

Demand
→ Planning
→ Procurement
→ Receiving
→ Inventory
→ Warehouse
→ Reservation
→ Picking
→ Packing
→ Goods Issue
→ Valuation
→ Returns / Disposal
→ Replenishment

MM must operate as an integrated ERP domain and must not be implemented as disconnected CRUD functionality.

---

# 1. MM MODULE ARCHITECTURE

The established MM structure is:

Materials Management
│
├── Material Master
│   ├── Materials / SKUs
│   ├── Material Types
│   ├── Material Categories
│   ├── Units of Measure
│   ├── UOM Conversions
│   ├── Barcodes
│   ├── Batches
│   └── Serial Numbers
│
├── Supplier Management
│   ├── Supplier Master
│   ├── Supplier Categories
│   ├── Supplier Materials
│   ├── Supplier Pricing
│   ├── Payment Terms
│   ├── Supplier Documents
│   ├── Supplier Evaluation
│   └── Supplier Performance
│
├── Planning / MRP
│   ├── Demand
│   ├── MRP Runs
│   ├── Material Requirements
│   ├── Reorder Point
│   ├── Safety Stock
│   ├── Shortage Monitor
│   └── Procurement Suggestions
│
├── Procurement
│   ├── Purchase Requisitions
│   ├── RFQs
│   ├── Supplier Quotations
│   ├── Quotation Comparison
│   ├── Purchase Orders
│   ├── PO Approvals
│   ├── Purchase Contracts
│   └── Procurement History
│
├── Receiving
│   ├── Expected Receipts
│   ├── Advanced Shipping Notices
│   ├── Receiving
│   ├── Receiving Inspection
│   ├── Receiving Variances
│   └── Quality / Quarantine
│
├── Inventory Management
│   ├── Goods Receipt
│   ├── Stock Overview
│   ├── Available Stock
│   ├── Reservations
│   ├── Stock Movements
│   ├── Goods Issue
│   ├── Stock Transfers
│   ├── Inventory Adjustments
│   ├── Inventory Status
│   └── Inventory Ledger
│
├── Warehouse Management
│   ├── Overview
│   ├── Warehouses
│   ├── Storage Types
│   ├── Storage Sections
│   ├── Storage Bins
│   ├── Bin Capacity
│   ├── Putaway
│   ├── Picking
│   ├── Packing
│   └── Warehouse Transfers
│
├── Inventory Control
│   ├── Cycle Counting
│   ├── Physical Inventory
│   ├── Blind Counting
│   ├── Recounts
│   ├── Variance Analysis
│   └── Adjustment Approval
│
├── Valuation
│   ├── Inventory Valuation
│   ├── Valuation Methods
│   │   ├── Standard Cost
│   │   ├── Moving Average
│   │   └── FIFO
│   ├── Cost Layers
│   ├── Landed Cost
│   └── Price Variance
│
├── Returns & Disposal
│   ├── Supplier Returns
│   ├── Customer Return Intake
│   ├── Damaged Stock
│   ├── Expired Stock
│   ├── Scrap
│   └── Disposal
│
├── Barcode / RFID Operations
│   ├── Barcode Scanning
│   ├── Batch Scanning
│   ├── Serial Scanning
│   ├── Mobile Receiving
│   ├── Mobile Picking
│   └── Mobile Counting
│
└── MM Reports & Analytics
    ├── Stock Reports
    ├── Inventory Valuation
    ├── Stock Aging
    ├── Dead Stock
    ├── Inventory Turnover
    ├── Procurement Analytics
    ├── Supplier Performance
    ├── Warehouse Performance
    └── Stock Variance

---

# 2. FUNDAMENTAL MM OWNERSHIP

MM owns:

* material master
* supplier purchasing information
* procurement transactions
* physical inventory
* inventory availability
* reservations
* stock movements
* receiving
* warehouse execution
* inventory adjustments
* inventory status
* inventory valuation
* material returns
* material disposal
* replenishment planning

MM does NOT own:

* General Ledger
* Accounts Payable payment execution
* Accounts Receivable
* financial statements
* customer billing
* employee payroll
* fleet management
* customer CRM
* production costing outside MM material consumption/valuation responsibilities

MM integrates with those domains rather than duplicating them.

---

# 3. MM PROCESS MODEL

Always understand MM as business processes rather than independent pages.

## PROCUREMENT FLOW

Demand
→ Material Requirement
→ Purchase Requisition
→ Approval
→ RFQ
→ Supplier Quotation
→ Quotation Comparison
→ Supplier Selection
→ Purchase Order
→ Supplier

## INBOUND FLOW

Purchase Order / ASN
→ Expected Receipt
→ Receiving
→ Quantity Verification
→ Quality / Quarantine
→ Goods Receipt
→ Putaway
→ Available Inventory

## INVENTORY FLOW

Goods Receipt
→ Inventory Increase

Reservation
→ Available Quantity Decrease

Goods Issue
→ Inventory Decrease

Transfer
→ Source Decrease
→ In Transit
→ Destination Increase

Adjustment
→ Controlled Inventory Change

## OUTBOUND FLOW

Sales/Production/Maintenance Requirement
→ Availability Check
→ Reservation
→ Picking
→ Packing
→ Goods Issue
→ Inventory Decrease

## INVENTORY CONTROL FLOW

Inventory
→ Cycle Count
→ Blind Count
→ Variance
→ Recount
→ Approval
→ Adjustment
→ Inventory Ledger

## REPLENISHMENT FLOW

Demand
→ MRP
→ Net Requirement
→ Procurement Suggestion
→ Purchase Requisition
→ Procurement

---

# 4. THE INVENTORY LEDGER IS THE MM CORE

The inventory ledger is the authoritative historical record of physical inventory movements.

Never implement inventory as:

stock = editable quantity

Never directly change inventory quantity without creating a corresponding inventory transaction.

The correct architecture is:

Business Operation
→ Inventory Posting Service
→ Immutable Inventory Transaction
→ Inventory Balance
→ Audit Event
→ Domain Event
→ Accounting Event when financially relevant

---

# 5. INVENTORY TRANSACTION RULE

Every physical inventory change must create an inventory transaction.

Examples:

Goods Receipt
→ RECEIPT
→ positive quantity

Goods Issue
→ ISSUE
→ negative quantity

Transfer Out
→ TRANSFER_OUT
→ negative quantity

Transfer In
→ TRANSFER_IN
→ positive quantity

Adjustment Gain
→ ADJUSTMENT_IN
→ positive quantity

Adjustment Loss
→ ADJUSTMENT_OUT
→ negative quantity

Supplier Return
→ RETURN_OUT
→ negative quantity

Customer Return
→ RETURN_IN
→ positive quantity

Scrap
→ SCRAP
→ negative quantity

Count Gain
→ COUNT_GAIN
→ positive quantity

Count Loss
→ COUNT_LOSS
→ negative quantity

Movement types must be extensible.

---

# 6. IMMUTABILITY

Posted inventory transactions are immutable.

Never allow:

UPDATE posted_inventory_transaction

Never allow normal users to delete posted transactions.

Corrections use:

Original Transaction
→ Reversal Transaction

Example:

Original:
+100

Reversal:
-100

The original remains unchanged.

Every reversal must reference the original transaction.

---

# 7. INVENTORY BALANCE

The operational inventory balance is a projection/current-state representation.

Inventory must be identifiable by relevant dimensions:

* company
* plant
* warehouse
* storage bin
* material
* batch
* serial
* stock status

Do not maintain a single global material stock quantity.

Example:

MAT-001

WH-01 / BIN-A = 50
WH-01 / BIN-B = 20
WH-02 / BIN-C = 30

Total = 100

---

# 8. INVENTORY AVAILABILITY

Never confuse:

On Hand

with:

Available

Use a centralized availability service.

Conceptually:

## On Hand

## Unavailable/Restricted

# Reserved

Available

Quality Inspection and Blocked stock must not automatically become available inventory.

Reservation must NOT physically reduce on-hand stock.

Goods Issue DOES reduce on-hand stock.

---

# 9. RESERVATION RULE

Reservation is an allocation, not a physical movement.

Example:

Before:

On Hand = 100
Reserved = 0
Available = 100

After reservation of 20:

On Hand = 100
Reserved = 20
Available = 80

Do not create a physical inventory transaction merely for a reservation unless the business model explicitly requires a separate stock commitment ledger.

Reservation and physical inventory must remain conceptually distinct.

---

# 10. STOCK STATUS

At minimum support:

UNRESTRICTED
QUALITY_INSPECTION
BLOCKED

Architecture should allow:

QUARANTINE
IN_TRANSIT
EXPIRED
DAMAGED

Do not arbitrarily change status.

Status transitions must be validated.

Examples:

QUALITY_INSPECTION
→ UNRESTRICTED

QUALITY_INSPECTION
→ BLOCKED

BLOCKED
→ UNRESTRICTED

must be governed by business rules/permissions/workflow as appropriate.

---

# 11. MATERIAL MASTER RULES

Every MM transaction must reference the Material Master.

Do not create free-text material identity in transactional tables where a material master exists.

Use:

material_id

instead of duplicating:

material_name
sku
category

in every transaction as independent master values.

Store historical snapshots only when required for audit/commercial/legal purposes.

---

# 12. BATCH MANAGEMENT

If a material is batch-controlled:

* receiving requires batch
* transfer preserves batch
* issue identifies batch
* adjustment identifies batch
* ledger preserves batch
* returns preserve batch

Never mix batch-controlled inventory with anonymous inventory.

---

# 13. SERIAL MANAGEMENT

If a material is serialized:

Each unit must have a unique serial identity.

Example:

Laptop × 3

requires:

SN001
SN002
SN003

Serialized issue must identify the actual serials.

Do not allow serialized stock to be issued anonymously.

---

# 14. UOM MANAGEMENT

All transactions must use valid Units of Measure.

Material has:

Base UOM
Purchase UOM
Sales UOM

Example:

1 BOX = 12 PCS

If receiving:

10 BOX

Normalized inventory quantity:

120 PCS

Preserve original transaction UOM where required for audit.

---

# 15. WAREHOUSE LOCATION MODEL

Warehouse hierarchy:

Company
→ Plant
→ Warehouse
→ Storage Type
→ Storage Section
→ Storage Bin

Never store only a human-readable bin string as the primary relationship.

Use IDs/foreign keys.

Example:

warehouse_id
storage_type_id
storage_section_id
storage_bin_id

---

# 16. WAREHOUSE RESPONSIBILITY

Warehouse Management answers:

"Where is the material?"

and:

"How do warehouse workers physically move it?"

Inventory Management answers:

"How much material exists?"

Warehouse and Inventory must operate together but must not duplicate inventory state.

---

# 17. PUTAWAY

Putaway flow:

Receiving
→ Quality/Quarantine if applicable
→ Putaway Task
→ Bin Recommendation
→ Scan Destination
→ Confirm
→ Inventory Update

Putaway recommendation should consider:

* storage type
* capacity
* weight
* volume
* compatibility
* temperature
* hazardous rules
* existing stock
* warehouse rules
* configured strategy

A manual override should require authorization and a reason where configured.

---

# 18. PICKING

Picking flow:

Requirement
→ Reservation
→ Pick Task
→ Source Bin Recommendation
→ Scan Bin
→ Scan Material
→ Batch/Serial
→ Quantity
→ Confirm

Support configurable picking methods such as:

* FIFO
* FEFO
* nearest bin
* zone
* wave

Do not implement a picking algorithm inside the UI layer.

Picking logic belongs in a domain/service layer.

---

# 19. PACKING

Packing flow:

Picked Inventory
→ Packing Session
→ Scan Package
→ Scan Items
→ Compare Expected vs Actual
→ Package Confirmation
→ Shipping-ready state

If:

Expected = 10
Scanned = 9

packing must not complete unless an authorized exception process exists.

---

# 20. GOODS RECEIPT

Goods Receipt represents accepted physical receipt of material.

Typical flow:

PO
→ Receiving
→ Quantity Verification
→ Quality/Quarantine
→ Goods Receipt
→ Inventory Posting

A receipt must reference its source document where required.

Do not allow an ordinary receiving flow to create orphan inventory.

---

# 21. GOODS ISSUE

Goods Issue represents physical removal from inventory.

Possible sources:

* Sales
* Production
* Maintenance
* Internal Consumption
* Projects
* Scrap
* Disposal

Before posting:

* validate authorization
* validate warehouse scope
* validate stock
* validate reservation if required
* validate batch/serial
* validate stock status
* validate posting period where applicable

Then:

Goods Issue
→ Inventory Posting
→ Ledger
→ Balance
→ Accounting Event if applicable

---

# 22. TRANSFERS

Support:

## Bin-to-bin

Source bin
→ destination bin

## Warehouse-to-warehouse

Source warehouse
→ dispatch
→ in transit
→ destination receipt

Do not teleport stock between warehouses when the business requires an in-transit state.

A transfer should preserve material/batch/serial identity.

---

# 23. INVENTORY ADJUSTMENTS

Never directly edit stock quantities.

Use:

Adjustment Request
→ Reason
→ Validation
→ Approval
→ Inventory Posting

Reasons may include:

* damage
* loss
* shrinkage
* found stock
* count variance
* system error
* expiration

Large-value adjustments should be workflow-controlled.

---

# 24. INVENTORY CONTROL

Cycle counting should follow:

Count Generation
→ Blind Count
→ Variance Analysis
→ Recount if necessary
→ Approval
→ Adjustment
→ Inventory Ledger

Counter should not normally see the expected quantity during blind counting.

---

# 25. PROCUREMENT

Purchase Requisition is an internal request.

RFQ requests supplier pricing.

Supplier Quotation represents the supplier response.

Quotation Comparison evaluates responses.

Purchase Order represents the supplier commitment.

Do not confuse these documents.

Correct relationship:

PR
→ RFQ
→ Quotation
→ PO

One approved PR may be partially converted into multiple procurement documents.

Track requested vs converted quantities.

---

# 26. PURCHASE ORDER

PO should track:

* supplier
* company
* branch
* warehouse
* currency
* payment terms
* items
* quantities
* prices
* taxes
* delivery dates
* tolerances

PO status and fulfillment status should be separate where appropriate.

Example:

Document Status:
APPROVED

Fulfillment:
PARTIALLY_RECEIVED

Invoice:
PARTIALLY_MATCHED

---

# 27. 3-WAY MATCH

Supplier invoice matching uses:

Purchase Order
+
Goods Receipt
+
Supplier Invoice

Compare:

* supplier
* item
* quantity
* price
* tax
* currency

Use configurable tolerances.

Do not assume every difference must be exactly zero.

A mismatch may result in:

MATCHED
PARTIALLY_MATCHED
VARIANCE
BLOCKED

MM should identify the receiving basis.

FICO/AP owns payment processing.

---

# 28. MRP

MRP determines replenishment requirements.

Inputs may include:

* demand
* sales orders
* current inventory
* reservations
* open purchase orders
* safety stock
* reorder point
* lead time
* MOQ

Conceptually:

Demand
+
Required Safety Stock
---------------------

# Projected Available

Net Requirement

MRP should generate recommendations.

Do not automatically create final Purchase Orders unless business configuration explicitly requires it.

---

# 29. VALUATION

Physical quantity and monetary value are separate dimensions.

Support configured valuation methods such as:

* Standard Cost
* Moving Average
* FIFO

Valuation must be deterministic and auditable.

Do not overwrite historical inventory cost without a controlled valuation process.

---

# 30. COST LAYERS

Where FIFO is used, maintain cost layers.

Each layer should preserve:

* source receipt
* original quantity
* remaining quantity
* unit cost
* posting date

Issues consume eligible layers according to the valuation strategy.

Never destroy cost history.

---

# 31. LANDED COST

Landed cost may include:

* freight
* customs
* insurance
* handling

Allocation can be:

* quantity
* weight
* volume
* value
* manual

Capitalization vs expense treatment must be determined through accounting configuration rather than hardcoded MM logic.

---

# 32. MM → FICO

MM does not directly manipulate the General Ledger.

Correct architecture:

MM Transaction
→ Accounting Event
→ FICO Posting Engine
→ Accounting Document

Example:

Goods Receipt:

Dr Inventory
Cr GR/IR

Goods Issue:

Dr COGS / Expense
Cr Inventory

Inventory Loss:

Dr Inventory Loss
Cr Inventory

Exact account determination belongs to FICO/accounting configuration.

---

# 33. MM → SD

SD may request:

Availability
Reservation
Picking
Goods Issue

MM returns:

* on hand
* available
* reserved
* warehouse
* batch
* serial
* fulfillment information

SD must not maintain an independent inventory database.

---

# 34. MM → PRODUCTION

Production may request:

Material Requirement
Reservation
Picking
Goods Issue

Production may return:

Finished Goods Receipt

MM remains the inventory system of record.

---

# 35. MM → MAINTENANCE

Maintenance may request:

Material Requirement
Reservation
Warehouse Issue

MM records the physical inventory movement.

---

# 36. MM → SCM

Warehouse completes:

Picking
→ Packing
→ Ready for Dispatch

SCM handles:

Dispatch
→ Route
→ Vehicle
→ Delivery
→ Proof of Delivery

Do not duplicate logistics tracking inside MM.

---

# 37. DOCUMENT FLOW

Every transactional document should preserve relationships.

Example:

PR
→ RFQ
→ Supplier Quotation
→ PO
→ Goods Receipt
→ Quality Inspection
→ Putaway
→ Inventory Transaction
→ Supplier Invoice
→ Accounting Document

Outbound:

Sales Order
→ Delivery
→ Reservation
→ Picking
→ Packing
→ Goods Issue
→ Inventory Transaction
→ COGS

Transfer:

Transfer Request
→ Picking
→ Dispatch
→ In Transit
→ Receipt
→ Inventory Transaction

Users should be able to navigate this relationship from either direction.

---

# 38. STATUS DESIGN

Never rely on one generic status for complex transactions.

Use separate dimensions when appropriate:

Document Status
Approval Status
Fulfillment Status
Inventory Status
Accounting Status

Example:

PO:

Document:
APPROVED

Fulfillment:
PARTIALLY_RECEIVED

Invoice:
BLOCKED

Accounting:
POSTED

This is preferable to:

STATUS = PROCESSING

---

# 39. PERMISSIONS

MM permissions must be granular.

Examples:

MM.MATERIAL.READ
MM.MATERIAL.CREATE
MM.MATERIAL.UPDATE

MM.PURCHASE_REQUISITION.CREATE
MM.PURCHASE_REQUISITION.SUBMIT
MM.PURCHASE_REQUISITION.APPROVE

MM.PURCHASE_ORDER.CREATE
MM.PURCHASE_ORDER.APPROVE
MM.PURCHASE_ORDER.CANCEL

MM.GOODS_RECEIPT.CREATE
MM.GOODS_RECEIPT.POST
MM.GOODS_RECEIPT.REVERSE

MM.GOODS_ISSUE.CREATE
MM.GOODS_ISSUE.POST
MM.GOODS_ISSUE.REVERSE

MM.INVENTORY.READ
MM.INVENTORY.ADJUST
MM.INVENTORY.REVERSE

MM.LEDGER.READ
MM.LEDGER.REVERSE

Also enforce data scope:

company
plant
warehouse
department
cost center

Backend authorization is mandatory.

---

# 40. AUDIT

Every important MM event must be auditable.

Track:

* user
* timestamp
* action
* document
* old value
* new value
* reason
* source
* related transaction

Important actions:

CREATE
UPDATE
SUBMIT
APPROVE
REJECT
POST
REVERSE
RECEIVE
ISSUE
TRANSFER
ADJUST
COUNT
SCRAP

Never hide changes from the audit system.

---

# 41. IDEMPOTENCY

Inventory APIs must support idempotency.

This is especially important for:

* barcode scanners
* mobile devices
* network retries
* integrations

If the same request is sent twice using the same idempotency key:

Only one business transaction may be posted.

---

# 42. CONCURRENCY

Inventory is shared state.

Always protect against concurrent:

* issues
* reservations
* receipts
* adjustments
* transfers

Use PostgreSQL transactions and appropriate locking/atomic updates.

Example:

Available = 10

User A attempts issue 8.

User B attempts issue 8.

System must serialize the operations so stock cannot become invalid.

---

# 43. DATABASE DESIGN

Prefer domain-oriented tables.

Examples:

mm_material
mm_material_category
mm_material_type
mm_material_uom
mm_material_barcode
mm_material_batch
mm_material_serial

mm_supplier
mm_supplier_material
mm_supplier_price
mm_supplier_evaluation

mm_purchase_requisition
mm_purchase_requisition_line

mm_rfq
mm_rfq_line

mm_supplier_quotation
mm_supplier_quotation_line

mm_purchase_order
mm_purchase_order_line

mm_goods_receipt
mm_goods_receipt_line

mm_inventory_transaction
mm_inventory_balance
mm_inventory_reservation

mm_warehouse
mm_storage_type
mm_storage_section
mm_storage_bin

mm_putaway_task
mm_picking_task
mm_packing
mm_package

mm_stock_transfer
mm_inventory_adjustment

mm_cycle_count
mm_cycle_count_line

mm_mrp_run
mm_material_requirement

mm_inventory_valuation
mm_cost_layer
mm_landed_cost

mm_return
mm_disposal

Do not create duplicate inventory state in multiple tables.

---

# 44. SERVICE LAYER

Prefer domain services.

Examples:

MaterialService
SupplierService
ProcurementService
GoodsReceiptService
InventoryPostingService
InventoryBalanceService
InventoryAvailabilityService
ReservationService
StockTransferService
InventoryAdjustmentService
WarehouseService
PutawayService
PickingService
PackingService
ValuationService
MRPService
SupplierEvaluationService

The InventoryPostingService must be shared by inventory-changing operations.

---

# 45. CONTROLLER RULE

Controllers should remain thin.

Bad:

Controller
→ validate everything
→ calculate inventory
→ update stock
→ update ledger
→ create accounting
→ send notification

Preferred:

Controller
→ Authorization
→ Domain Service
→ Transaction
→ Events

Example:

POST /goods-receipts

→ GoodsReceiptService

→ InventoryPostingService

→ AuditService

→ AccountingEventService

→ Notification/Event Bus

---

# 46. UI RULES

MM UI should be enterprise operational software.

Use:

* searchable data tables
* server-side filtering
* pagination
* sorting
* status badges
* bulk actions when safe
* document detail pages
* document flow
* approval history
* attachments
* audit timeline
* related documents

Do not build isolated CRUD screens without relationships to the business process.

---

# 47. DASHBOARD RULE

MM should have a dashboard/overview.

It should show:

Inventory Value
Available Stock
Reserved Stock
Low Stock
Out of Stock
Blocked Stock
Quality Stock
Open POs
Pending PRs
Open Receiving
Putaway Tasks
Picking Tasks
Transfer Exceptions
Inventory Variances

Every dashboard metric should drill into the actual operational data.

Do not create fake/static dashboard values.

---

# 48. REPORTING RULE

Reports are read-only consumers of MM data.

Never allow report logic to modify inventory.

Reports should query:

* inventory balances
* inventory transactions
* procurement documents
* warehouse tasks
* valuation
* supplier metrics

Use optimized reporting queries/materialized summaries where necessary.

---

# 49. PERFORMANCE

MM can contain very large datasets.

Always:

* paginate
* index common filters
* avoid N+1 queries
* avoid loading entire ledgers
* use aggregate queries
* use inventory balance projections
* use optimized reporting structures
* use asynchronous processing for expensive jobs where appropriate

The Inventory Ledger may become one of the highest-volume tables in the ERP.

Design for growth.

---

# 50. MOBILE / BARCODE RULE

Barcode/RFID functionality is an execution channel.

Do not create separate inventory logic for:

Desktop Receiving
Mobile Receiving

Both must use the same domain service.

Example:

Mobile Scanner
→ Receiving Service
→ Inventory Posting Service

Mobile Picking
→ Picking Service
→ Inventory Posting Service

Mobile Counting
→ Cycle Count Service
→ Adjustment Service
→ Inventory Posting Service

---

# 51. ERROR HANDLING

Business errors must be explicit.

Examples:

INSUFFICIENT_STOCK
INVALID_BIN
INVALID_BATCH
SERIAL_REQUIRED
INVALID_SERIAL
MATERIAL_INACTIVE
WAREHOUSE_ACCESS_DENIED
NEGATIVE_STOCK_NOT_ALLOWED
DOCUMENT_ALREADY_POSTED
TRANSACTION_ALREADY_REVERSED
CLOSED_POSTING_PERIOD
DUPLICATE_IDEMPOTENCY_KEY

Do not return vague errors such as:

"Something went wrong."

---

# 52. TRANSACTION BOUNDARIES

Inventory posting must be atomic.

The system must not reach:

Ledger posted
but balance not updated

or:

Balance updated
but ledger missing

Use database transactions.

For external events use a reliable outbox/event mechanism where appropriate.

---

# 53. RECONCILIATION

Provide a controlled mechanism to compare:

Ledger-derived balance
vs
Operational inventory balance

If different:

create reconciliation exception.

Do not silently change the ledger to match the balance.

---

# 54. DO NOT DUPLICATE BUSINESS LOGIC

Do not implement separate:

* inventory calculations in SD
* stock calculations in Warehouse
* availability calculations in multiple modules
* valuation calculations in reports
* approval logic in Procurement
* numbering logic in MM
* notification logic in individual controllers

Use shared domain/services.

---

# 55. WHEN IMPLEMENTING ANY MM FEATURE

Always follow this process:

## Step 1 — Inspect

Inspect:

* existing repository
* current MM implementation
* database schema
* API architecture
* shared services
* authorization
* workflow
* audit
* UI components
* existing routes

## Step 2 — Determine Ownership

Identify:

* which MM domain owns this functionality
* source document
* target document
* inventory impact
* valuation impact
* accounting event
* audit requirement

## Step 3 — Determine Data Model

Identify:

* entities
* relationships
* constraints
* indexes
* status fields
* source references

## Step 4 — Implement Domain Logic

Keep business rules in services/domain layer.

## Step 5 — Implement API

Use existing API conventions.

## Step 6 — Implement UI

Use existing ERP design system.

## Step 7 — Authorization

Implement permissions and data scope.

## Step 8 — Audit

Record important actions.

## Step 9 — Events

Emit required domain/accounting events.

## Step 10 — Testing

Test both successful and failure scenarios.

---

# 56. BEFORE CHANGING EXISTING MM CODE

Do not immediately rewrite.

First identify:

* what already exists
* what is incomplete
* what can be reused
* what violates MM architecture
* whether the database already contains the required entities
* whether another MM module already performs the same function

Prefer incremental correction over unnecessary replacement.

---

# 57. DUPLICATION CHECK

Before creating a new page, endpoint, table, service, or transaction type, check whether the existing MM architecture already contains equivalent functionality.

For example:

Do not create a second Goods Receipt implementation.

Receiving may be the operational workspace.

Inventory Management owns the actual inventory posting.

Likewise:

Do not create a second Supplier Return transaction in Receiving if Returns & Disposal already owns supplier returns.

---

# 58. DOCUMENT OWNERSHIP RULE

The system must have one authoritative owner for each business transaction.

Examples:

Purchase Requisition
→ Procurement

Purchase Order
→ Procurement

Goods Receipt
→ Inventory/Receiving

Inventory Transaction
→ Inventory Management

Putaway Task
→ Warehouse Management

Picking Task
→ Warehouse Management

Packing
→ Warehouse Management

Inventory Adjustment
→ Inventory Management

Cycle Count
→ Inventory Control

Valuation
→ Valuation Engine

Supplier Return
→ Returns & Disposal

Do not create competing implementations of the same transaction.

---

# 59. MM DEVELOPMENT PRIORITY

When implementing the entire MM domain, prefer this sequence:

1. Material Master
2. Warehouse Topology
3. Inventory Ledger
4. Stock Overview
5. Available Stock
6. Reservations
7. Goods Receipt
8. Supplier Management
9. Purchase Requisition
10. RFQ
11. Supplier Quotation
12. Quotation Comparison
13. Purchase Order
14. Receiving / Inspection
15. Putaway
16. Picking
17. Packing
18. Goods Issue
19. Stock Transfers
20. Inventory Adjustments
21. Inventory Control
22. Valuation
23. Returns / Disposal
24. MRP
25. Supplier Evaluation
26. Barcode/RFID
27. Reports & Analytics

Do not skip the Inventory Ledger foundation.

---

# 60. DEFINITION OF DONE

An MM feature is not considered complete merely because its page exists.

A feature is complete only when applicable:

* database schema exists
* migration exists
* API exists
* domain logic exists
* validation exists
* permissions exist
* data scope exists
* workflow exists if required
* audit exists
* document numbering exists
* inventory impact works
* valuation impact works
* accounting event works
* domain events work
* UI works
* error handling works
* tests exist
* type checking passes
* lint passes
* relevant integration tests pass

Do not claim a feature is complete if only the frontend has been created.

---

# 61. WHEN ASKED TO IMPLEMENT A FEATURE

Before coding, answer internally:

1. What business process does this belong to?
2. Which MM module owns it?
3. What document starts it?
4. What document does it create?
5. Does physical inventory change?
6. Does availability change?
7. Does valuation change?
8. Does FICO need an accounting event?
9. Does workflow apply?
10. What audit records are required?
11. What existing service should be reused?
12. What other MM modules consume this data?

Then implement according to the established architecture.

---

# 62. FINAL MM PRINCIPLE

Always preserve this model:

```
              MATERIALS MANAGEMENT
                       │
      ┌────────────────┼────────────────┐
      ▼                ▼                ▼
  PLANNING        PROCUREMENT       WAREHOUSE
      │                │                │
      └────────────────┼────────────────┘
                       ▼
                  INVENTORY
                       │
             ┌─────────┼─────────┐
             ▼         ▼         ▼
         RECEIVING   RESERVE    ISSUE
             │         │         │
             └─────────┼─────────┘
                       ▼
               INVENTORY LEDGER
                       │
             ┌─────────┼─────────┐
             ▼         ▼         ▼
         BALANCE    VALUATION   AUDIT
                       │
                       ▼
                      FICO
```

The Inventory Ledger is the authoritative historical inventory movement record.

The Inventory Balance represents current operational stock.

The Warehouse represents physical location and execution.

Procurement represents acquisition.

Planning represents replenishment decisions.

Valuation represents monetary inventory value.

FICO represents financial accounting.

Keep these boundaries intact at all times.
