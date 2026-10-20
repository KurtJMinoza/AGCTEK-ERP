/**
 * COD delivery + Customer Returns demo seed (Phases 1–4).
 *
 * Three scenarios (idempotent — fixed codes cleaned first; retired DMG rows removed):
 *
 *   HAPPY   SO-COD-DEMO-HAPPY / TRP-COD-DEMO-HAPPY
 *           Trip IN_TRANSIT · drop-off ARRIVED · COD Pending Collection
 *           → driver: accept all → collect full cash (scenario 1)
 *
 *   RPL     SO-COD-DEMO-RPL · accepted 10/10 · COD Paid ₱1,000
 *           Hidden damage → RET-COD-DEMO-RPL REQUESTED · Replace request (orange)
 *
 *   RFD     SO-COD-DEMO-RFD · accepted 10/10 · COD Paid ₱1,000
 *           Hidden damage → RET-COD-DEMO-RFD REQUESTED · Refund request (red)
 *
 * Prerequisites: company AGCTEK, warehouse MAIN, materials MAT-STEEL-001 + MAT-OIL-001,
 * driver01 (from SCM connected seed). Vehicle VEH-COD-DEMO is upserted.
 *
 *   cd backend && npx ts-node --project prisma/tsconfig.seed.json prisma/seed-cod-delivery-demo.ts
 *   # or: npm run prisma:seed-cod-delivery-demo
 */
import { PrismaClient, ShipmentMovementType, ShipmentStatus } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { randomUUID } from 'crypto'

const TAG = 'COD-DEMO'
const HUB = { lat: 14.5995, lng: 120.9842 }
const UNIT_PRICE = 100

type ScenarioKey = 'HAPPY' | 'RPL' | 'RFD'

/** Scenarios dropped from the demo — their rows are deleted on every run. */
const RETIRED_KEYS = ['DMG'] as const

type Scenario = {
    key: ScenarioKey
    materialCode: string
    orderQty: number
    /** Accepted at POD; null = not yet delivered (live driver). */
    acceptedQty: number | null
    customerName: string
    contactName: string
    destAddress: string
    city: string
    lat: number
    lng: number
    /** Customer-filed return after a fully paid COD delivery (hidden damage). */
    laterReturn?: { qty: number; resolution: 'REPLACEMENT' | 'REFUND' }
}

const SCENARIO_DEFS: Omit<Scenario, 'materialCode'>[] = [
    {
        key: 'HAPPY',
        orderQty: 10,
        acceptedQty: null,
        customerName: 'Happy Path Retail Co.',
        contactName: 'Ana Cruz',
        destAddress: '100 Clean Delivery St, Makati City',
        city: 'Makati',
        lat: 14.5547,
        lng: 121.0244,
    },
    {
        key: 'RPL',
        orderQty: 10,
        acceptedQty: 10,
        customerName: 'Replace Request Hardware',
        contactName: 'Carla Santos',
        destAddress: '12 Swap Lane, Pasig City',
        city: 'Pasig',
        lat: 14.5764,
        lng: 121.0851,
        laterReturn: { qty: 2, resolution: 'REPLACEMENT' },
    },
    {
        key: 'RFD',
        orderQty: 10,
        acceptedQty: 10,
        customerName: 'Refund Request Supplies',
        contactName: 'Dan Lim',
        destAddress: '88 Money Back Rd, Taguig City',
        city: 'Taguig',
        lat: 14.5176,
        lng: 121.0509,
        laterReturn: { qty: 2, resolution: 'REFUND' },
    },
]

/** Prefer classic demo SKUs; otherwise use whatever materials exist in the DB. */
const PREFERRED_MATERIALS = ['MAT-STEEL-001', 'MAT-OIL-001', 'MAT-BOX-001']

const codes = (key: ScenarioKey | (typeof RETIRED_KEYS)[number]) => ({
    orderNo: `SO-${TAG}-${key}`,
    resNo: `RES-${TAG}-${key}`,
    pickNo: `PICK-${TAG}-${key}`,
    pkgNo: `PKG-${TAG}-${key}`,
    shipRef: `SHP-${TAG}-${key}`,
    customerNo: `CUST-${TAG}-${key}`,
    email: `${TAG}-${key}@demo.agctek.local`.toLowerCase(),
    tripCode: `TRP-${TAG}-${key}`,
    loadPlanCode: `LP-${TAG}-${key}`,
    damageRef: `DR-${TAG}-${key}`,
    returnNo: `RET-${TAG}-${key}`,
})

