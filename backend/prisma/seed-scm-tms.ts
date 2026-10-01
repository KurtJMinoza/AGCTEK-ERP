/**
 * Cargo-first TMS demo seed (idempotent — rebuilds TMS-* records):
 *   VEH-TMS-01 → load plan READY (trip candidate)
 *   VEH-TMS-02 → load plan ASSIGNED + trip PLANNED with generated SHIP/TO/RETURN stops
 *   TMS-SHP-006 left unassigned for Load Building
 *
 * Run: npm run prisma:seed-tms (after migrate deploy + base seed with warehouse MAIN)
 */
import { PrismaClient } from '@prisma/client'
import { buildTripStops, checkLoadCapacity } from '../src/scm/tms/tms.rules'

const prisma = new PrismaClient()

const HUB = { lat: 14.5995, lng: 120.9842 }

type SeedShipment = {
    reference: string
    customerName: string
    destAddress: string
    lat: number
    lng: number
    lines: number[]
    returnToHub?: boolean
    windowHour?: number
}

const SHIPMENTS: SeedShipment[] = [
    { reference: 'TMS-SHP-001', customerName: 'Makati Retail Hub', destAddress: 'Ayala Ave, Makati City', lat: 14.5547, lng: 121.0244, lines: [12, 8], windowHour: 9 },
    { reference: 'TMS-SHP-002', customerName: 'BGC Grocer', destAddress: '5th Ave, Bonifacio Global City, Taguig', lat: 14.5509, lng: 121.0509, lines: [15], returnToHub: true, windowHour: 11 },
    { reference: 'TMS-SHP-003', customerName: 'Quezon Mart', destAddress: 'Timog Ave, Quezon City', lat: 14.6348, lng: 121.0375, lines: [10], windowHour: 10 },
    { reference: 'TMS-SHP-004', customerName: 'Makati Retail Hub', destAddress: 'Ayala Ave, Makati City', lat: 14.5547, lng: 121.0244, lines: [6], windowHour: 9 },
    { reference: 'TMS-SHP-005', customerName: 'Pasig Depot', destAddress: 'Ortigas Center, Pasig City', lat: 14.5866, lng: 121.0614, lines: [14], windowHour: 13 },
    { reference: 'TMS-SHP-006', customerName: 'Manila Bay Foods', destAddress: 'Roxas Blvd, Manila', lat: 14.5636, lng: 120.9867, lines: [9], windowHour: 15 },
]

async function cleanup() {
    const plans = await prisma.loadPlan.findMany({
        where: { vehicle: { code: { in: ['VEH-TMS-01', 'VEH-TMS-02'] } } },
        select: { id: true },
    })
    const planIds = plans.map((p) => p.id)
    await prisma.trip.deleteMany({ where: { loadPlanId: { in: planIds } } })
    await prisma.loadPlan.deleteMany({ where: { id: { in: planIds } } })
    await prisma.shipment.deleteMany({ where: { reference: { startsWith: 'TMS-SHP-' } } })
}

