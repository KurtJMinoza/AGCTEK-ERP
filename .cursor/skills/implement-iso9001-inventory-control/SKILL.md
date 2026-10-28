---
name: implement-iso9001-inventory-control
description: Implement, review, repair, or extend ISO 9001-aligned enterprise resource planning inventory control covering cycle counting, full physical inventory, blind counting, recounting, variance analysis, adjustment approval, Materials Management inventory posting, Financial Accounting integration, Controlling assignments, audit trails, reports, and exception handling. Use when working on inventory accuracy, stock count discrepancies, warehouse count workflows, inventory adjustments, or related compliance controls.
---

# Implement ISO 9001 Inventory Control

Implement inventory control as an integrated enterprise resource planning process. Follow the existing project architecture before introducing new entities, services, routes, pages, statuses, or accounting behavior.

Support ISO 9001-aligned controls without claiming that the software automatically guarantees certification.

## Required outcome

Deliver a controlled process for:

1. Cycle count planning.
2. Full physical inventory.
3. Count task generation.
4. Employee assignment.
5. Blind count execution.
6. Barcode, batch, and serial scanning.
7. Mandatory recounting when required.
8. Variance calculation and investigation.
9. Formal variance reporting.
10. Warehouse and finance approval.
11. Inventory adjustment posting.
12. Financial Accounting and Controlling integration.
13. Document retention and audit history.
14. Reporting, notifications, and exception handling.

## Inspect before editing

Before modifying code:

1. Read the repository-level `AGENTS.md` and relevant architecture documentation.
2. Inspect the Materials Management module.
3. Locate the Material Master, warehouse, bin, batch, serial, inventory balance, reservation, and inventory transaction models.
4. Locate the official Inventory Posting Service.
5. Locate the inventory availability calculation.
6. Locate existing physical count and inventory adjustment features.
7. Locate the accounting-event and journal-posting integration.
8. Locate cost-center and profit-center integration.
9. Locate workflow, approval, notification, audit, employee-directory, and document-attachment services.
10. Locate company, plant, branch, and warehouse access controls.
11. Inspect frontend navigation and shared components.
12. Report what can be reused and what is missing.
13. Do not create duplicate inventory, accounting, approval, or audit systems.

Use repository search before assuming files, routes, tables, or services do not exist.

## Non-negotiable architecture rules

1. Materials Management owns physical inventory quantities.
2. Financial Accounting owns journal entries and financial account balances.
3. Controlling owns cost-center, profit-center, internal-order, and variance assignments.
4. Use the existing Inventory Posting Service as the only writer of physical inventory.
5. Never update an inventory balance directly from a controller, user interface, count document, variance report, or approval service.
6. Treat inventory balances as derived state.
7. Make posted inventory transactions immutable.
8. Reverse posted transactions with linked reversal documents instead of editing or deleting them.
9. Never use Product Catalog quantity as the inventory source.
10. Resolve every stocked product variant to its linked Material Master record.
11. Validate company ownership for materials, employees, plants, branches, warehouses, bins, accounts, and documents.
12. Hide expected quantities during blind counts.
13. Enforce separation of duties on the server.
14. Prevent counters from being their own final approvers when separation of duties is enabled.
15. Require a reason, evidence, approval history, and audit trail for every adjustment.
16. Use idempotency protection for inventory and accounting posting.
17. Do not use hardcoded users, materials, companies, warehouses, or accounts.
18. Do not delete or recreate production data.
19. Do not introduce mock data into production flows.
20. Preserve existing procurement, receiving, sales, picking, packing, shipping, returns, disposal, and accounting processes.

## Module locations

Provide or extend these locations:

### Materials Management

`Materials Management → Inventory → Inventory Control`

Include:

- Dashboard
- Cycle Count Plans
- Physical Inventory
- Count Tasks
- Variance Reports
- Adjustment Approvals
- Posted Adjustments
- Count Configuration

### Financial Accounting

- `Financial Accounting → General Ledger → Inventory Accounting Events`
- `Financial Accounting → General Ledger → Inventory Adjustment Journals`

### Controlling

- `Controlling → Cost Centers → Inventory Variances`
- `Controlling → Profit Centers → Inventory Variances`

### Supporting modules

- `Workflow and Approvals → Inventory Adjustment Approvals`
- `Document Management → Inventory Count Documents`
- `Reports and Analytics → Inventory Accuracy`
- `Exception Center → Inventory Control Exceptions`
- `Audit and Compliance → Inventory Count Audit Trail`

Adapt these paths to established project navigation conventions.

## Required roles

Implement company-scoped permissions for:

### Inventory Clerk

Allow assigned counts, scanning, quantity entry, progress saving, submission, notes, and evidence.

Do not allow expected quantity visibility during blind counting, adjustment approval, or adjustment posting.

### Inventory Auditor

