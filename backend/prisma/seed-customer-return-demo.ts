/**
 * Presentation seed for the customer-return integration chain.
 *
 *   SD Sales Order (CONFIRMED) → MM reservation/package → SCM DELIVERED shipment
 *   → (SCM damage report) → (SD sales return) → (MM customer return intake)
 *
 * This seeds the *prerequisites* for three scenarios. The integration steps themselves are driven
 * through the real HTTP API by `scripts/run-customer-return-scenarios.mjs` (or asserted by
 * `scripts/test-customer-return-api.mjs`) so the API — and its audits — are what get exercised.
 *
 *   cd backend && npx ts-node --project prisma/tsconfig.seed.json prisma/seed-customer-return-demo.ts
 *
 * Idempotent: prior demo rows with the fixed codes below are removed first.
 *
 *   Scenario 1  SHP-CR-DEMO-001  steel rods   qty 10 / damage 3  → RESTOCK / INSPECTION
 *   Scenario 2  SHP-CR-DEMO-002  machine oil  qty  6 / damage 2  → SCRAP  / APPROVED
 *   Scenario 3  SHP-CR-DEMO-003  boxes        qty  8 / damage 5  → REJECTED (no MM intake)
 */
import { PrismaClient, ShipmentMovementType, ShipmentStatus } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { randomUUID } from 'crypto'

const TAG = 'CR-DEMO'

type Scenario = {
    key: string
    materialCode: string
    orderQty: number
    damageQty: number
    customerName: string
    contactName: string
    destAddress: string
}

const SCENARIOS: Scenario[] = [
    {
        key: '001',
        materialCode: 'MAT-STEEL-001',
        orderQty: 10,
        damageQty: 3,
        customerName: 'Demo Retail Partner Inc.',
        contactName: 'Maria Santos',
        destAddress: '123 Demo Ave, Davao City',
    },
    {
        key: '002',
        materialCode: 'MAT-OIL-001',
        orderQty: 6,
        damageQty: 2,
        customerName: 'Metro Builders Supply Co.',
        contactName: 'Jose Ramirez',
        destAddress: '88 Industrial Rd, Cebu City',
    },
    {
        key: '003',
        materialCode: 'MAT-BOX-001',
        orderQty: 8,
        damageQty: 5,
        customerName: 'CebuTech Electronics Assembly',
        contactName: 'Liza Tan',
        destAddress: '5 Export Zone, Mandaue City',
    },
]

const codes = (key: string) => ({
    orderNo: `SO-${TAG}-${key}`,
    resNo: `RES-${TAG}-${key}`,
    pickNo: `PICK-${TAG}-${key}`,
    pkgNo: `PKG-${TAG}-${key}`,
    shipRef: `SHP-${TAG}-${key}`,
    customerNo: `CUST-${TAG}-${key}`,
    email: `${TAG}-${key}@demo.agctek.local`.toLowerCase(),
})