async function main() {
    const prisma = new PrismaClient()
    try {
        console.log(`=== COD delivery demo seed (${TAG}) ===\n`)

        const company = await prisma.company.findFirstOrThrow({ where: { code: 'AGCTEK' } })
        const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { code: 'MAIN' } })
        const bin = await prisma.wmStorageBin.findFirstOrThrow({
            where: { storageSection: { storageType: { warehouseId: warehouse.id } } },
        })
        const admin =
            (await prisma.user.findFirst({
                where: { role: 'super_admin' },
                orderBy: { createdAt: 'asc' },
            })) ?? (await prisma.user.findFirstOrThrow())

        let driverUser = await prisma.user.findFirst({ where: { userName: 'driver01' } })
        if (!driverUser) {
            throw new Error(
                'driver01 not found — run npm run prisma:seed-scm-demo (or seed-scm-connected) first',
            )
        }
        const licenseExpiry = new Date()
        licenseExpiry.setFullYear(licenseExpiry.getFullYear() + 2)
        let driver = await prisma.driver.findUnique({ where: { userId: driverUser.id } })
        if (!driver) {
            // User may exist without a Driver profile (partial SCM seed).
            driver = await prisma.driver.upsert({
                where: { userId: driverUser.id },
                create: {
                    userId: driverUser.id,
                    employeeCode: 'DRV-COD-DEMO',
                    firstName: 'Juan',
                    lastName: 'Reyes',
                    licenseNumber: 'D-COD-DEMO-001',
                    licenseExpiry,
                    phone: '+63 917 000 0001',
                    status: 'AVAILABLE',
                },
                update: { status: 'AVAILABLE' },
            })
            console.log(`created Driver profile for ${driverUser.userName}`)
        }

        const vehicle = await prisma.vehicle.upsert({
            where: { code: 'VEH-COD-DEMO' },
            create: {
                code: 'VEH-COD-DEMO',
                plateNumber: 'COD-0001',
                make: 'Isuzu',
                model: 'N-Series',
                type: 'TRUCK',
                status: 'AVAILABLE',
                capacityQty: 80,
                capacityWeightKg: 0,
                capacityVolumeM3: 0,
            },
            update: { status: 'AVAILABLE', routingBlocked: false, capacityQty: 80 },
        })

        const preferred = await prisma.mmMaterial.findMany({
            where: { materialCode: { in: PREFERRED_MATERIALS } },
            select: { id: true, materialCode: true, materialName: true, baseUomId: true },
        })
        const preferredByCode = new Map(preferred.map((m) => [m.materialCode, m]))
        let fallbackMats = preferred
        if (fallbackMats.length < SCENARIO_DEFS.length) {
            fallbackMats = await prisma.mmMaterial.findMany({
                take: SCENARIO_DEFS.length,
                orderBy: { materialCode: 'asc' },
                select: { id: true, materialCode: true, materialName: true, baseUomId: true },
            })
        }
        if (!fallbackMats.length) {
            throw new Error('No MM materials found — seed material master first')
        }

        const SCENARIOS: Scenario[] = SCENARIO_DEFS.map((def, i) => {
            const preferredCode = PREFERRED_MATERIALS[i]
            const material =
                (preferredCode ? preferredByCode.get(preferredCode) : undefined) ??
                fallbackMats[Math.min(i, fallbackMats.length - 1)]
            return { ...def, materialCode: material.materialCode }
        })

        console.log(`company   ${company.code}`)
        console.log(`warehouse ${warehouse.code}`)
        console.log(`driver    ${driverUser.userName} (${driver.employeeCode ?? driver.id})`)
        console.log(`vehicle   ${vehicle.code}`)
        console.log(
            `materials ${SCENARIOS.map((s) => s.materialCode).join(', ')}\n`,
        )

        for (const key of RETIRED_KEYS) {
            await cleanup(prisma, codes(key))
            console.log(`removed retired scenario ${key}`)
        }

        const summary: unknown[] = []

        for (const sc of SCENARIOS) {
            const c = codes(sc.key)
            const material = await prisma.mmMaterial.findFirstOrThrow({
                where: { materialCode: sc.materialCode },
            })
            await cleanup(prisma, c)

            const total = sc.orderQty * UNIT_PRICE
            const accepted = sc.acceptedQty
            const isLive = accepted == null
            const codDue = isLive ? total : accepted! * UNIT_PRICE

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
                    shipToName: customer.companyName,
                    shipToPhone: '09000000000',
                    shipToAddressLine1: sc.destAddress,
                    shipToCity: sc.city,
                    shipToCountry: 'PH',
                    currency: 'PHP',
                    subtotal: new Decimal(total),
                    totalAmount: new Decimal(total),
                    paymentMethod: 'COD',
                    paymentStatus: isLive ? 'Pending Collection' : 'Paid',
                    status: isLive ? 'CONFIRMED' : 'DELIVERED',
                    correlationId: randomUUID(),
                    notes: `${TAG} ${sc.key}: ${isLive ? 'live POD accept-all' : `accepted ${accepted}/${sc.orderQty}`}`,
                    createdBy: admin.id,
                    ...(isLive
                        ? {}
                        : {
                              shippedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
                              deliveredAt: new Date(),
                          }),
                    lines: {
                        create: {
                            lineNumber: 1,
                            materialId: material.id,
                            sku: material.materialCode,
                            description: material.materialName,
                            unitPrice: new Decimal(UNIT_PRICE),
                            lineTotal: new Decimal(total),
                            quantity: new Decimal(sc.orderQty),
                            salesUomId: material.baseUomId,
                            baseUomId: material.baseUomId,
                            baseQuantity: new Decimal(sc.orderQty),
                            integrationStatus: 'RESERVED',
                            issuedQuantity: isLive
                                ? new Decimal(0)
                                : new Decimal(accepted!),
                        },
                    },
                    payments: {
                        create: {
                            companyId: company.id,
                            customerId: customer.id,
                            paymentMethod: 'COD',
                            amount: new Decimal(codDue),
                            currency: 'PHP',
                            status: isLive ? 'Pending Collection' : 'Paid',
                            isDemo: true,
                            createdBy: admin.id,
                            ...(isLive ? {} : { paidAt: new Date() }),
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
                    salesOrderId: order.id,
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
                    salesOrderId: order.id,
                    warehouseId: warehouse.id,
                    companyId: company.id,
                    pickingTaskId: pickingTask.id,
                    packageType: 'PALLET',
                    status: isLive ? 'READY_FOR_DISPATCH' : 'DISPATCHED',
                    shipToName: customer.companyName,
                    shipToAddress: sc.destAddress,
                    shipToLat: sc.lat,
                    shipToLng: sc.lng,
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

            const whAddress = warehouse.address ?? warehouse.name
            const shipment = await prisma.shipment.create({
                data: {
                    reference: c.shipRef,
                    companyId: company.id,
                    customerName: customer.companyName,
                    originAddress: whAddress,
                    originLat: HUB.lat,
                    originLng: HUB.lng,
                    destAddress: sc.destAddress,
                    destLat: sc.lat,
                    destLng: sc.lng,
                    quantity: sc.orderQty,
                    materialCode: material.materialCode,
                    description: material.materialName,
                    movementType: ShipmentMovementType.DELIVERY,
                    status: isLive ? ShipmentStatus.IN_TRANSIT : ShipmentStatus.DELIVERED,
                    packageId: pkg.id,
                    ...(isLive ? {} : { deliveredAt: new Date() }),
                    lines: {
                        create: {
                            lineNo: 1,
                            materialCode: material.materialCode,
                            description: material.materialName,
                            quantity: sc.orderQty,
                            shipFromWarehouseId: warehouse.id,
                            shipFromAddress: whAddress,
                            shipFromLat: HUB.lat,
                            shipFromLng: HUB.lng,
                            shipToAddress: sc.destAddress,
                            shipToLat: sc.lat,
                            shipToLng: sc.lng,
                            packageItemId: packageItem.id,
                        },
                    },
                },
                include: { lines: true },
            })
            const shipmentLine = shipment.lines[0]

            const now = new Date()
            const loadPlan = await prisma.loadPlan.create({
                data: {
                    code: c.loadPlanCode,
                    vehicleId: vehicle.id,
                    status: isLive ? 'DISPATCHED' : 'COMPLETED',
                    totalQty: sc.orderQty,
                    validatedAt: now,
                    readyAt: now,
                    createdBy: 'seed-cod-delivery-demo',
                    lines: {
                        create: {
                            shipmentLineId: shipmentLine.id,
                            assignedQty: sc.orderQty,
                        },
                    },
                },
                include: { lines: true },
            })
            const loadPlanLine = loadPlan.lines[0]

            const shipLocKey = `WH:${warehouse.id}`
            const toLocKey = `ADDR:${sc.destAddress.trim().toLowerCase()}`

            const trip = await prisma.trip.create({
                data: {
                    code: c.tripCode,
                    vehicleId: vehicle.id,
                    driverId: driver.id,
                    loadPlanId: loadPlan.id,
                    status: isLive ? 'IN_TRANSIT' : 'COMPLETED',
                    plannedStartAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
                    dispatchedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
                    startedAt: new Date(now.getTime() - 90 * 60 * 1000),
                    ...(isLive ? {} : { completedAt: now }),
                    totalQty: sc.orderQty,
                    notes: `${TAG} ${sc.key}`,
                    stops: {
                        create: [
                            {
                                sequence: 1,
                                stopType: 'SHIP',
                                locationKey: shipLocKey,
                                locationKind: 'WAREHOUSE',
                                warehouseId: warehouse.id,
                                name: warehouse.name,
                                address: whAddress,
                                lat: HUB.lat,
                                lng: HUB.lng,
                                status: 'COMPLETED',
                                arrivedAt: new Date(now.getTime() - 80 * 60 * 1000),
                                completedAt: new Date(now.getTime() - 70 * 60 * 1000),
                                locationSnapshotAt: now,
                                lines: {
                                    create: {
                                        loadPlanLineId: loadPlanLine.id,
                                        shipmentLineId: shipmentLine.id,
                                    },
                                },
                                shipments: {
                                    create: {
                                        shipmentId: shipment.id,
                                        action: 'PICKUP',
                                    },
                                },
                            },
                            {
                                sequence: 2,
                                stopType: 'TO',
                                locationKey: toLocKey,
                                locationKind: 'ADDRESS',
                                name: customer.companyName,
                                address: sc.destAddress,
                                lat: sc.lat,
                                lng: sc.lng,
                                status: isLive ? 'ARRIVED' : 'COMPLETED',
                                arrivedAt: new Date(now.getTime() - 20 * 60 * 1000),
                                ...(isLive
                                    ? {}
                                    : {
                                          completedAt: now,
                                          podNotes: 'Seeded full delivery',
                                      }),
                                locationSnapshotAt: now,
                                lines: {
                                    create: {
                                        loadPlanLineId: loadPlanLine.id,
                                        shipmentLineId: shipmentLine.id,
                                    },
                                },
                                shipments: {
                                    create: {
                                        shipmentId: shipment.id,
                                        action: 'DROPOFF',
                                    },
                                },
                            },
                        ],
                    },
                },
                include: {
                    stops: { orderBy: { sequence: 'asc' }, include: { lines: true } },
                },
            })
            const dropoff = trip.stops.find((s) => s.stopType === 'TO')!

            let returnRequestNumber: string | null = null

            if (!isLive && sc.laterReturn) {
                const rr = await prisma.sdReturnRequest.create({
                    data: {
                        requestNumber: c.returnNo,
                        companyId: company.id,
                        salesOrderId: order.id,
                        customerId: customer.id,
                        status: 'REQUESTED',
                        reason: 'DAMAGED_ITEM',
                        conditionNote: `Hidden damage found after delivery: ${sc.laterReturn.qty} of ${sc.orderQty} units (seeded)`,
                        preferredResolution: sc.laterReturn.resolution,
                        refundStatus: 'NONE',
                        branchId: null,
                        warehouseId: warehouse.id,
                        requestedBy: customer.id,
                        lines: {
                            create: {
                                salesOrderLineId: orderLine.id,
                                materialId: material.id,
                                quantity: new Decimal(sc.laterReturn.qty),
                                reason: 'DAMAGED_ITEM',
                                disposition: 'QUALITY_HOLD',
                            },
                        },
                    },
                })
                returnRequestNumber = rr.requestNumber
            }

            const flag = sc.laterReturn
                ? sc.laterReturn.resolution === 'REPLACEMENT'
                    ? 'ORANGE (Replace request)'
                    : 'RED (Refund request)'
                : 'none'

            const row = {
                key: sc.key,
                mode: isLive ? 'LIVE_DRIVER' : 'PRE_COMPLETED',
                salesOrder: order.orderNumber,
                shipment: shipment.reference,
                trip: trip.code,
                dropoffStopId: dropoff.id,
                dropoffStatus: dropoff.status,
                orderQty: sc.orderQty,
                acceptedQty: accepted,
                codAmount: codDue,
                paymentStatus: isLive ? 'Pending Collection' : 'Paid',
                customerReturn: returnRequestNumber,
                flag,
                nextStep: isLive
                    ? 'Driver app → deliver (accept all) → collect COD'
                    : sc.laterReturn?.resolution === 'REPLACEMENT'
                      ? 'Customer Returns → Replace request → child SO pick/pack'
                      : 'Customer Returns → Refund request → receive/inspect → refund',
            }
            summary.push(row)
            console.log(
                `${sc.key}: ${order.orderNumber} · ${shipment.reference} · ${trip.code} [${trip.status}] stop=${dropoff.status}` +
                    (returnRequestNumber ? ` · ${returnRequestNumber}` : ''),
            )
        }

        console.log('\n✅ COD delivery demo seeded.\n')
        console.table(summary)
        console.log('Driver login: driver01 (see SCM seed for password)')
        console.log(
            'Admin: Customer Returns → RET-COD-DEMO-RPL (Replace) / RET-COD-DEMO-RFD (Refund)',
        )
    } finally {
        await prisma.$disconnect()
    }
}