Allow plan creation, count review, independent recounting, evidence review, and count comparison.

### Warehouse Manager

Allow schedule approval, employee assignment, full physical inventory initiation, recount review, and operational variance approval.

### Inventory Controller

Allow variance investigation, root-cause assignment, corrective-action management, variance reporting, and adjustment submission.

### Finance Controller

Allow financial-impact review, valuation validation, approval, rejection, and accounting-event review.

### Authorized Inventory Posting User

Allow approved adjustment posting and authorized reversal.

### Compliance Officer or Auditor

Allow read-only access to documents, approvals, attachments, accounting references, changes, and audit history.

## Required domain model

Reuse existing models where possible. Otherwise, implement equivalent entities.

### Count configuration

Store company-specific settings for:

- Blind counting
- Separation of duties
- Recount requirements
- Quantity tolerance
- Percentage tolerance
- Financial-value tolerance
- Maximum recounts
- Different recount worker requirement
- Movement freeze policy
- Soft movement reconciliation
- Approval thresholds
- Evidence requirements
- Root-cause requirements
- Zero-count confirmation
- Batch and serial requirements
- Notifications and escalation

### Inventory Count Plan

Include:

- Document number
- Company
- Plant
- Branch
- Warehouse
- Count type
- Count strategy
- Schedule
- Frequency
- Scope filters
- Assigned team
- Tolerance policy
- Movement policy
- Status
- Creator and approvers
- Audit timestamps

Count types:

- Cycle Count
- Full Physical Inventory
- Spot Count
- Recount
- Compliance Count

Count strategies:

- High-value materials
- Fast-moving materials
- Slow-moving materials
- High-variance materials
- Expiry-controlled materials
- Batch-controlled materials
- Serial-controlled materials
- Random selection
- Material category
- Warehouse area
- Full warehouse

### Inventory Count Document

Include:

- Count plan
- Company and warehouse scope
- Snapshot timestamp
- Start and completion timestamps
- Movement policy
- Counter
- Recount worker
- Auditor
- Submission and closure details
- Status

### Inventory Count Line

Include:

- Material
- Product variant reference when applicable
- Warehouse and bin
- Batch and serial number
- Base and count units
- Unit conversion
- Snapshot quantity
- Relevant movements
- Reconciled expected quantity
- Initial count
- Recount
- Final physical quantity
- Variance quantity
- Unit cost
- Variance value
- Material condition
- Notes
- Counters and timestamps
- Status

Material conditions:

- Good
- Damaged
- Expired
- Near expiry
- Opened
- Incomplete
- Quarantined
- Unknown

### Variance Investigation

Include:

- Variance report number
- Count references
- Material and location
- Expected and physical quantities
- Quantity and value variances
- Root cause
- Investigation notes
- Attachments
- Responsible department
- Corrective action
- Preventive action
- Action owner
- Due date
- Review and approval status

### Inventory Adjustment Request

Include:

- Adjustment number
- Count and variance references
- Company and material
- Warehouse and bin
- Direction and quantity
- Unit cost and total value
- Financial period
- Inventory account
- Gain or loss account
- Cost center
- Profit center
- Reason
- Requester
- Warehouse approval
- Finance approval
- Posting status
- Inventory transaction
- Accounting event
- Journal entry
- Reversal reference

Add foreign keys, indexes, company filters, unique constraints, concurrency protection, and document-number uniqueness.

## Status flows

Use explicit state machines.

### Count plan

```text
Draft
→ Pending Approval
→ Approved
→ Scheduled
→ Released
→ In Progress
→ Variance Review
→ Adjustment Pending
→ Completed
→ Closed
```

Also support Rejected and Cancelled.

### Count line

```text
Pending
→ Counting
→ Submitted
→ Matched
```

Or:

```text
Pending
→ Counting
→ Submitted
→ Recount Required
→ Recounted
→ Variance Review
→ Adjustment Pending
→ Posted
```

### Adjustment request

```text
Draft
→ Pending Warehouse Approval
→ Pending Finance Approval
→ Approved for Posting
→ Posting
→ Posted
→ Accounting Pending
→ Reconciled
→ Closed
```

Also support Rejected, Posting Failed, Accounting Failed, and Reversed.

Reject invalid transitions server-side.

## Cycle count planning

Implement a guided wizard:

1. Select company, plant, branch, and warehouse.
2. Select count strategy and materials.
3. Define the schedule and movement policy.
4. Assign counters, recount personnel, auditor, and manager.
5. Configure tolerance and approval thresholds.
6. Review and submit the plan.

Load employees from active company employees or accounts. Do not use manually typed names.

After approval and release:

1. Resolve eligible active stock-managed materials.
2. Generate count lines from official inventory balances.
3. Capture system quantity and valuation snapshots.
4. Include batch and serial details.
5. Prevent duplicate material-location combinations.
6. Notify assigned workers.
7. Preserve the released scope.

