-- RBAC Stage 1: roles, permission resources (submodules), and role permissions keyed by role + resource.

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

INSERT INTO "roles" ("id", "code", "name", "description", "isSystem", "updatedAt") VALUES
    ('role_super_admin', 'super_admin', 'Super Administrator', 'Unrestricted system administration.', true, CURRENT_TIMESTAMP),
    ('role_admin', 'admin', 'Administrator', 'Full operational access to ERP modules.', true, CURRENT_TIMESTAMP),
    ('role_employee', 'employee', 'Employee', 'Standard employee access.', true, CURRENT_TIMESTAMP);

-- Users with an unknown role already resolved as employee; make that explicit before adding the FK.
UPDATE "User" SET "role" = 'employee' WHERE "role" NOT IN ('super_admin', 'admin', 'employee');

CREATE INDEX "User_role_idx" ON "User"("role");

ALTER TABLE "User" ADD CONSTRAINT "User_role_fkey" FOREIGN KEY ("role") REFERENCES "roles"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Permission groups (normally seeded by the app; inserted here so the backfill works on a fresh database)
INSERT INTO "modules" ("id", "code", "name", "description", "sortOrder", "updatedAt")
SELECT v.id, v.code, v.name, v.description, v."sortOrder", CURRENT_TIMESTAMP
FROM (VALUES
    ('mod_sd', 'sd', 'Sales & Distribution', 'Sales orders, POS, pricing, and customer billing.', 10),
    ('mod_mm', 'mm', 'Materials Management', 'Materials, procurement, inventory, and warehousing.', 20),
    ('mod_fico', 'fico', 'Finance & Controlling', 'Accounting, journals, periods, and cost control.', 30),
    ('mod_scm', 'scm', 'Supply Chain Management', 'Fleet, trips, shipments, tracking, and planning.', 40),
    ('mod_crm', 'crm', 'Customer Relationship Management', 'Customers, contacts, and sales pipeline.', 50),
    ('mod_hcm', 'hcm', 'Human Capital Management', 'Employees, positions, and HR records.', 60),
    ('mod_admin', 'admin', 'Administration', 'Super Admin Settings: users, roles, and system configuration.', 90)
) AS v(id, code, name, description, "sortOrder")
ON CONFLICT ("code") DO NOTHING;

-- CreateTable
CREATE TABLE "permission_resources" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_resources_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "permission_resources_code_key" ON "permission_resources"("code");
CREATE INDEX "permission_resources_moduleId_idx" ON "permission_resources"("moduleId");