type Codes = ReturnType<typeof codes>

async function cleanup(prisma: PrismaClient, c: Codes) {
    const rr = await prisma.sdReturnRequest.findUnique({
        where: { requestNumber: c.returnNo },
        select: { id: true, mmCustomerReturnId: true },
    })
    if (rr) {
        await prisma.sdRefund.deleteMany({ where: { returnRequestId: rr.id } })
        if (rr.mmCustomerReturnId) {
            const crId = rr.mmCustomerReturnId
            await prisma.mmReturnDisposition.deleteMany({
                where: { legacyCustomerReturnId: crId },
            })
            await prisma.mmReturnInspection.deleteMany({
                where: { legacyCustomerReturnId: crId },
            })
            await prisma.mmCustomerReturnIntake.deleteMany({
                where: { legacyCustomerReturnId: crId },
            })
            await prisma.mmCustomerReturnAudit.deleteMany({ where: { returnId: crId } })
            await prisma.mmCustomerReturnLine.deleteMany({ where: { returnId: crId } })
            await prisma.mmCustomerReturn.deleteMany({ where: { id: crId } })
        }
        await prisma.sdReturnRequestLine.deleteMany({ where: { returnRequestId: rr.id } })
        await prisma.sdReturnRequest.delete({ where: { id: rr.id } })
    }

    await prisma.damageReportAudit.deleteMany({
        where: { report: { reference: c.damageRef } },
    })
    await prisma.damageReport.deleteMany({ where: { reference: c.damageRef } })

    const trip = await prisma.trip.findUnique({
        where: { code: c.tripCode },
        select: { id: true, loadPlanId: true },
    })
    if (trip) {
        await prisma.tripStopEvent.deleteMany({ where: { tripId: trip.id } })
        await prisma.gpsLog.deleteMany({ where: { tripId: trip.id } })
        await prisma.trip.delete({ where: { id: trip.id } })
    }
    await prisma.loadPlan.deleteMany({ where: { code: c.loadPlanCode } })

    await prisma.shipmentLine.deleteMany({ where: { shipment: { reference: c.shipRef } } })
    await prisma.shipment.deleteMany({ where: { reference: c.shipRef } })

    const pkg = await prisma.wmPackage.findUnique({ where: { packageNumber: c.pkgNo } })
    if (pkg) {
        await prisma.wmPackageItem.deleteMany({ where: { packageId: pkg.id } })
        await prisma.wmPackage.delete({ where: { id: pkg.id } })
    }
    await prisma.wmPickingTask.deleteMany({ where: { taskNumber: c.pickNo } })
    await prisma.mmInventoryReservationLine.deleteMany({
        where: { header: { reservationNumber: c.resNo } },
    })
    await prisma.mmInventoryReservationHeader.deleteMany({
        where: { reservationNumber: c.resNo },
    })

    const so = await prisma.sdSalesOrder.findUnique({
        where: { orderNumber: c.orderNo },
        select: { id: true },
    })
    if (so) {
        await prisma.sdSalesOrderPayment.deleteMany({ where: { salesOrderId: so.id } })
        await prisma.sdSalesInvoice.deleteMany({ where: { salesOrderId: so.id } })
        await prisma.sdSalesOrderLine.deleteMany({ where: { salesOrderId: so.id } })
        await prisma.sdSalesOrder.delete({ where: { id: so.id } })
    }
    await prisma.sdCustomer.deleteMany({ where: { customerNumber: c.customerNo } })
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
