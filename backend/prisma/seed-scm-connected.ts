/**
 * SCM fleet + logistics demo that connects to MM packages (handoff).
 * Call after `seedMmOrg` so MAT-STEEL-001 / MAIN / bins exist.
 */
import {
    GeofenceKind,
    MaintenanceStatus,
    MaintenanceType,
    PrismaClient,
    ShipmentMovementType,
    ShipmentStatus,
    VehicleDocumentKind,
    VehicleDocumentStatus,
} from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { seedMmScmHandoff } from './seed-mm-scm-handoff'

const HUB_LUZON = {
    address: 'AGC Luzon Hub, North Harbor, Manila',
    lat: 14.6085,
    lng: 120.9645,
}
const HUB_VISAYAS = {
    address: 'AGC Logistics Hub, Cebu Business Park, Cebu City',
    lat: 10.3181,
    lng: 123.9054,
}
const HUB_MINDANAO = {
    address: 'AGC Mindanao Hub, JP Laurel Ave, Davao City',
    lat: 7.0905,
    lng: 125.6082,
}

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

function daysFromNow(days: number, hour: number): Date {
    const d = new Date()
    d.setDate(d.getDate() + days)
    d.setHours(hour, 0, 0, 0)
    return d
}

/** Stub READY pool (not package-linked) for load-plan demos. */
const mmReadyShipments = [
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
        notes: 'MM packed stub · Luzon',
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
        notes: 'MM return/pickup stub · Luzon',
    },
    {
        reference: 'MM-PKG-3101',
        externalOrderId: 'SO-47003101',
        materialCode: 'MAT-STEEL-001',
        customerName: 'BuildRight Hardware — Mandaue',
        description: 'Steel bars — Visayas lane',
        movementType: ShipmentMovementType.DELIVERY,
        originAddress: HUB_VISAYAS.address,
        originLat: HUB_VISAYAS.lat,
        originLng: HUB_VISAYAS.lng,
        destAddress: 'Highway Road, Mandaue City, Cebu',
        destLat: 10.3333,
        destLng: 123.9333,
        quantity: 28,
        earliestDeliveryAt: daysFromNow(2, 8),
        latestDeliveryAt: daysFromNow(2, 17),
        notes: 'MM packed stub · Visayas',
    },
    {
        reference: 'MM-PKG-3201',
        externalOrderId: 'SO-47003201',
        materialCode: 'MAT-GLV-001',
        customerName: 'Davao BuildMart — Bajada',
        description: 'Safety gloves carton — Mindanao',
        movementType: ShipmentMovementType.DELIVERY,
        originAddress: HUB_MINDANAO.address,
        originLat: HUB_MINDANAO.lat,
        originLng: HUB_MINDANAO.lng,
        destAddress: 'JP Laurel Ave, Bajada, Davao City',
        destLat: 7.0863,
        destLng: 125.6112,
        quantity: 60,
        earliestDeliveryAt: daysFromNow(2, 9),
        latestDeliveryAt: daysFromNow(2, 16),
        notes: 'MM packed stub · Mindanao',
    },
    {
        reference: 'MM-PKG-3202',
        externalOrderId: 'SO-47003202',
        materialCode: 'MAT-BOX-001',
        customerName: 'Mindanao Carton Returns',
        description: 'Empty carton pickup',
        movementType: ShipmentMovementType.PICKUP,
        originAddress: 'Lanang, Davao City',
        originLat: 7.1,
        originLng: 125.65,
        destAddress: HUB_MINDANAO.address,
        destLat: HUB_MINDANAO.lat,
        destLng: HUB_MINDANAO.lng,
        quantity: 20,
        earliestDeliveryAt: daysFromNow(3, 8),
        latestDeliveryAt: daysFromNow(3, 14),
        notes: 'MM return/pickup stub · Mindanao',
    },
]

