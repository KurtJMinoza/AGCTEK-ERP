import { Injectable } from '@nestjs/common'
import {
    MaintenanceStatus,
    ShipmentStatus,
    StopStatus,
    TripStatus,
    VehicleStatus,
} from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

const GPS_RECENT_MS = 30 * 60 * 1000

function emptyCountMap<T extends string>(keys: T[]): Record<T, number> {
    return Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>
}

function fillGroupCounts<T extends string>(
    keys: T[],
    rows: Array<{ key: T; count: number }>,
): Record<T, number> {
    const map = emptyCountMap(keys)
    for (const row of rows) {
        map[row.key] = row.count
    }
    return map
}

@Injectable()
export class DashboardService {
    constructor(private readonly prisma: PrismaService) {}

    async summary() {
        const now = new Date()
        const startOfToday = new Date(now)
        startOfToday.setHours(0, 0, 0, 0)
        const gpsSince = new Date(now.getTime() - GPS_RECENT_MS)

        const [
            shipmentGroups,
            tripGroups,
            vehicleGroups,
            maintenanceGroups,
            routingBlocked,
            deliveredWithWindow,
            completedTrips,
            stopsCompletedToday,
            stopsFailedRecent,
            lateDeliveries,
            recentGpsVehicleIds,
            openShipments,
        ] = await Promise.all([
            this.prisma.shipment.groupBy({
                by: ['status'],
                _count: { _all: true },
            }),
            this.prisma.trip.groupBy({
                by: ['status'],
                _count: { _all: true },
            }),
            this.prisma.vehicle.groupBy({
                by: ['status'],
                _count: { _all: true },
            }),
            this.prisma.maintenanceRecord.groupBy({
                by: ['status'],
                _count: { _all: true },
            }),
            this.prisma.vehicle.count({ where: { routingBlocked: true } }),
            this.prisma.shipment.findMany({
                where: {
                    status: ShipmentStatus.DELIVERED,
                    deliveredAt: { not: null },
                    latestDeliveryAt: { not: null },
                },
                select: { deliveredAt: true, latestDeliveryAt: true },
                take: 2000,
            }),
            this.prisma.trip.findMany({
                where: {
                    status: TripStatus.COMPLETED,
                    startedAt: { not: null },
                    completedAt: { not: null },
                },
                select: { startedAt: true, completedAt: true },
                take: 500,
                orderBy: { completedAt: 'desc' },
            }),
            this.prisma.tripStop.count({
                where: {
                    status: StopStatus.COMPLETED,
                    completedAt: { gte: startOfToday },
                },
            }),
            this.prisma.tripStop.findMany({
                where: { status: StopStatus.FAILED },
                select: {
                    id: true,
                    name: true,
                    address: true,
                    failureReason: true,
                    completedAt: true,
                    arrivedAt: true,
                    trip: { select: { code: true } },
                },
                orderBy: { completedAt: 'desc' },
                take: 8,
            }),
            this.prisma.shipment.findMany({
                where: {
                    status: ShipmentStatus.DELIVERED,
                    deliveredAt: { not: null },
                    latestDeliveryAt: { not: null },
                },
                select: {
                    id: true,
                    reference: true,
                    deliveredAt: true,
                    latestDeliveryAt: true,
                },
                orderBy: { deliveredAt: 'desc' },
                take: 100,
            }),
            this.prisma.gpsLog.findMany({
                where: { recordedAt: { gte: gpsSince } },
                distinct: ['vehicleId'],
                select: { vehicleId: true },
            }),
            this.prisma.shipment.count({
                where: {
                    status: {
                        notIn: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED],
                    },
                },
            }),
        ])

        const shipmentsByStatus = fillGroupCounts(
            Object.values(ShipmentStatus),
            shipmentGroups.map((g) => ({
                key: g.status,
                count: g._count._all,
            })),
        )

