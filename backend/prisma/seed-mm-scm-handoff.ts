import {
    PrismaClient,
    ShipmentMovementType,
    ShipmentStatus,
} from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

type HubDest = {
    packageNumber: string
    orderNumber: string
    shipToName: string
    shipToAddress: string
    shipToLat: number
    shipToLng: number
    qty: number
    region: 'Luzon' | 'Visayas' | 'Mindanao'
}

const HANDOFF_PACKAGES: HubDest[] = [
    {
        packageNumber: 'PKG-SCM-LZN-001',
        orderNumber: 'SO-SCM-LZN-001',
        shipToName: 'Metro Build Supply — Quezon City',
        shipToAddress: 'EDSA, Cubao, Quezon City',
        shipToLat: 14.6191,
        shipToLng: 121.0567,
        qty: 10,
        region: 'Luzon',
    },
    {
        packageNumber: 'PKG-SCM-VIS-001',
        orderNumber: 'SO-SCM-VIS-001',
        shipToName: 'BuildRight Hardware — Mandaue',
        shipToAddress: 'Highway Road, Mandaue City, Cebu',
        shipToLat: 10.3333,
        shipToLng: 123.9333,
        qty: 8,
        region: 'Visayas',
    },
    {
        packageNumber: 'PKG-SCM-MIN-001',
        orderNumber: 'SO-SCM-MIN-001',
        shipToName: 'Davao BuildMart — Bajada',
        shipToAddress: 'JP Laurel Ave, Bajada, Davao City',
        shipToLat: 7.0863,
        shipToLng: 125.6112,
        qty: 12,
        region: 'Mindanao',
    },
]

/**
 * Seeds the true MM → SCM outbound handoff:
 * VERIFIED pack → READY_FOR_DISPATCH package (+ ship-to) → READY shipment (packageId linked)
 * with pickingTask.sourceBinId + MmInventoryBalance so trip start can post GI.
 */