Require an audited scope amendment for materials added after release.

## Full physical inventory

Require the full count to:

1. Cover all active stock-managed materials in the selected warehouse.
2. Cover every storage area and bin.
3. Include zero-count confirmation.
4. Include batch and serial reconciliation.
5. Record unidentified materials.
6. Record materials found in the wrong bin.
7. Require recounting for every initial discrepancy.
8. Preserve initial and recount results separately.
9. Require Warehouse Manager and Inventory Auditor review.

Never create a Material Master record automatically for an unknown item.

## Movement control

Support one configured method per count scope.

### Hard freeze

Block inventory postings affecting counted materials or locations.

Show:

- Count document causing the freeze
- Affected scope
- Freeze start time
- Authorized release role

### Soft movement control

Allow movements while preserving all transactions after the snapshot.

Calculate:

```text
Reconciled Expected Quantity
= Snapshot Quantity
+ Posted Receipts
- Posted Issues
+ Posted Transfers In
- Posted Transfers Out
```

Include only movements posted before the physical count timestamp for the applicable line.

## Count execution

Create responsive desktop, tablet, and mobile interfaces.

Display:

- Count document
- Company
- Warehouse
- Assigned worker
- Progress
- Completed lines
- Remaining lines
- Scanned quantities
- Exceptions
- Save and submit actions

Support:

1. Bin scanning.
2. Material barcode scanning.
3. Batch selection or scanning.
4. Serial-number scanning.
5. Numeric quantity entry.
6. Increment and decrement controls.
7. Carton and units-per-carton entry.
8. Batch quantity entry.
9. Undoing the latest scan.
10. Notes and attachments.
11. Zero-count confirmation.
12. Progress saving.

Do not force repeated individual scans when authorized bulk entry is appropriate.

During blind counting, hide:

- System quantity
- Expected quantity
- Variance
- Inventory value
- Previous count quantity

## Recounting

When recounting is required:

1. Lock the initial count.
2. Create a linked recount task.
3. Assign an independent worker when configured.
4. Hide system and initial-count quantities.
5. Record the recount separately.
6. Compare all results after submission.
7. Require an auditor decision for unresolved differences.

Allow the auditor to:

- Accept the first count
- Accept the recount
- Order another recount
- Investigate movements
- Investigate wrong-bin placement
- Escalate to variance analysis

Never overwrite an earlier count.

## Variance calculation

Calculate:

```text
Variance Quantity
= Final Physical Quantity
- Reconciled Expected Quantity
```

Calculate:

```text
Variance Value
= Variance Quantity
× Approved Unit Cost
```

Use the material’s configured valuation method and valuation area.

Reservations are not missing physical stock. They reduce available stock but do not reduce physical on-hand quantity.

## Variance analysis

Provide these root-cause categories:

- Receiving quantity error
- Unposted goods receipt
- Picking error
- Packing error
- Unposted goods issue
- Wrong-bin placement
- Missing stock transfer
- Incorrect unit conversion
- Batch mismatch
- Serial-number mismatch
- Unposted customer return
- Unposted supplier return
- Unposted scrap or disposal
- Duplicate inventory posting
- Timing difference
- Damaged material
- Expired material
- Theft or unexplained loss
- Data migration problem
- Material configuration error
- Barcode assignment error
- Unknown cause

Require:

- Investigation notes
- Supporting evidence
- Responsible department
- Corrective action
- Preventive action
- Action owner
- Target date

Count damaged or expired materials as physically present when they exist. Create a quarantine action instead of treating them as missing. Process disposal through the approved disposal workflow.

## Approval control

Require formal approval before posting.

Standard flow:

```text
Variance Identified
→ Recount Completed
→ Investigation Completed
→ Warehouse Manager Review
→ Finance Controller Review
→ Approved for Posting
→ Adjustment Posted
→ Accounting Posted
→ Reconciled
→ Closed
```

Route approval based on:

- Company
- Warehouse
- Material category
- Quantity variance
- Financial value
- Root cause
- Risk
- User authority limit

Require rejection reasons. Return rejected requests for correction and resubmission.

## Inventory adjustment posting

Before posting:

1. Confirm all required approvals.
2. Confirm the document is not already posted.
3. Validate company and warehouse.
4. Validate material status.
5. Validate financial period.
6. Reconcile later inventory movements.
7. Lock the applicable inventory balance.
8. Generate an idempotency key.
9. Call the official Inventory Posting Service.
10. Create an immutable inventory transaction.
11. Recalculate derived balances and availability.
12. Create an accounting event.
13. Link all source documents.
14. Store audit records.

### Positive adjustment

```text
Debit: Inventory Asset
Credit: Inventory Adjustment Gain
```

### Negative adjustment

```text
Debit: Inventory Adjustment Loss
Credit: Inventory Asset
```