ALTER TABLE "permission_resources" ADD CONSTRAINT "permission_resources_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "permission_resources" ("id", "moduleId", "code", "name", "description", "sortOrder", "updatedAt")
SELECT v.id, m.id, v.code, v.name, v.description, v."sortOrder", CURRENT_TIMESTAMP
FROM (VALUES
    ('res_sd_pos', 'sd', 'sd.pos', 'POS Terminal', 'Over-the-counter sales with immediate billing.', 10),
    ('res_sd_customer_master', 'sd', 'sd.customer-master', 'Customer Master', 'Customer accounts, credit limits, and partner functions.', 20),
    ('res_sd_product_catalog', 'sd', 'sd.product-catalog', 'Product Catalog', 'Storefront and POS products and prices.', 30),
    ('res_sd_material_sales_view', 'sd', 'sd.material-sales-view', 'Material Sales View', 'Sales-relevant material data and pricing views.', 40),
    ('res_sd_pricing_conditions', 'sd', 'sd.pricing-conditions', 'Pricing Conditions', 'Price lists, discounts, and condition records.', 50),
    ('res_sd_quotations', 'sd', 'sd.quotations', 'Quotations', 'Customer quotations and their conversion to orders.', 60),
    ('res_sd_sales_orders', 'sd', 'sd.sales-orders', 'Sales Orders', 'Create, change, and monitor customer sales orders.', 70),
    ('res_sd_deliveries', 'sd', 'sd.deliveries', 'Deliveries', 'Outbound deliveries and picking operations.', 80),
    ('res_sd_billing', 'sd', 'sd.billing', 'Billing', 'Customer invoices and billing documents.', 90),
    ('res_sd_reports', 'sd', 'sd.reports', 'Reports & Analytics', 'Sales analysis and backorder reports.', 100),
    ('res_sd_configuration', 'sd', 'sd.configuration', 'Configuration', 'Sales organizations and document types.', 110),
    ('res_mm_dashboard', 'mm', 'mm.dashboard', 'Analytics Dashboard', 'Charts and reports across Materials Management.', 10),
    ('res_mm_exception_center', 'mm', 'mm.exception-center', 'Exception Center', 'Operational exceptions across MM domains.', 20),
    ('res_mm_organization', 'mm', 'mm.organization', 'Organization', 'Companies and branches that scope MM transactions.', 30),
    ('res_mm_material_master', 'mm', 'mm.material-master', 'Material Master', 'Materials, units, barcodes, batches, and serials.', 40),
    ('res_mm_supplier_management', 'mm', 'mm.supplier-management', 'Supplier Management', 'Supplier master data, pricing, and performance.', 50),
    ('res_mm_procurement', 'mm', 'mm.procurement', 'Procurement', 'Requisitions, RFQs, quotations, purchase orders, and contracts.', 60),
    ('res_mm_receiving', 'mm', 'mm.receiving', 'Receiving & Quality', 'Expected receipts, goods receipt, inspection, and holds.', 70),
    ('res_mm_inventory_management', 'mm', 'mm.inventory-management', 'Inventory Management', 'Stock, reservations, movements, issues, and adjustments.', 80),
    ('res_mm_warehouse_management', 'mm', 'mm.warehouse-management', 'Warehouse Management', 'Warehouses, bins, picking, packing, and transfers.', 90),
    ('res_mm_inventory_control', 'mm', 'mm.inventory-control', 'Inventory Control', 'Cycle counts, physical inventory, and variance approval.', 100),
    ('res_mm_planning_mrp', 'mm', 'mm.planning-mrp', 'Planning / MRP', 'Demand, MRP runs, reorder points, and shortages.', 110),
    ('res_mm_valuation', 'mm', 'mm.valuation', 'Valuation', 'Inventory valuation, costing, landed cost, and variances.', 120),
    ('res_mm_returns_disposal', 'mm', 'mm.returns-disposal', 'Returns & Disposal', 'Supplier and customer returns, scrap, and disposal.', 130),
    ('res_mm_barcode_rfid', 'mm', 'mm.barcode-rfid', 'Barcode / RFID Operations', 'Mobile scanning for receiving, picking, and counting.', 140),
    ('res_mm_reports_analytics', 'mm', 'mm.reports-analytics', 'MM Reports & Analytics', 'Stock, valuation, procurement, and warehouse analytics.', 150),
    ('res_fico_chart_of_accounts', 'fico', 'fico.chart-of-accounts', 'Chart of Accounts', 'G/L accounts and account groups.', 10),
    ('res_fico_cost_centers', 'fico', 'fico.cost-centers', 'Cost Centers', 'Cost centers and responsibility areas.', 20),
    ('res_fico_profit_centers', 'fico', 'fico.profit-centers', 'Profit Centers', 'Profit centers for internal reporting.', 30),
    ('res_fico_journal_entries', 'fico', 'fico.journal-entries', 'Journal Entries', 'Post and reverse accounting documents.', 40),
    ('res_fico_accounts_payable', 'fico', 'fico.accounts-payable', 'Accounts Payable', 'Vendor invoices and outgoing payments.', 50),
    ('res_fico_accounts_receivable', 'fico', 'fico.accounts-receivable', 'Accounts Receivable', 'Customer invoices and incoming payments.', 60),
    ('res_fico_reports', 'fico', 'fico.reports', 'Reports & Analytics', 'Financial statements and cost center reporting.', 70),
    ('res_fico_configuration', 'fico', 'fico.configuration', 'Configuration', 'Fiscal year variants and FI document types.', 80),
    ('res_scm_demand_planning', 'scm', 'scm.demand-planning', 'Demand Plan', 'Versioned demand plans by product, location, and period.', 10),
    ('res_scm_supply_chain_dashboard', 'scm', 'scm.supply-chain-dashboard', 'Supply Chain Dashboard', 'Fleet, shipment, and trip KPIs.', 20),
    ('res_scm_shipments', 'scm', 'scm.shipments', 'Shipments', 'Orders waiting to be delivered.', 30),
    ('res_scm_load_building', 'scm', 'scm.load-building', 'Load Building', 'Assign cargo to trucks within capacity.', 40),
    ('res_scm_trip_planning', 'scm', 'scm.trip-planning', 'Trip Planning', 'Turn loads into trips and dispatch drivers.', 50),
    ('res_scm_trips', 'scm', 'scm.trips', 'Trips', 'Trip status and execution.', 60),
    ('res_scm_tracking', 'scm', 'scm.tracking', 'Tracking', 'Live truck positions.', 70),
    ('res_scm_vehicles', 'scm', 'scm.vehicles', 'Vehicles', 'Company trucks.', 80),
    ('res_scm_drivers', 'scm', 'scm.drivers', 'Drivers', 'Drivers and availability.', 90),
    ('res_scm_maintenance', 'scm', 'scm.maintenance', 'Maintenance', 'Truck repairs and servicing.', 100),
    ('res_crm_dashboard', 'crm', 'crm.dashboard', 'CRM Dashboard', 'Leads, pipeline, and open tickets at a glance.', 10),
    ('res_crm_customers', 'crm', 'crm.customers', 'Customers', 'Customer 360 view.', 20),
    ('res_crm_leads', 'crm', 'crm.leads', 'Leads', 'Capture, qualify, and convert prospects.', 30),
    ('res_crm_opportunities', 'crm', 'crm.opportunities', 'Opportunities', 'Deals through pipeline stages.', 40),
    ('res_crm_activities', 'crm', 'crm.activities', 'Activities', 'Calls, meetings, and tasks on leads and opportunities.', 50),
    ('res_crm_tickets', 'crm', 'crm.tickets', 'Tickets', 'Customer service cases.', 60),
    ('res_crm_loyalty', 'crm', 'crm.loyalty', 'Loyalty', 'Customer loyalty points and tiers.', 70),
    ('res_hcm_hris', 'hcm', 'hcm.hris', 'HRIS Access', 'Link to the external HRIS.', 10)
) AS v(id, module, code, name, description, "sortOrder")
JOIN "modules" m ON m.code = v.module;