async function main() {
    const warehouse = await prisma.warehouse.findUnique({ where: { code: 'MAIN' } })
    if (!warehouse) throw new Error('Warehouse MAIN not found — run the base seed first')

    await cleanup()

    const vehicles = await Promise.all(
        [
            { code: 'VEH-TMS-01', plateNumber: 'TMS-0001', capacityQty: 60 },
            { code: 'VEH-TMS-02', plateNumber: 'TMS-0002', capacityQty: 40 },
        ].map((v) =>
            prisma.vehicle.upsert({
                where: { code: v.code },
                create: {
                    ...v,
                    make: 'Isuzu',
                    model: 'N-Series',
                    type: 'TRUCK',
                    status: 'AVAILABLE',
                    capacityWeightKg: 0,
                    capacityVolumeM3: 0,
                },
                update: { capacityQty: v.capacityQty, status: 'AVAILABLE', routingBlocked: false },
            }),
        ),
    )

    const day = new Date()
    day.setDate(day.getDate() + 1)
    const lineIds = new Map<string, string[]>()

    for (const s of SHIPMENTS) {
        const start = new Date(day)
        start.setHours(s.windowHour ?? 9, 0, 0, 0)
        const end = new Date(start.getTime() + 2 * 60 * 60 * 1000)
        const qty = s.lines.reduce((a, b) => a + b, 0)
        const created = await prisma.shipment.create({
            data: {
                reference: s.reference,
                customerName: s.customerName,
                originAddress: warehouse.address ?? warehouse.name,
                originLat: HUB.lat,
                originLng: HUB.lng,
                destAddress: s.destAddress,
                destLat: s.lat,
                destLng: s.lng,
                quantity: qty,
                description: `TMS demo cargo for ${s.customerName}`,
                status: 'READY',
                earliestDeliveryAt: start,
                latestDeliveryAt: end,
                lines: {
                    create: s.lines.map((lineQty, i) => ({
                        lineNo: i + 1,
                        materialCode: `DEMO-SKU-${i + 1}`,
                        description: `Demo item ${i + 1}`,
                        quantity: lineQty,
                        shipFromWarehouseId: warehouse.id,
                        shipFromAddress: warehouse.address ?? warehouse.name,
                        shipFromLat: HUB.lat,
                        shipFromLng: HUB.lng,
                        shipToAddress: s.destAddress,
                        shipToLat: s.lat,
                        shipToLng: s.lng,
                        ...(s.returnToHub
                            ? {
                                  returnWarehouseId: warehouse.id,
                                  returnAddress: warehouse.address ?? warehouse.name,
                                  returnLat: HUB.lat,
                                  returnLng: HUB.lng,
                              }
                            : {}),
                    })),
                },
            },
            include: { lines: true },
        })
        lineIds.set(s.reference, created.lines.map((l) => l.id))
    }

    const buildPlan = async (
        vehicleIndex: number,
        refs: string[],
        status: 'READY' | 'ASSIGNED',
    ) => {
        const vehicle = vehicles[vehicleIndex]
        const ids = refs.flatMap((r) => lineIds.get(r) ?? [])
        const lines = await prisma.shipmentLine.findMany({
            where: { id: { in: ids } },
            include: { shipment: true, shipFromWarehouse: true, returnWarehouse: true },
            orderBy: [{ shipment: { reference: 'asc' } }, { lineNo: 'asc' }],
        })
        const capacity = checkLoadCapacity(
            vehicle,
            lines.map((l) => ({ qty: l.quantity, weightKg: l.weightKg, volumeM3: l.volumeM3 })),
        )
        if (!capacity.ok) throw new Error(capacity.message ?? 'capacity')
        const now = new Date()
        const plan = await prisma.loadPlan.create({
            data: {
                code: `LP-SEED-${vehicle.code.slice(-2)}`,
                vehicleId: vehicle.id,
                status,
                totalQty: capacity.totalQty,
                totalWeightKg: capacity.totalWeightKg,
                totalVolumeM3: capacity.totalVolumeM3,
                validatedAt: now,
                readyAt: now,
                createdBy: 'seed',
                lines: {
                    create: lines.map((l) => ({
                        shipmentLineId: l.id,
                        assignedQty: l.quantity,
                        weightKg: l.weightKg,
                        volumeM3: l.volumeM3,
                    })),
                },
            },
            include: { lines: true },
        })
        await prisma.shipment.updateMany({
            where: { reference: { in: refs } },
            data: { status: 'ASSIGNED' },
        })
        return { plan, lines, vehicle }
    }

    const ready = await buildPlan(0, ['TMS-SHP-001', 'TMS-SHP-002', 'TMS-SHP-004'], 'READY')
    const assigned = await buildPlan(1, ['TMS-SHP-003', 'TMS-SHP-005'], 'ASSIGNED')

    const lplByLine = new Map(assigned.plan.lines.map((l) => [l.shipmentLineId, l.id]))
    const { stops, errors } = buildTripStops(
        assigned.lines.map((l) => ({
            loadPlanLineId: lplByLine.get(l.id)!,
            shipmentLineId: l.id,
            shipmentId: l.shipmentId,
            customerName: l.shipment.customerName,
            ship: {
                warehouseId: l.shipFromWarehouseId,
                warehouseName: l.shipFromWarehouse?.name,
                address: l.shipFromAddress,
                lat: l.shipFromLat,
                lng: l.shipFromLng,
            },
            to: { address: l.shipToAddress, lat: l.shipToLat, lng: l.shipToLng },
            ret: l.returnWarehouseId
                ? { warehouseId: l.returnWarehouseId, warehouseName: l.returnWarehouse?.name, address: l.returnAddress }
                : null,
            earliestDeliveryAt: l.shipment.earliestDeliveryAt,
            latestDeliveryAt: l.shipment.latestDeliveryAt,
        })),
    )
    if (errors.length) throw new Error(errors.join('; '))

    const action = { SHIP: 'PICKUP', TO: 'DROPOFF', RETURN: 'RETURN' } as const
    const trip = await prisma.trip.create({
        data: {
            code: 'TRP-TMS-SEED-02',
            vehicleId: assigned.vehicle.id,
            loadPlanId: assigned.plan.id,
            status: 'PLANNED',
            plannedStartAt: new Date(day.setHours(8, 0, 0, 0)),
            totalQty: assigned.plan.totalQty,
            stops: {
                create: stops.map((s) => ({
                    sequence: s.sequence,
                    stopType: s.stopType,
                    locationKey: s.locationKey,
                    warehouseId: s.warehouseId,
                    name: s.name,
                    address: s.address,
                    lat: s.lat,
                    lng: s.lng,
                    windowStart: s.windowStart,
                    windowEnd: s.windowEnd,
                    lines: { create: s.lines },
                    shipments: {
                        create: s.shipmentIds.map((shipmentId) => ({
                            shipmentId,
                            action: action[s.stopType],
                        })),
                    },
                })),
            },
        },
        include: { stops: { orderBy: { sequence: 'asc' } } },
    })

    console.log(`READY load plan ${ready.plan.code} on ${ready.vehicle.plateNumber}: ${ready.plan.totalQty}/${ready.vehicle.capacityQty} items`)
    console.log(`Trip ${trip.code} from ${assigned.plan.code}: ${trip.stops.map((s) => `${s.sequence}.${s.stopType}`).join(' → ')}`)
    console.log('Unassigned for Load Building: TMS-SHP-006')
}

main()
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
