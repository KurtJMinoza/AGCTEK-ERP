import { PrismaClient, ShipmentStatus } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

/** READY_FOR_DISPATCH MM packages linked to SCM READY shipments (demo handoff). */
export async function seedMmScmHandoff(prisma: PrismaClient) {
    const warehouse = await prisma.warehouse.findUnique({ where: { code: 'MAIN' } })
    const material = await prisma.mmMaterial.findUnique({
        where: { materialCode: 'MAT-STEEL-001' },
    })
    if (!warehouse || !material) {
        return { packages: 0, shipments: 0 }
    }

    const defs = [
        {
            packageNumber: 'PKG-SCM-LZN-001',
            reference: 'SHP-SCM-LZN-001',
            orderNumber: 'SO-SCM-LZN-001',
            destAddress: 'EDSA, Cubao, Quezon City',
            destLat: 14.6191,
            destLng: 121.0567,
            qty: 10,
        },
        {
            packageNumber: 'PKG-SCM-VIS-001',
            reference: 'SHP-SCM-VIS-001',
            orderNumber: 'SO-SCM-VIS-001',
            destAddress: 'Highway Road, Mandaue City, Cebu',
            destLat: 10.3333,
            destLng: 123.9333,
            qty: 8,
        },
        {
            packageNumber: 'PKG-SCM-MIN-001',
            reference: 'SHP-SCM-MIN-001',
            orderNumber: 'SO-SCM-MIN-001',
            destAddress: 'JP Laurel Ave, Bajada, Davao City',
            destLat: 7.0863,
            destLng: 125.6112,
            qty: 12,
        },
    ]

    let packages = 0
    let shipments = 0

    for (const d of defs) {
        const pkg = await prisma.wmPackage.upsert({
            where: { packageNumber: d.packageNumber },
            update: {
                status: 'READY_FOR_DISPATCH',
                shipToAddress: d.destAddress,
                shipToLat: d.destLat,
                shipToLng: d.destLng,
            },
            create: {
                packageNumber: d.packageNumber,
                warehouseId: warehouse.id,
                orderNumber: d.orderNumber,
                packageType: 'PALLET',
                status: 'READY_FOR_DISPATCH',
                shipToName: 'Demo customer',
                shipToAddress: d.destAddress,
                shipToLat: d.destLat,
                shipToLng: d.destLng,
                items: {
                    create: [
                        {
                            materialId: material.id,
                            expectedQty: d.qty,
                            scannedQty: d.qty,
                            status: 'SCANNED',
                        },
                    ],
                },
            },
        })
        packages++

        const existingSh = await prisma.shipment.findUnique({
            where: { reference: d.reference },
        })
        if (!existingSh) {
            await prisma.shipment.create({
                data: {
                    reference: d.reference,
                    customerName: 'Demo customer',
                    originAddress: warehouse.address ?? 'Main Warehouse',
                    destAddress: d.destAddress,
                    destLat: d.destLat,
                    destLng: d.destLng,
                    quantity: d.qty,
                    weightKg: 25,
                    packageId: pkg.id,
                    externalOrderId: d.orderNumber,
                    status: ShipmentStatus.READY,
                },
            })
            shipments++
        } else if (!existingSh.packageId) {
            await prisma.shipment.update({
                where: { id: existingSh.id },
                data: { packageId: pkg.id, status: ShipmentStatus.READY },
            })
            shipments++
        }
    }

    return { packages, shipments }
}