async function main() {
    const prisma = new PrismaClient()
    try {
        console.log(`=== Customer-return presentation seed (${TAG}, ${SCENARIOS.length} scenarios) ===\n`)

        const company = await prisma.company.findFirstOrThrow({ where: { code: 'AGCTEK' } })
        const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { code: 'MAIN' } })
        const bin = await prisma.wmStorageBin.findFirstOrThrow({
            where: { storageSection: { storageType: { warehouseId: warehouse.id } } },
        })
        const admin =
            (await prisma.user.findFirst({ where: { role: 'super_admin' }, orderBy: { createdAt: 'asc' } })) ??
            (await prisma.user.findFirstOrThrow())

        console.log(`company   ${company.code} (${company.id})`)
        console.log(`warehouse ${warehouse.code} (${warehouse.id})`)
        console.log(`bin       ${bin.code} (${bin.id})`)
        console.log(`admin     ${admin.userName} (${admin.id})\n`)

        const out: Record<string, unknown> = {
            companyId: company.id,
            warehouseId: warehouse.id,
            userId: admin.id,
            scenarios: [] as unknown[],
        }

        for (const sc of SCENARIOS) {
            const c = codes(sc.key)
            const material = await prisma.mmMaterial.findFirstOrThrow({
                where: { materialCode: sc.materialCode },
            })

            await cleanup(prisma, c)

            const customer = await prisma.sdCustomer.create({
                data: {
                    customerNumber: c.customerNo,
                    companyName: sc.customerName,
                    contactName: sc.contactName,
                    email: c.email,
                    currency: 'PHP',
                    status: 'ACTIVE',
                    createdBy: admin.id,
                },
            })

            const order = await prisma.sdSalesOrder.create({
                data: {
                    orderNumber: c.orderNo,
                    companyId: company.id,
                    warehouseId: warehouse.id,
                    customerId: customer.id,
                    channel: 'STANDARD',
                    source: 'ERP',
                    divisionId: 'DIV_RETAIL',
                    customerName: customer.companyName,
                    customerEmail: customer.email,
                    currency: 'PHP',
                    subtotal: new Decimal(sc.orderQty * 100),
                    totalAmount: new Decimal(sc.orderQty * 100),
                    status: 'CONFIRMED',
                    correlationId: randomUUID(),
                    notes: `${TAG} scenario ${sc.key}`,
                    createdBy: admin.id,
                    lines: {
                        create: {
                            lineNumber: 1,
                            materialId: material.id,
                            sku: material.materialCode,
                            description: material.materialName,
                            unitPrice: new Decimal(100),
                            lineTotal: new Decimal(sc.orderQty * 100),
                            quantity: new Decimal(sc.orderQty),
                            salesUomId: material.baseUomId,
                            baseUomId: material.baseUomId,
                            baseQuantity: new Decimal(sc.orderQty),
                            integrationStatus: 'RESERVED',
                        },
                    },
                },
                include: { lines: true },
            })
            const orderLine = order.lines[0]

            const header = await prisma.mmInventoryReservationHeader.create({
                data: {
                    reservationNumber: c.resNo,
                    companyId: company.id,
                    warehouseId: warehouse.id,
                    sourceModule: 'SD',
                    sourceDocumentType: 'SALES_ORDER',
                    sourceDocumentId: order.id,
                    demandReferenceType: 'SALES_ORDER',
                    demandReferenceId: order.id,
                    status: 'RESERVED',
                    createdBy: admin.id,
                    lines: {
                        create: {
                            lineNumber: 1,
                            materialId: material.id,
                            uomId: material.baseUomId,
                            requestedQuantity: new Decimal(sc.orderQty),
                            reservedQuantity: new Decimal(sc.orderQty),
                            demandReferenceLineId: orderLine.id,
                            status: 'RESERVED',
                        },
                    },
                },
                include: { lines: true },
            })
            const resLine = header.lines[0]

            const pickingTask = await prisma.wmPickingTask.create({
                data: {
                    taskNumber: c.pickNo,
                    warehouseId: warehouse.id,
                    companyId: company.id,
                    reservationHeaderId: header.id,
                    reservationLineId: resLine.id,
                    sourceBinId: bin.id,
                    materialId: material.id,
                    requiredQty: new Decimal(sc.orderQty),
                    pickedQty: new Decimal(sc.orderQty),
                    sourceDocument: `SALES_ORDER:${order.id}`,
                    assignedUser: admin.id,
                    status: 'COMPLETED',
                    completedAt: new Date(),
                },
            })

            const pkg = await prisma.wmPackage.create({
                data: {
                    packageNumber: c.pkgNo,
                    orderNumber: order.orderNumber,
                    warehouseId: warehouse.id,
                    pickingTaskId: pickingTask.id,
                    packageType: 'PALLET',
                    status: 'DISPATCHED',
                    shipToName: customer.companyName,
                    shipToAddress: sc.destAddress,
                    carrier: 'AGCTEK Logistics',
                    trackingNumber: `${c.shipRef}-TRK`,
                    items: {
                        create: {
                            materialId: material.id,
                            expectedQty: new Decimal(sc.orderQty),
                            scannedQty: new Decimal(sc.orderQty),
                            status: 'SCANNED',
                        },
                    },
                },
                include: { items: true },
            })
            const packageItem = pkg.items[0]

            const shipment = await prisma.shipment.create({
                data: {
                    reference: c.shipRef,
                    customerName: customer.companyName,
                    destAddress: sc.destAddress,
                    quantity: sc.orderQty,
                    materialCode: material.materialCode,
                    description: material.materialName,
                    movementType: ShipmentMovementType.DELIVERY,
                    status: ShipmentStatus.DELIVERED,
                    packageId: pkg.id,
                    deliveredAt: new Date(),
                    lines: {
                        create: {
                            lineNo: 1,
                            materialCode: material.materialCode,
                            description: material.materialName,
                            quantity: sc.orderQty,
                            shipToAddress: sc.destAddress,
                            packageItemId: packageItem.id,
                        },
                    },
                },
                include: { lines: true },
            })

            ;(out.scenarios as unknown[]).push({
                key: sc.key,
                materialCode: sc.materialCode,
                orderQty: sc.orderQty,
                damageQty: sc.damageQty,
                customerName: sc.customerName,
                salesOrderId: order.id,
                salesOrderLineId: orderLine.id,
                shipmentId: shipment.id,
                shipmentReference: shipment.reference,
                shipmentLineId: shipment.lines[0].id,
            })

            console.log(
                `scenario ${sc.key}: ${material.materialCode} x${sc.orderQty} — ${shipment.reference} [${shipment.status}] (damage qty ${sc.damageQty})`,
            )
        }

        console.log('\n✅ Seed complete (prerequisites only — run the scenario driver for the chain).')
        console.log(JSON.stringify(out, null, 2))
    } finally {
        await prisma.$disconnect()
    }
}