export async function seedMmScmHandoff(prisma: PrismaClient) {
    console.log('Seeding MM → SCM handoff packages …')

    const company = await prisma.company.findUnique({ where: { code: 'AGCTEK' } })
    const warehouse = await prisma.warehouse.findUnique({ where: { code: 'MAIN' } })
    const material = await prisma.mmMaterial.findUnique({
        where: { materialCode: 'MAT-STEEL-001' },
    })
    const bin = await prisma.wmStorageBin.findFirst({
        where: { code: 'A01-01-001' },
    })

    if (!company || !warehouse || !material || !bin) {
        console.log(
            'Skipping MM→SCM handoff seed — company/warehouse/material/bin missing (run MM org seed first).',
        )
        return { packages: 0, shipments: 0 }
    }

    // Align MAIN warehouse ship-from with Luzon hub for map / load-plan demos
    await prisma.warehouse.update({
        where: { id: warehouse.id },
        data: {
            address: 'AGC Luzon Hub, North Harbor, Manila',
            status: 'ACTIVE',
        },
    })

    // Ensure enough UNRESTRICTED stock for GI on trip start
    const stockNeed = HANDOFF_PACKAGES.reduce((sum, p) => sum + p.qty, 0) + 50
    const bal = await prisma.mmInventoryBalance.findFirst({
        where: {
            companyId: company.id,
            warehouseId: warehouse.id,
            storageBinId: bin.id,
            materialId: material.id,
            batchId: null,
            serialNumberId: null,
            stockStatus: 'UNRESTRICTED',
        },
    })
    if (bal) {
        const available = Number(bal.availableQuantity)
        if (available < stockNeed) {
            const add = new Decimal(stockNeed - available)
            await prisma.mmInventoryBalance.update({
                where: { id: bal.id },
                data: {
                    quantity: bal.quantity.add(add),
                    availableQuantity: bal.availableQuantity.add(add),
                },
            })
        }
    } else {
        await prisma.mmInventoryBalance.create({
            data: {
                companyId: company.id,
                warehouseId: warehouse.id,
                storageBinId: bin.id,
                materialId: material.id,
                stockStatus: 'UNRESTRICTED',
                quantity: stockNeed,
                reservedQuantity: 0,
                availableQuantity: stockNeed,
            },
        })
    }

    let packageCount = 0
    let shipmentCount = 0

    for (const row of HANDOFF_PACKAGES) {
        const taskNumber = `PK-${row.packageNumber}`
        let pickingTask = await prisma.wmPickingTask.findFirst({
            where: { taskNumber },
        })
        if (!pickingTask) {
            pickingTask = await prisma.wmPickingTask.create({
                data: {
                    taskNumber,
                    warehouseId: warehouse.id,
                    sourceBinId: bin.id,
                    materialId: material.id,
                    requiredQty: row.qty,
                    pickedQty: row.qty,
                    status: 'COMPLETED',
                    priority: 5,
                    completedAt: new Date(),
                },
            })
        } else {
            pickingTask = await prisma.wmPickingTask.update({
                where: { id: pickingTask.id },
                data: {
                    sourceBinId: bin.id,
                    materialId: material.id,
                    requiredQty: row.qty,
                    pickedQty: row.qty,
                    status: 'COMPLETED',
                },
            })
        }

        let pkg = await prisma.wmPackage.findUnique({
            where: { packageNumber: row.packageNumber },
            include: { items: true, shipment: true },
        })

        if (pkg && ['DISPATCHED'].includes(pkg.status) && pkg.shipment) {
            // Already past handoff — leave alone
            continue
        }

        if (!pkg) {
            pkg = await prisma.wmPackage.create({
                data: {
                    packageNumber: row.packageNumber,
                    orderNumber: row.orderNumber,
                    warehouseId: warehouse.id,
                    pickingTaskId: pickingTask.id,
                    packageType: 'PALLET',
                    weight: row.qty * 2.5,
                    carrier: 'AGC Fleet',
                    shipToName: row.shipToName,
                    shipToAddress: row.shipToAddress,
                    shipToLat: row.shipToLat,
                    shipToLng: row.shipToLng,
                    status: 'READY_FOR_DISPATCH',
                    items: {
                        create: [
                            {
                                materialId: material.id,
                                expectedQty: row.qty,
                                scannedQty: row.qty,
                                status: 'MATCHED',
                            },
                        ],
                    },
                },
                include: { items: true, shipment: true },
            })
        } else if (
            pkg.status === 'READY_FOR_DISPATCH' ||
            pkg.status === 'OPEN' ||
            pkg.status === 'VERIFIED' ||
            pkg.status === 'SEALED'
        ) {
            await prisma.wmPackageItem.deleteMany({ where: { packageId: pkg.id } })
            pkg = await prisma.wmPackage.update({
                where: { id: pkg.id },
                data: {
                    orderNumber: row.orderNumber,
                    pickingTaskId: pickingTask.id,
                    packageType: 'PALLET',
                    weight: row.qty * 2.5,
                    carrier: 'AGC Fleet',
                    shipToName: row.shipToName,
                    shipToAddress: row.shipToAddress,
                    shipToLat: row.shipToLat,
                    shipToLng: row.shipToLng,
                    status: 'READY_FOR_DISPATCH',
                    items: {
                        create: [
                            {
                                materialId: material.id,
                                expectedQty: row.qty,
                                scannedQty: row.qty,
                                status: 'MATCHED',
                            },
                        ],
                    },
                },
                include: { items: true, shipment: true },
            })
        }

        packageCount += 1

        // Idempotent SCM release (mirrors ShipmentsService.createFromPackage)
        const existingShipment = await prisma.shipment.findUnique({
            where: { packageId: pkg.id },
        })
        if (existingShipment) {
            if (
                existingShipment.status === ShipmentStatus.DRAFT ||
                existingShipment.status === ShipmentStatus.READY
            ) {
                await prisma.shipment.update({
                    where: { id: existingShipment.id },
                    data: {
                        customerName: row.shipToName,
                        externalOrderId: row.orderNumber,
                        materialCode: 'MAT-STEEL-001',
                        description: `Package ${row.packageNumber}: MAT-STEEL-001`,
                        originAddress: 'AGC Luzon Hub, North Harbor, Manila',
                        originLat: 14.6085,
                        originLng: 120.9645,
                        destAddress: row.shipToAddress,
                        destLat: row.shipToLat,
                        destLng: row.shipToLng,
                        quantity: row.qty,
                        weightKg: row.qty * 2.5,
                        movementType: ShipmentMovementType.DELIVERY,
                        status: ShipmentStatus.READY,
                        notes: `MM→SCM handoff seed · ${row.region} · Carrier: AGC Fleet`,
                        earliestDeliveryAt: daysFromNow(1, 8),
                        latestDeliveryAt: daysFromNow(2, 17),
                    },
                })
            }
            shipmentCount += 1
            continue
        }

        const reference = `MM-${row.packageNumber}`
        await prisma.shipment.create({
            data: {
                reference,
                customerName: row.shipToName,
                externalOrderId: row.orderNumber,
                materialCode: 'MAT-STEEL-001',
                description: `Package ${row.packageNumber}: MAT-STEEL-001`,
                packageId: pkg.id,
                originAddress: 'AGC Luzon Hub, North Harbor, Manila',
                originLat: 14.6085,
                originLng: 120.9645,
                destAddress: row.shipToAddress,
                destLat: row.shipToLat,
                destLng: row.shipToLng,
                quantity: row.qty,
                weightKg: row.qty * 2.5,
                volumeM3: 0,
                movementType: ShipmentMovementType.DELIVERY,
                status: ShipmentStatus.READY,
                notes: `MM→SCM handoff seed · ${row.region} · Carrier: AGC Fleet`,
                earliestDeliveryAt: daysFromNow(1, 8),
                latestDeliveryAt: daysFromNow(2, 17),
            },
        })
        shipmentCount += 1
    }

    console.log(
        `Seeded ${packageCount} READY_FOR_DISPATCH packages → ${shipmentCount} package-linked READY shipments (PKG-SCM-*).`,
    )
    return { packages: packageCount, shipments: shipmentCount }
}

function daysFromNow(days: number, hour: number): Date {
    const d = new Date()
    d.setDate(d.getDate() + days)
    d.setHours(hour, 0, 0, 0)
    return d
}