Send company, material, warehouse, quantity, cost, value, currency, accounts, cost center, profit center, source documents, posting user, posting date, and idempotency key to accounting integration.

If accounting fails after inventory posts:

1. Do not repost inventory.
2. Mark accounting as pending or failed.
3. Create an Exception Center record.
4. Allow idempotent accounting reprocessing.

## Availability calculation

After adjustment, use the project’s centralized availability service.

The standard calculation is:

```text
Available Stock
= On-Hand Stock
- Reserved Stock
- Blocked Stock
- Quality Inspection Stock
```

If reserved stock exceeds adjusted on-hand stock:

1. Do not delete reservations.
2. Prevent additional allocation.
3. Create a shortage exception.
4. Identify affected orders.
5. Notify warehouse and sales personnel.

## Reversal

Never edit or delete a posted adjustment.

Require reversal to:

1. Reference the original posting.
2. Include a reason.
3. Follow value-based approval.
4. Post an opposite inventory movement.
5. Create a reversing accounting event.
6. Preserve both documents.
7. Recalculate availability.
8. Record a complete audit trail.

## Reports and dashboard

Provide:

- Inventory accuracy
- Count completion
- Planned, active, and overdue counts
- Recounts required
- Open investigations
- Pending approvals
- Positive and negative variance values
- Accounting failures
- Overdue corrective actions
- Variance by company, warehouse, material, variant, bin, worker, and root cause
- Repeated variance materials
- Posted and reversed adjustments

Calculate line accuracy as:

```text
Inventory Accuracy Percentage
= Counted Lines Without Variance
÷ Total Counted Lines
× 100
```

Also provide quantity-based and value-based accuracy.

## Exception Center

Create actionable exceptions for:

- Missing inventory balance
- Missing valuation
- Missing account determination
- Unknown barcode
- Duplicate count line
- Missing batch
- Missing serial number
- Duplicate serial number
- Wrong company or warehouse
- Unauthorized movement during freeze
- Incomplete recount
- Overdue approval
- Closed financial period
- Posting failure
- Accounting failure
- Balance changed after final count
- Negative stock
- Reservations exceeding stock

Include severity, company, material, warehouse, source document, assignee, due date, resolution, status, and audit history.

## Audit and document control

Preserve:

- Plans
- Count sheets
- Recount sheets
- Variance reports
- Evidence
- Approval decisions
- Adjustments
- Accounting references
- Corrective actions
- Reversals

Audit creation, updates, approvals, rejections, assignment, count submission, recounting, classification, attachments, posting, reversal, and closure.

Record the user, role, company, action, previous value, new value, timestamp, reason, session information when supported, and related document.

## Testing requirements

Add unit, integration, and end-to-end coverage for:

- Cycle count creation
- Company isolation
- Count task generation
- Duplicate prevention
- Blind counting
- Progress saving
- No-variance count
- Positive variance
- Negative variance
- Mandatory recount
- Independent recount assignment
- Batch counting
- Serial counting
- Duplicate serial prevention
- Zero-count confirmation
- Hard freeze
- Soft movement reconciliation
- Variance investigation
- Approval limits
- Self-approval prevention
- Positive and negative posting
- Accounting event creation
- Duplicate-posting prevention
- Closed-period blocking
- Accounting failure recovery
- Adjustment reversal
- Posted-document immutability
- Availability recalculation
- Reservation shortage exceptions
- Full warehouse counting
- Complete audit history

## Verification and handoff

After implementation:

1. Run safe database migrations.
2. Run formatting and linting.
3. Run type checking.
4. Run relevant backend and frontend tests.
5. Run integration and end-to-end tests.
6. Build the frontend and backend.
7. Verify permissions and company isolation.
8. Verify positive and negative accounting entries.
9. Verify that only the Inventory Posting Service changes stock.
10. Verify that posted documents cannot be edited or deleted.
11. Restart only the correct application processes when requested.
12. Do not stop unrelated services.

Provide a final report listing:

- Existing architecture discovered
- Files created and modified
- Migrations
- Services and endpoints
- User interface pages
- Permissions
- Accounting mappings
- Tests and results
- Build results
- Limitations
- Manual verification steps

## Completion definition

Treat the feature as complete only when this complete process works:

```text
Create Count Plan
→ Approve Plan
→ Schedule Count
→ Generate Count Tasks
→ Assign Counters
→ Capture Inventory Snapshot
→ Execute Blind Count
→ Submit Count
→ Recount Discrepancies
→ Calculate Final Variance
→ Investigate Root Cause
→ Generate Variance Report
→ Obtain Warehouse Approval
→ Obtain Finance Approval
→ Post Inventory Adjustment
→ Create Accounting Event
→ Reconcile Inventory and Financial Value
→ Complete Corrective Actions
→ Close Count Document
```