type Codes = ReturnType<typeof codes>

async function cleanup(prisma: PrismaClient, c: Codes) {
    const priorReturns = await prisma.sdSalesReturn.findMany({
        where: { salesOrder: { orderNumber: c.orderNo } },
        select: { id: true },
    })
    const returnIds = priorReturns.map((r) => r.id)
    if (returnIds.length) {
        const crs = await prisma.mmCustomerReturn.findMany({
            where: { sdSalesReturnId: { in: returnIds } },
            select: { id: true },
        })
        const crIds = crs.map((x) => x.id)
        if (crIds.length) {
            await prisma.mmReturnDisposition.deleteMany({ where: { legacyCustomerReturnId: { in: crIds } } })
            await prisma.mmReturnInspection.deleteMany({ where: { legacyCustomerReturnId: { in: crIds } } })
            await prisma.mmCustomerReturnIntake.deleteMany({ where: { legacyCustomerReturnId: { in: crIds } } })
            await prisma.mmCustomerReturnAudit.deleteMany({ where: { returnId: { in: crIds } } })
            await prisma.mmCustomerReturnLine.deleteMany({ where: { returnId: { in: crIds } } })
            await prisma.mmCustomerReturn.deleteMany({ where: { id: { in: crIds } } })
        }
        await prisma.sdSalesReturnAudit.deleteMany({ where: { salesReturnId: { in: returnIds } } })
        await prisma.sdSalesReturnLine.deleteMany({ where: { salesReturnId: { in: returnIds } } })
        await prisma.sdSalesReturn.deleteMany({ where: { id: { in: returnIds } } })
    }
    await prisma.damageReportAudit.deleteMany({ where: { report: { shipment: { reference: c.shipRef } } } })
    await prisma.damageReport.deleteMany({ where: { shipment: { reference: c.shipRef } } })

    await prisma.shipmentLine.deleteMany({ where: { shipment: { reference: c.shipRef } } })
    await prisma.shipment.deleteMany({ where: { reference: c.shipRef } })

    const pkg = await prisma.wmPackage.findUnique({ where: { packageNumber: c.pkgNo } })
    if (pkg) {
        await prisma.wmPackageItem.deleteMany({ where: { packageId: pkg.id } })
        await prisma.wmPackage.delete({ where: { id: pkg.id } })
    }
    await prisma.wmPickingTask.deleteMany({ where: { taskNumber: c.pickNo } })
    await prisma.mmInventoryReservationLine.deleteMany({ where: { header: { reservationNumber: c.resNo } } })
    await prisma.mmInventoryReservationHeader.deleteMany({ where: { reservationNumber: c.resNo } })
    await prisma.sdSalesOrderLine.deleteMany({ where: { salesOrder: { orderNumber: c.orderNo } } })
    await prisma.sdSalesOrder.deleteMany({ where: { orderNumber: c.orderNo } })
    await prisma.sdCustomer.deleteMany({ where: { customerNumber: c.customerNo } })
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