-- Reshape role_permissions: (role, module) -> (roleId, resource). Each module grant is copied to all its resources.
ALTER TABLE "role_permissions" RENAME TO "legacy_role_permissions";
ALTER TABLE "legacy_role_permissions" RENAME CONSTRAINT "role_permissions_pkey" TO "legacy_role_permissions_pkey";
ALTER TABLE "legacy_role_permissions" DROP CONSTRAINT "role_permissions_moduleId_fkey";
DROP INDEX "role_permissions_moduleId_idx";
DROP INDEX "role_permissions_role_moduleId_key";

CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT false,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canUpdate" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "role_permissions_roleId_resourceId_key" ON "role_permissions"("roleId", "resourceId");
CREATE INDEX "role_permissions_resourceId_idx" ON "role_permissions"("resourceId");

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "permission_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "role_permissions" ("id", "roleId", "resourceId", "canRead", "canCreate", "canUpdate", "canDelete", "updatedAt")
SELECT
    'rp_' || md5(r.id || ':' || pr.id),
    r.id,
    pr.id,
    (l."canView" OR l."canRead" OR l."canCreate" OR l."canUpdate" OR l."canDelete"),
    l."canCreate",
    l."canUpdate",
    l."canDelete",
    CURRENT_TIMESTAMP
FROM "legacy_role_permissions" l
JOIN "roles" r ON r.code = l.role
JOIN "permission_resources" pr ON pr."moduleId" = l."moduleId"
WHERE r.code <> 'super_admin';

DROP TABLE "legacy_role_permissions";