        const tripsByStatus = fillGroupCounts(
            Object.values(TripStatus),
            tripGroups.map((g) => ({
                key: g.status,
                count: g._count._all,
            })),
        )

        const fleetByStatus = fillGroupCounts(
            Object.values(VehicleStatus),
            vehicleGroups.map((g) => ({
                key: g.status,
                count: g._count._all,
            })),
        )

        const maintenanceByStatus = fillGroupCounts(
            Object.values(MaintenanceStatus),
            maintenanceGroups.map((g) => ({
                key: g.status,
                count: g._count._all,
            })),
        )

        let onTime = 0
        let late = 0
        for (const s of deliveredWithWindow) {
            if (!s.deliveredAt || !s.latestDeliveryAt) continue
            if (s.deliveredAt.getTime() <= s.latestDeliveryAt.getTime()) {
                onTime += 1
            } else {
                late += 1
            }
        }

        const durations = completedTrips
            .map((t) => {
                if (!t.startedAt || !t.completedAt) return null
                return (
                    (t.completedAt.getTime() - t.startedAt.getTime()) /
                    (1000 * 60 * 60)
                )
            })
            .filter((h): h is number => h != null && h >= 0)

        const avgTripDurationHours =
            durations.length > 0
                ? Math.round(
                      (durations.reduce((a, b) => a + b, 0) / durations.length) *
                          10,
                  ) / 10
                : null

        const fleetTotal = Object.values(fleetByStatus).reduce((a, b) => a + b, 0)
        const inTransit = fleetByStatus.IN_TRANSIT
        const available = fleetByStatus.AVAILABLE
        const utilizationPct =
            fleetTotal > 0
                ? Math.round((inTransit / fleetTotal) * 1000) / 10
                : 0

        const recentIssues = [
            ...stopsFailedRecent.map((s) => ({
                id: s.id,
                kind: 'STOP_FAILED' as const,
                label: `${s.trip.code} · ${s.name ?? s.address}${s.failureReason ? ` — ${s.failureReason}` : ''}`,
                at: (s.completedAt ?? s.arrivedAt ?? new Date()).toISOString(),
            })),
            ...lateDeliveries
                .filter(
                    (s) =>
                        s.deliveredAt &&
                        s.latestDeliveryAt &&
                        s.deliveredAt.getTime() > s.latestDeliveryAt.getTime(),
                )
                .slice(0, 8)
                .map((s) => ({
                    id: s.id,
                    kind: 'LATE_DELIVERY' as const,
                    label: `${s.reference} delivered after window`,
                    at: s.deliveredAt!.toISOString(),
                })),
        ]
            .sort((a, b) => b.at.localeCompare(a.at))
            .slice(0, 10)

        return {
            generatedAt: now.toISOString(),
            shipments: {
                byStatus: shipmentsByStatus,
                openCount: openShipments,
                deliveredOnTime: onTime,
                deliveredLate: late,
                /** Soft on-time proxy when latestDeliveryAt is set — not full OTIF. */
                onTimeNote:
                    'On-time uses deliveredAt <= latestDeliveryAt when both exist. Full OTIF needs promise dates from MM.',
            },
            trips: {
                byStatus: tripsByStatus,
                activeCount:
                    tripsByStatus.IN_TRANSIT + tripsByStatus.ASSIGNED,
                inTransitCount: tripsByStatus.IN_TRANSIT,
                completedCount: tripsByStatus.COMPLETED,
                avgDurationHours: avgTripDurationHours,
                stopsCompletedToday,
            },
            fleet: {
                byStatus: fleetByStatus,
                total: fleetTotal,
                available,
                inTransit,
                routingBlocked,
                withRecentGps: recentGpsVehicleIds.length,
                utilizationPct,
            },
            maintenance: {
                byStatus: maintenanceByStatus,
                openCount:
                    maintenanceByStatus.SCHEDULED +
                    maintenanceByStatus.IN_PROGRESS,
                blockingRouting: routingBlocked,
            },
            recentIssues,
        }
    }
}