export async function seedScmConnectedDemo(prisma: PrismaClient) {
    console.log('Seeding SCM connected demo (fleet + handoff + trips) …')

    for (const row of hubGeofences) {
        await prisma.geofence.upsert({
            where: { code: row.code },
            create: { ...row, active: true },
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
    }
    console.log(`  Hub geofences: ${hubGeofences.length}`)

    for (const row of mmReadyShipments) {
        await prisma.shipment.upsert({
            where: { reference: row.reference },
            create: { ...row, status: ShipmentStatus.READY, isFragile: false },
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
                status: ShipmentStatus.READY,
            },
        })
    }
    console.log(`  Stub READY shipments: ${mmReadyShipments.length}`)

    // True MM package → SCM shipment link (GI-capable)
    const handoff = await seedMmScmHandoff(prisma)
    console.log(
        `  MM→SCM handoff packages=${handoff.packages} shipments=${handoff.shipments}`,
    )

    const fleetVehicles = [
        {
            code: 'VEH-LZN-01',
            plateNumber: 'ABC-1001',
            make: 'Isuzu',
            model: 'ELF NPR',
            year: 2022,
            type: 'TRUCK' as const,
            capacityQty: 120,
            capacityWeightKg: 3500,
            capacityVolumeM3: 18,
            notes: 'Luzon hub fleet — MM→SCM demo',
        },
        {
            code: 'VEH-VIS-01',
            plateNumber: 'ABC-2001',
            make: 'Hino',
            model: '300 Series',
            year: 2021,
            type: 'TRUCK' as const,
            capacityQty: 100,
            capacityWeightKg: 3000,
            capacityVolumeM3: 16,
            notes: 'Visayas hub fleet — MM→SCM demo',
        },
        {
            code: 'VEH-MIN-01',
            plateNumber: 'ABC-3001',
            make: 'Mitsubishi',
            model: 'Canter',
            year: 2023,
            type: 'VAN' as const,
            capacityQty: 80,
            capacityWeightKg: 2500,
            capacityVolumeM3: 12,
            notes: 'Mindanao hub fleet — MM→SCM demo',
        },
        {
            code: 'VEH-DEMO-PM',
            plateNumber: 'PM-SEED-01',
            make: 'Foton',
            model: 'View',
            year: 2019,
            type: 'VAN' as const,
            capacityQty: 40,
            capacityWeightKg: 1500,
            capacityVolumeM3: 8,
            notes: 'Maintenance demo — routing-blocked',
        },
    ]

    for (const v of fleetVehicles) {
        await prisma.vehicle.upsert({
            where: { code: v.code },
            create: {
                ...v,
                status: 'AVAILABLE',
                routingBlocked: false,
                odometerKm: 12000,
                maintenanceThresholdKm: 50000,
            },
            update: {
                plateNumber: v.plateNumber,
                make: v.make,
                model: v.model,
                year: v.year,
                type: v.type,
                capacityQty: v.capacityQty,
                capacityWeightKg: v.capacityWeightKg,
                capacityVolumeM3: v.capacityVolumeM3,
                notes: v.notes,
                ...(v.code === 'VEH-DEMO-PM'
                    ? {}
                    : { status: 'AVAILABLE' as const, routingBlocked: false }),
            },
        })
    }

    const driverUser = await prisma.user.upsert({
        where: { userName: 'driver01' },
        create: {
            email: 'driver01@agctek.local',
            userName: 'driver01',
            passwordHash: await bcrypt.hash('123Qwe', 10),
            role: 'admin',
        },
        update: {
            passwordHash: await bcrypt.hash('123Qwe', 10),
        },
    })

    const licenseExpiry = new Date()
    licenseExpiry.setFullYear(licenseExpiry.getFullYear() + 2)

    const driver = await prisma.driver.upsert({
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
            status: 'AVAILABLE',
        },
    })

    // Second driver for Trips UI variety
    const driverUser2 = await prisma.user.upsert({
        where: { userName: 'driver02' },
        create: {
            email: 'driver02@agctek.local',
            userName: 'driver02',
            passwordHash: await bcrypt.hash('123Qwe', 10),
            role: 'user',
        },
        update: {},
    })
    await prisma.driver.upsert({
        where: { userId: driverUser2.id },
        create: {
            userId: driverUser2.id,
            employeeCode: 'DRV-002',
            firstName: 'Maria',
            lastName: 'Santos',
            licenseNumber: 'D-L01-SEED-002',
            licenseExpiry,
            phone: '+63 917 000 0002',
            status: 'AVAILABLE',
        },
        update: { status: 'AVAILABLE' },
    })

    const pmVehicle = await prisma.vehicle.findUnique({ where: { code: 'VEH-DEMO-PM' } })
    if (pmVehicle) {
        const title = 'Seed PM — oil & filter service'
        const existingMaint = await prisma.maintenanceRecord.findFirst({
            where: { vehicleId: pmVehicle.id, title },
        })
        if (!existingMaint) {
            await prisma.maintenanceRecord.create({
                data: {
                    vehicleId: pmVehicle.id,
                    type: MaintenanceType.PREVENTATIVE,
                    status: MaintenanceStatus.SCHEDULED,
                    title,
                    description: 'Demo preventative job — blocks routing.',
                    odometerKm: pmVehicle.odometerKm,
                    scheduledAt: new Date(),
                    blocksRouting: true,
                    cost: 3500,
                },
            })
        }
        await prisma.vehicle.update({
            where: { id: pmVehicle.id },
            data: { routingBlocked: true, status: 'MAINTENANCE' },
        })
    }

    const complianceVehicle = await prisma.vehicle.findUnique({
        where: { code: 'VEH-VIS-01' },
    })
    if (complianceVehicle) {
        const day = 24 * 60 * 60 * 1000
        const now = Date.now()
        for (const sample of [
            {
                kind: VehicleDocumentKind.OR,
                documentNo: 'OR-2025-VIS-88421',
                issuer: 'LTO Cebu City',
                expiresInDays: 120,
            },
            {
                kind: VehicleDocumentKind.CR,
                documentNo: 'CR-1301-884210',
                issuer: 'LTO Cebu City',
                expiresInDays: 20,
            },
            {
                kind: VehicleDocumentKind.INSURANCE_CTPL,
                documentNo: 'CTPL-AGC-VIS-2026-01',
                issuer: 'Malayan Insurance',
                expiresInDays: 90,
            },
        ]) {
            const existing = await prisma.vehicleDocument.findFirst({
                where: {
                    vehicleId: complianceVehicle.id,
                    kind: sample.kind,
                    documentNo: sample.documentNo,
                },
            })
            if (existing) continue
            const expiresAt = new Date(now + sample.expiresInDays * day)
            await prisma.vehicleDocument.create({
                data: {
                    vehicleId: complianceVehicle.id,
                    kind: sample.kind,
                    documentNo: sample.documentNo,
                    issuer: sample.issuer,
                    issuedAt: new Date(now - 200 * day),
                    expiresAt,
                    remindDaysBefore: 30,
                    blocksVehicle: true,
                    status:
                        sample.expiresInDays <= 30
                            ? VehicleDocumentStatus.EXPIRING_SOON
                            : VehicleDocumentStatus.VALID,
                    notes: 'Seeded PH registration / insurance sample',
                },
            })
        }
    }

    await prisma.scmPlanningSettings.upsert({
        where: { id: 'default' },
        create: {
            id: 'default',
            horizonWeeks: 12,
            bucketSize: 'WEEK',
            frozenZoneDays: 7,
        },
        update: {
            horizonWeeks: 12,
            bucketSize: 'WEEK',
            frozenZoneDays: 7,
        },
    })

    // Demand planning forecast stubs (SCM Demand Planning page)
    const forecastPeriods = [
        { code: 'MAT-STEEL-001', loc: 'MAIN', qty: 400 },
        { code: 'MAT-GLV-001', loc: 'MAIN', qty: 1200 },
        { code: 'MAT-BOX-001', loc: 'MAIN', qty: 800 },
        { code: 'MAT-STEEL-001', loc: 'SECONDARY', qty: 150 },
    ]
    for (const f of forecastPeriods) {
        const periodStart = daysFromNow(7, 0)
        const periodEnd = daysFromNow(14, 0)
        const existing = await prisma.demandForecast.findFirst({
            where: {
                productCode: f.code,
                locationCode: f.loc,
                periodStart,
            },
        })
        if (!existing) {
            await prisma.demandForecast.create({
                data: {
                    productCode: f.code,
                    locationCode: f.loc,
                    periodStart,
                    periodEnd,
                    quantity: f.qty,
                    unit: 'EA',
                    source: 'MM_SCM_DEMO_SEED',
                },
            })
        }
    }

    // GPS breadcrumb for live tracking map
    const lzn = await prisma.vehicle.findUnique({ where: { code: 'VEH-LZN-01' } })
    if (lzn) {
        await prisma.gpsLog.deleteMany({ where: { vehicleId: lzn.id } })
        const points = [
            { lat: 14.6085, lng: 120.9645 },
            { lat: 14.612, lng: 120.99 },
            { lat: 14.6191, lng: 121.0567 },
        ]
        let t = Date.now() - points.length * 60_000
        for (const p of points) {
            await prisma.gpsLog.create({
                data: {
                    vehicleId: lzn.id,
                    latitude: p.lat,
                    longitude: p.lng,
                    speedKmh: 35,
                    heading: 90,
                    recordedAt: new Date(t),
                },
            })
            t += 60_000
        }
    }

    // Demo PLANNED trip using package-linked READY handoff shipments
    const vehicle = await prisma.vehicle.findUnique({ where: { code: 'VEH-LZN-01' } })
    const handoffShipments = await prisma.shipment.findMany({
        where: {
            packageId: { not: null },
            status: ShipmentStatus.READY,
        },
        orderBy: { reference: 'asc' },
        take: 3,
    })

    if (vehicle && driver && handoffShipments.length > 0) {
        const existingTrip = await prisma.trip.findFirst({
            where: { code: 'TRIP-MM-SCM-DEMO-001' },
        })
        if (!existingTrip) {
            const trip = await prisma.trip.create({
                data: {
                    code: 'TRIP-MM-SCM-DEMO-001',
                    status: 'PLANNED',
                    vehicleId: vehicle.id,
                    driverId: driver.id,
                    plannedStartAt: daysFromNow(1, 7),
                    notes: 'Demo trip — MM READY_FOR_DISPATCH packages linked via packageId',
                },
            })

            let sequence = 1
            for (const sh of handoffShipments) {
                const stop = await prisma.tripStop.create({
                    data: {
                        tripId: trip.id,
                        sequence,
                        name: sh.customerName ?? `Stop ${sequence}`,
                        address: sh.destAddress ?? 'Unknown',
                        lat: sh.destLat ?? undefined,
                        lng: sh.destLng ?? undefined,
                        windowStart: sh.earliestDeliveryAt,
                        windowEnd: sh.latestDeliveryAt,
                        status: 'PENDING',
                    },
                })
                await prisma.tripStopShipment.create({
                    data: {
                        tripStopId: stop.id,
                        shipmentId: sh.id,
                        action: 'DROPOFF',
                    },
                })
                sequence += 1
            }
            console.log(
                `  Demo trip TRIP-MM-SCM-DEMO-001 PLANNED with ${handoffShipments.length} package-linked stops`,
            )
        }
    }

    console.log('SCM connected demo seed complete.')
    console.log('  Driver login: driver01 / 123Qwe')
}
