import {
    GeofenceKind,
    MaintenanceStatus,
    MaintenanceType,
    PrismaClient,
    ShipmentMovementType,
    ShipmentStatus,
} from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

/** Demo hub / warehouse (MM ship-from) — Luzon. */
const HUB_LUZON = {
    address: 'AGC Luzon Hub, North Harbor, Manila',
    lat: 14.6085,
    lng: 120.9645,
}

/** Demo hub / warehouse (MM ship-from) — Visayas. */
const HUB_VISAYAS = {
    address: 'AGC Logistics Hub, Cebu Business Park, Cebu City',
    lat: 10.3181,
    lng: 123.9054,
}

/** Demo hub / warehouse (MM ship-from) — Mindanao. */
const HUB_MINDANAO = {
    address: 'AGC Mindanao Hub, JP Laurel Ave, Davao City',
    lat: 7.0905,
    lng: 125.6082,
}

/** Circular HUB geofences matching shipment ship-from origins. */
const hubGeofences = [
    {
        code: 'HUB-LUZON',
        name: 'AGC Luzon Hub — Manila',
        kind: GeofenceKind.HUB,
        lat: HUB_LUZON.lat,
        lng: HUB_LUZON.lng,
        radiusM: 900,
        color: '#38bdf8',
        notes: HUB_LUZON.address,
    },
    {
        code: 'HUB-VISAYAS',
        name: 'AGC Logistics Hub — Cebu',
        kind: GeofenceKind.HUB,
        lat: HUB_VISAYAS.lat,
        lng: HUB_VISAYAS.lng,
        radiusM: 900,
        color: '#34d399',
        notes: HUB_VISAYAS.address,
    },
    {
        code: 'HUB-MINDANAO',
        name: 'AGC Mindanao Hub — Davao',
        kind: GeofenceKind.HUB,
        lat: HUB_MINDANAO.lat,
        lng: HUB_MINDANAO.lng,
        radiusM: 900,
        color: '#fbbf24',
        notes: HUB_MINDANAO.address,
    },
] as const

/**
 * Packed / Ready-to-Ship orders as if released from MM → SCM.
 * Upserts by `reference` so re-running the seed is safe.
 * 5 READY each for Luzon / Visayas / Mindanao — mixed DELIVERY + PICKUP.
 */
const mmReadyShipments = [
    // —— Luzon ——
    {
        reference: 'MM-PKG-3001',
        externalOrderId: 'SO-47003001',
        materialCode: 'MAT-CEMENT-50KG',
        customerName: 'Metro Build Supply — Quezon City',
        description: 'Palletized cement — Luzon lane',
        movementType: ShipmentMovementType.DELIVERY,
        originAddress: HUB_LUZON.address,
        originLat: HUB_LUZON.lat,
        originLng: HUB_LUZON.lng,
        destAddress: 'EDSA, Cubao, Quezon City',
        destLat: 14.6191,
        destLng: 121.0567,
        quantity: 42,
        earliestDeliveryAt: daysFromNow(1, 8),
        latestDeliveryAt: daysFromNow(1, 16),
        notes: 'Seeded from MM packed-order stub · Luzon',
    },
    {
        reference: 'MM-PKG-3002',
        externalOrderId: 'SO-47003002',
        materialCode: 'MAT-RTN-PALLET',
        customerName: 'Cavite Steel Depot — Bacoor',
        description: 'Empty pallet pickup → Luzon hub',
        movementType: ShipmentMovementType.PICKUP,
        originAddress: 'Aguinaldo Highway, Bacoor, Cavite',
        originLat: 14.459,
        originLng: 120.94,
        destAddress: HUB_LUZON.address,
        destLat: HUB_LUZON.lat,
        destLng: HUB_LUZON.lng,
        quantity: 12,
        earliestDeliveryAt: daysFromNow(1, 9),
        latestDeliveryAt: daysFromNow(1, 15),
        notes: 'Seeded from MM return/pickup stub · Luzon',
    },
    {
        reference: 'MM-PKG-3003',
        externalOrderId: 'SO-47003003',
        materialCode: 'MAT-PIPE-PVC-4IN',
        customerName: 'Laguna Plumbing Hub — Calamba',
        description: 'PVC pipe packs',
        movementType: ShipmentMovementType.DELIVERY,
        originAddress: HUB_LUZON.address,
        originLat: HUB_LUZON.lat,
        originLng: HUB_LUZON.lng,
        destAddress: 'National Highway, Calamba, Laguna',
        destLat: 14.2118,
        destLng: 121.1651,
        quantity: 20,
        earliestDeliveryAt: daysFromNow(2, 8),
        latestDeliveryAt: daysFromNow(2, 14),
        notes: 'Seeded from MM packed-order stub · Luzon',
    },
    {
        reference: 'MM-PKG-3004',
        externalOrderId: 'SO-47003004',
        materialCode: 'MAT-TILE-CER-60',
        customerName: 'Clark HomeTile — Angeles',
        description: 'Ceramic tile cartons',
        movementType: ShipmentMovementType.DELIVERY,
        originAddress: HUB_LUZON.address,
        originLat: HUB_LUZON.lat,
        originLng: HUB_LUZON.lng,
        destAddress: 'MacArthur Highway, Angeles City, Pampanga',
        destLat: 15.145,
        destLng: 120.5887,
        quantity: 35,
        earliestDeliveryAt: daysFromNow(2, 10),
        latestDeliveryAt: daysFromNow(2, 17),
        notes: 'Seeded from MM packed-order stub · Luzon',
    },
    {
        reference: 'MM-PKG-3005',
        externalOrderId: 'SO-47003005',
        materialCode: 'MAT-RTN-DRUM',
        customerName: 'Batangas ColorMax — Lipa',
        description: 'Empty drum return → Luzon hub',
        movementType: ShipmentMovementType.PICKUP,
        originAddress: 'JP Laurel Highway, Lipa City, Batangas',
        originLat: 13.9411,
        originLng: 121.1631,
        destAddress: HUB_LUZON.address,
        destLat: HUB_LUZON.lat,
        destLng: HUB_LUZON.lng,
        quantity: 8,
        earliestDeliveryAt: daysFromNow(3, 9),
        latestDeliveryAt: daysFromNow(3, 15),
        notes: 'Seeded from MM return/pickup stub · Luzon',
    },

    // —— Visayas ——
    {
        reference: 'MM-PKG-1001',
        externalOrderId: 'SO-45001234',
        materialCode: 'MAT-CEMENT-50KG',
        customerName: 'BuildRight Hardware — Mandaue',
        description: 'Bagged bags — palletized cement',
        movementType: ShipmentMovementType.DELIVERY,
        originAddress: HUB_VISAYAS.address,
        originLat: HUB_VISAYAS.lat,
        originLng: HUB_VISAYAS.lng,
        destAddress: 'Highway Road, Mandaue City, Cebu',
        destLat: 10.3333,
        destLng: 123.9333,
        quantity: 40,
        earliestDeliveryAt: daysFromNow(1, 8),
        latestDeliveryAt: daysFromNow(1, 17),
        notes: 'Seeded from MM packed-order stub · Visayas',
    },
    {
        reference: 'MM-PKG-1002',
        externalOrderId: 'SO-45001235',
        materialCode: 'MAT-REBAR-12MM',
        customerName: 'Metro Steel Depot — Consolacion',
        description: 'Cut rebar bundles',
        movementType: ShipmentMovementType.DELIVERY,
        originAddress: HUB_VISAYAS.address,
        originLat: HUB_VISAYAS.lat,
        originLng: HUB_VISAYAS.lng,
        destAddress: 'Cansaga Road, Consolacion, Cebu',
        destLat: 10.3765,
        destLng: 123.9578,
        quantity: 25,
        earliestDeliveryAt: daysFromNow(1, 9),
        latestDeliveryAt: daysFromNow(1, 15),
        notes: 'Seeded from MM packed-order stub · Visayas',
    },
    {
        reference: 'MM-PKG-1003',
        externalOrderId: 'SO-45001240',
        materialCode: 'MAT-RTN-PALLET',
        customerName: 'AquaFlow Plumbing — Lapu-Lapu',
        description: 'Empty pallet pickup → Visayas hub',
        movementType: ShipmentMovementType.PICKUP,
        originAddress: 'MEPZ Area, Lapu-Lapu City, Cebu',
        originLat: 10.3103,
        originLng: 123.9494,
        destAddress: HUB_VISAYAS.address,
        destLat: HUB_VISAYAS.lat,
        destLng: HUB_VISAYAS.lng,
        quantity: 10,
        earliestDeliveryAt: daysFromNow(2, 8),
        latestDeliveryAt: daysFromNow(2, 12),
        notes: 'Seeded from MM return/pickup stub · Visayas',
    },
    {
        reference: 'MM-PKG-1004',
        externalOrderId: 'SO-45001241',
        materialCode: 'MAT-TILE-CER-60',
        customerName: 'HomeTile Center — Talisay',
        description: 'Ceramic tile cartons',
        movementType: ShipmentMovementType.DELIVERY,
        originAddress: HUB_VISAYAS.address,
        originLat: HUB_VISAYAS.lat,
        originLng: HUB_VISAYAS.lng,
        destAddress: 'Natalio Bacalso Ave, Talisay City, Cebu',
        destLat: 10.2447,
        destLng: 123.8494,
        quantity: 32,
        earliestDeliveryAt: daysFromNow(2, 13),
        latestDeliveryAt: daysFromNow(2, 18),
        notes: 'Seeded from MM packed-order stub · Visayas',
    },
    {
        reference: 'MM-PKG-1005',
        externalOrderId: 'SO-45001250',
        materialCode: 'MAT-RTN-CRATE',
        customerName: 'ColorMax Paint — Cebu City',
        description: 'Empty crate return → Visayas hub',
        movementType: ShipmentMovementType.PICKUP,
        originAddress: 'Colon Street, Cebu City',
        originLat: 10.2975,
        originLng: 123.9015,
        destAddress: HUB_VISAYAS.address,
        destLat: HUB_VISAYAS.lat,
        destLng: HUB_VISAYAS.lng,
        quantity: 6,
        earliestDeliveryAt: daysFromNow(3, 9),
        latestDeliveryAt: daysFromNow(3, 16),
        notes: 'Seeded from MM return/pickup stub · Visayas',
    },

    // —— Mindanao ——
    {
        reference: 'MM-PKG-2001',
        externalOrderId: 'SO-46002001',
        materialCode: 'MAT-CEMENT-50KG',
        customerName: 'Davao BuildMart — Bajada',
        description: 'Palletized cement — Mindanao lane',
        movementType: ShipmentMovementType.DELIVERY,
        originAddress: HUB_MINDANAO.address,
        originLat: HUB_MINDANAO.lat,
        originLng: HUB_MINDANAO.lng,
        destAddress: 'JP Laurel Ave, Bajada, Davao City',
        destLat: 7.0863,
        destLng: 125.6112,
        quantity: 45,
        earliestDeliveryAt: daysFromNow(1, 8),
        latestDeliveryAt: daysFromNow(1, 16),
        notes: 'Seeded from MM packed-order stub · Mindanao',
    },
    {
        reference: 'MM-PKG-2002',
        externalOrderId: 'SO-46002002',
        materialCode: 'MAT-RTN-PALLET',
        customerName: 'Northern Mindanao Steel — CDO',
        description: 'Empty pallet pickup → Mindanao hub',
        movementType: ShipmentMovementType.PICKUP,
        originAddress: 'Masterson Avenue, Cagayan de Oro City',
        originLat: 8.4542,
        originLng: 124.6319,
        destAddress: HUB_MINDANAO.address,
        destLat: HUB_MINDANAO.lat,
        destLng: HUB_MINDANAO.lng,
        quantity: 14,
        earliestDeliveryAt: daysFromNow(2, 8),
        latestDeliveryAt: daysFromNow(2, 17),
        notes: 'Seeded from MM return/pickup stub · Mindanao',
    },
    {
        reference: 'MM-PKG-2003',
        externalOrderId: 'SO-46002003',
        materialCode: 'MAT-ROOF-GI-12FT',
        customerName: 'Gensan Roofing Supply — Lagao',
        description: 'GI roofing sheets',
        movementType: ShipmentMovementType.DELIVERY,
        originAddress: HUB_MINDANAO.address,
        originLat: HUB_MINDANAO.lat,
        originLng: HUB_MINDANAO.lng,
        destAddress: 'Lagao Road, General Santos City',
        destLat: 6.1164,
        destLng: 125.1716,
        quantity: 22,
        earliestDeliveryAt: daysFromNow(2, 9),
        latestDeliveryAt: daysFromNow(2, 15),
        notes: 'Seeded from MM packed-order stub · Mindanao',
    },
    {
        reference: 'MM-PKG-2004',
        externalOrderId: 'SO-46002004',
        materialCode: 'MAT-LUMBER-2X4',
        customerName: 'Zambo Timber Hub — Tetuan',
        description: 'Kiln-dried lumber packs',
        movementType: ShipmentMovementType.DELIVERY,
        originAddress: HUB_MINDANAO.address,
        originLat: HUB_MINDANAO.lat,
        originLng: HUB_MINDANAO.lng,
        destAddress: 'Veterans Avenue, Zamboanga City',
        destLat: 6.9214,
        destLng: 122.079,
        quantity: 28,
        earliestDeliveryAt: daysFromNow(3, 8),
        latestDeliveryAt: daysFromNow(3, 16),
        notes: 'Seeded from MM packed-order stub · Mindanao',
    },
    {
        reference: 'MM-PKG-2005',
        externalOrderId: 'SO-46002005',
        materialCode: 'MAT-RTN-PIPE',
        customerName: 'Caraga Pipe Works — Butuan',
        description: 'Scrap pipe return → Mindanao hub',
        movementType: ShipmentMovementType.PICKUP,
        originAddress: 'JC Aquino Avenue, Butuan City',
        originLat: 8.9475,
        originLng: 125.5406,
        destAddress: HUB_MINDANAO.address,
        destLat: HUB_MINDANAO.lat,
        destLng: HUB_MINDANAO.lng,
        quantity: 9,
        earliestDeliveryAt: daysFromNow(3, 9),
        latestDeliveryAt: daysFromNow(3, 14),
        notes: 'Seeded from MM return/pickup stub · Mindanao',
    },
]

/** Fisher–Yates — mix region + DELIVERY/PICKUP insert order each seed run. */
function shuffleInPlace<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[items[i], items[j]] = [items[j], items[i]]
    }
    return items
}

function daysFromNow(days: number, hour: number): Date {
    const d = new Date()
    d.setDate(d.getDate() + days)
    d.setHours(hour, 0, 0, 0)
    return d
}

async function main() {
    let hubUpserted = 0
    for (const row of hubGeofences) {
        await prisma.geofence.upsert({
            where: { code: row.code },
            create: {
                code: row.code,
                name: row.name,
                kind: row.kind,
                lat: row.lat,
                lng: row.lng,
                radiusM: row.radiusM,
                color: row.color,
                notes: row.notes,
                active: true,
            },
            update: {
                name: row.name,
                kind: row.kind,
                lat: row.lat,
                lng: row.lng,
                radiusM: row.radiusM,
                color: row.color,
                notes: row.notes,
                active: true,
            },
        })
        hubUpserted += 1
    }

    const shuffled = shuffleInPlace([...mmReadyShipments])
    let upserted = 0
    let pickups = 0
    let deliveries = 0

    for (const row of shuffled) {
        await prisma.shipment.upsert({
            where: { reference: row.reference },
            create: {
                reference: row.reference,
                externalOrderId: row.externalOrderId,
                materialCode: row.materialCode,
                customerName: row.customerName,
                description: row.description,
                movementType: row.movementType,
                originAddress: row.originAddress,
                originLat: row.originLat,
                originLng: row.originLng,
                destAddress: row.destAddress,
                destLat: row.destLat,
                destLng: row.destLng,
                quantity: row.quantity,
                earliestDeliveryAt: row.earliestDeliveryAt,
                latestDeliveryAt: row.latestDeliveryAt,
                notes: row.notes,
                isFragile: 'isFragile' in row ? Boolean(row.isFragile) : false,
                status: ShipmentStatus.READY,
            },
            update: {
                externalOrderId: row.externalOrderId,
                materialCode: row.materialCode,
                customerName: row.customerName,
                description: row.description,
                movementType: row.movementType,
                originAddress: row.originAddress,
                originLat: row.originLat,
                originLng: row.originLng,
                destAddress: row.destAddress,
                destLat: row.destLat,
                destLng: row.destLng,
                quantity: row.quantity,
                earliestDeliveryAt: row.earliestDeliveryAt,
                latestDeliveryAt: row.latestDeliveryAt,
                notes: row.notes,
                isFragile: 'isFragile' in row ? Boolean(row.isFragile) : false,
            },
        })
        upserted += 1
        if (row.movementType === ShipmentMovementType.PICKUP) pickups += 1
        else deliveries += 1
    }

    // Ensure seed refs that are still pool-eligible stay READY (do not touch ASSIGNED+)
    await prisma.shipment.updateMany({
        where: {
            reference: { in: mmReadyShipments.map((s) => s.reference) },
            status: { in: [ShipmentStatus.DRAFT, ShipmentStatus.READY] },
        },
        data: { status: ShipmentStatus.READY },
    })

    console.log(
        `Seeded ${hubUpserted} hub geofences (HUB-LUZON / HUB-VISAYAS / HUB-MINDANAO).`,
    )
    console.log(
        `Seeded ${upserted} READY shipments (${deliveries} DELIVERY + ${pickups} PICKUP), shuffled insert order.`,
    )

    // Demo driver for Expo app (apps/driver)
    const driverUserName = 'driver01'
    const driverEmail = 'driver01@agctek.local'
    const passwordHash = await bcrypt.hash('123Qwe', 10)
    const driverUser = await prisma.user.upsert({
        where: { userName: driverUserName },
        create: {
            email: driverEmail,
            userName: driverUserName,
            passwordHash,
            role: 'admin',
        },
        update: {
            passwordHash,
        },
    })

    const licenseExpiry = new Date()
    licenseExpiry.setFullYear(licenseExpiry.getFullYear() + 2)

    await prisma.driver.upsert({
        where: { userId: driverUser.id },
        create: {
            userId: driverUser.id,
            employeeCode: 'DRV-001',
            firstName: 'Juan',
            lastName: 'Reyes',
            licenseNumber: 'D-L01-SEED-001',
            licenseExpiry,
            phone: '+63 917 000 0001',
            status: 'AVAILABLE',
        },
        update: {
            firstName: 'Juan',
            lastName: 'Reyes',
            phone: '+63 917 000 0001',
            employeeCode: 'DRV-001',
        },
    })

    console.log(
        'Seeded driver user driver01 / 123Qwe (linked Driver profile for Expo app).',
    )

    // Sample preventative maintenance (blocks routing) on first vehicle if any
    const seedVehicle = await prisma.vehicle.findFirst({
        orderBy: { createdAt: 'asc' },
    })
    if (seedVehicle) {
        // VL502: same IMEI in Traccar Devices uniqueId and Vehicle.telematicsDeviceId
        const seedImei = process.env.SEED_VL502_IMEI?.trim()
        if (seedImei && seedVehicle.telematicsDeviceId !== seedImei) {
            await prisma.vehicle.update({
                where: { id: seedVehicle.id },
                data: { telematicsDeviceId: seedImei },
            })
            seedVehicle.telematicsDeviceId = seedImei
            console.log(
                `Set ${seedVehicle.plateNumber}.telematicsDeviceId = ${seedImei} (flespi: use 14-digit ident). See docs/SCM_FLESPI_VL502.md`,
            )
        } else if (!seedVehicle.telematicsDeviceId) {
            console.log(
                'Tip: set SEED_VL502_IMEI to flespi 14-digit ident (or full IMEI). See docs/SCM_FLESPI_VL502.md',
            )
        }

        const title = 'Seed PM — oil & filter service'
        const existingMaint = await prisma.maintenanceRecord.findFirst({
            where: { vehicleId: seedVehicle.id, title },
        })
        if (!existingMaint) {
            await prisma.maintenanceRecord.create({
                data: {
                    vehicleId: seedVehicle.id,
                    type: MaintenanceType.PREVENTATIVE,
                    status: MaintenanceStatus.SCHEDULED,
                    title,
                    description:
                        'Demo preventative job from prisma seed. Blocks routing until completed/cancelled.',
                    odometerKm: seedVehicle.odometerKm,
                    scheduledAt: new Date(),
                    blocksRouting: true,
                    cost: 3500,
                },
            })
        }
        // Sync vehicle block flags via same rules as MaintenanceService
        const blocking = await prisma.maintenanceRecord.count({
            where: {
                vehicleId: seedVehicle.id,
                status: {
                    in: [
                        MaintenanceStatus.SCHEDULED,
                        MaintenanceStatus.IN_PROGRESS,
                    ],
                },
                OR: [
                    { status: MaintenanceStatus.IN_PROGRESS },
                    { blocksRouting: true },
                ],
            },
        })
        await prisma.vehicle.update({
            where: { id: seedVehicle.id },
            data: {
                routingBlocked: blocking > 0,
                status: blocking > 0 ? 'MAINTENANCE' : seedVehicle.status,
            },
        })
        console.log(
            `Seeded maintenance on ${seedVehicle.plateNumber} (blocksRouting=${blocking > 0}).`,
        )
    } else {
        console.log('No vehicles found — skipped maintenance seed.')
    }
}

main()
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
