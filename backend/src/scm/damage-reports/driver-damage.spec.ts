import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common'
import { StopStatus, TripStatus } from '@prisma/client'
import { PERMISSION_KEY } from '../../permissions/permission.guard'
import { DamageReportsService } from './damage-reports.service'
import { DriverDamageReportsController } from './driver-damage-reports.controller'
import {
    driverReportBlocker,
    driverReportGraceMinutes,
    parseDriverPhotos,
} from './driver-damage.rules'

const NOW = new Date('2026-10-15T03:00:00Z')
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000)
const PHOTO = 'data:image/jpeg;base64,AAAA'

describe('driverReportBlocker', () => {
    const completed = { status: StopStatus.COMPLETED }

    it('allows a delivered stop while the trip is in transit', () => {
        expect(
            driverReportBlocker(
                { status: TripStatus.IN_TRANSIT, completedAt: null },
                completed,
                NOW,
                60,
            ),
        ).toBeNull()
    })

    it('allows the last drop shortly after the trip auto-completes, not after the grace window', () => {
        const trip = (m: number) => ({
            status: TripStatus.COMPLETED,
            completedAt: minutesAgo(m),
        })
        expect(driverReportBlocker(trip(30), completed, NOW, 60)).toBeNull()
        expect(driverReportBlocker(trip(61), completed, NOW, 60)).toMatch(
            /ask dispatch/,
        )
    })

    it('never treats damage as part of an undelivered or failed stop', () => {
        const trip = { status: TripStatus.IN_TRANSIT, completedAt: null }
        for (const status of [
            StopStatus.PENDING,
            StopStatus.ARRIVED,
            StopStatus.FAILED,
            StopStatus.SKIPPED,
        ]) {
            expect(driverReportBlocker(trip, { status }, NOW, 60)).toMatch(
                /stop you delivered/,
            )
        }
    })

    it('reads the grace window from env with a default', () => {
        expect(driverReportGraceMinutes({})).toBe(60)
        expect(
            driverReportGraceMinutes({ DRIVER_DAMAGE_REPORT_GRACE_MINUTES: '15' }),
        ).toBe(15)
        expect(
            driverReportGraceMinutes({ DRIVER_DAMAGE_REPORT_GRACE_MINUTES: 'x' }),
        ).toBe(60)
    })
})

describe('parseDriverPhotos', () => {
    it('accepts up to three image data URLs or http(s) URLs', () => {
        expect(parseDriverPhotos(undefined)).toBeNull()
        expect(parseDriverPhotos([])).toBeNull()
        expect(parseDriverPhotos([PHOTO, 'https://cdn/x.jpg'])).toEqual([
            PHOTO,
            'https://cdn/x.jpg',
        ])
    })

    it('rejects too many, non-image, or oversized photos', () => {
        expect(() => parseDriverPhotos([PHOTO, PHOTO, PHOTO, PHOTO])).toThrow(
            /at most 3/,
        )
        expect(() => parseDriverPhotos(['data:text/plain;base64,AA'])).toThrow(
            BadRequestException,
        )
        expect(() => parseDriverPhotos(PHOTO)).toThrow(/array/)
        expect(() =>
            parseDriverPhotos([`data:image/png;base64,${'A'.repeat(3_000_000)}`]),
        ).toThrow(/too large/)
    })
})

function setup(
    trip: {
        driverId?: string | null
        status?: TripStatus
        completedAt?: Date | null
        stopStatus?: StopStatus
    } = {},
) {
    const row = {
        id: 'trip-1',
        driverId: trip.driverId === undefined ? 'drv-1' : trip.driverId,
        status: trip.status ?? TripStatus.IN_TRANSIT,
        completedAt: trip.completedAt ?? null,
        stops: [
            {
                id: 'stop-2',
                status: trip.stopStatus ?? StopStatus.COMPLETED,
                shipments: [
                    { action: 'PICKUP', shipmentId: 'sh-pick' },
                    { action: 'DROPOFF', shipmentId: 'sh-1' },
                ],
            },
        ],
    }
    const prisma = {
        trip: {
            findUnique: async ({
                where,
                select,
            }: {
                where: { id: string }
                select: { stops: { where: { id: string } } }
            }) =>
                where.id === row.id
                    ? {
                          ...row,
                          stops: row.stops.filter(
                              (s) => s.id === select.stops.where.id,
                          ),
                      }
                    : null,
        },
        shipment: {
            findMany: jest.fn(async () => [
                { id: 'sh-1', reference: 'MM-PKG-1', lines: [] },
            ]),
        },
        damageReport: { findMany: jest.fn(async () => []) },
    }
    const service = new DamageReportsService(
        prisma as never,
        {} as never,
        {} as never,
    )
    const createForShipment = jest
        .spyOn(service, 'createForShipment')
        .mockResolvedValue({ id: 'dr-1' } as never)
    return { service, prisma, createForShipment }
}

const user = { id: 'user-drv', role: 'driver' }
const body = {
    shipmentId: 'sh-1',
    shipmentLineId: 'line-1',
    damagedQuantity: 2,
    description: 'Two boxes crushed',
    photoUrls: [PHOTO],
    idempotencyKey: 'dmg-stop-2-1',
}

describe('DamageReportsService driver flow', () => {
    it('files a DRIVER report on a dropoff shipment of the delivered stop', async () => {
        const { service, createForShipment } = setup()
        await service.createFromDriver('trip-1', 'stop-2', body, 'drv-1', user)
        expect(createForShipment).toHaveBeenCalledWith(
            'sh-1',
            {
                shipmentLineId: 'line-1',
                damagedQuantity: 2,
                description: 'Two boxes crushed',
                photoUrls: [PHOTO],
                idempotencyKey: 'dmg-stop-2-1',
            },
            user,
            { tripStopId: 'stop-2', driverId: 'drv-1' },
        )
    })

    it('only the assigned driver may report', async () => {
        const { service, createForShipment } = setup()
        await expect(
            service.createFromDriver('trip-1', 'stop-2', body, 'drv-other', user),
        ).rejects.toBeInstanceOf(ForbiddenException)
        await expect(
            service.createFromDriver('trip-1', 'stop-2', body, undefined, user),
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(createForShipment).not.toHaveBeenCalled()
    })

    it('rejects stops that were not delivered and trips that have ended', async () => {
        await expect(
            setup({ stopStatus: StopStatus.ARRIVED }).service.createFromDriver(
                'trip-1',
                'stop-2',
                body,
                'drv-1',
                user,
            ),
        ).rejects.toBeInstanceOf(ConflictException)
        await expect(
            setup({
                status: TripStatus.COMPLETED,
                completedAt: new Date(Date.now() - 3 * 60 * 60_000),
            }).service.createFromDriver('trip-1', 'stop-2', body, 'drv-1', user),
        ).rejects.toThrow(/ask dispatch/)
    })

    it('requires a dropoff shipment of this stop and a specific line', async () => {
        const { service, createForShipment } = setup()
        await expect(
            service.createFromDriver(
                'trip-1',
                'stop-2',
                { ...body, shipmentId: 'sh-pick' },
                'drv-1',
                user,
            ),
        ).rejects.toThrow(/not delivered at this stop/)
        await expect(
            service.createFromDriver(
                'trip-1',
                'stop-2',
                { ...body, shipmentLineId: undefined },
                'drv-1',
                user,
            ),
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(createForShipment).not.toHaveBeenCalled()
    })

    it('404s unknown trips and stops', async () => {
        const { service } = setup()
        await expect(
            service.createFromDriver('nope', 'stop-2', body, 'drv-1', user),
        ).rejects.toBeInstanceOf(NotFoundException)
        await expect(
            service.driverStopContext('trip-1', 'nope', 'drv-1'),
        ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('context lists the stop dropoff shipments and whether reporting is open', async () => {
        const { service, prisma } = setup()
        const context = await service.driverStopContext('trip-1', 'stop-2', 'drv-1')
        expect(context).toMatchObject({ canReport: true, blockedReason: null })
        expect(prisma.shipment.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: { in: ['sh-1'] } } }),
        )

        const closed = await setup({
            stopStatus: StopStatus.FAILED,
        }).service.driverStopContext('trip-1', 'stop-2', 'drv-1')
        expect(closed.canReport).toBe(false)
    })
})

describe('DriverDamageReportsController RBAC metadata', () => {
    it('uses the driver execution permission for create and trip read for context', () => {
        expect(
            Reflect.getMetadata(
                PERMISSION_KEY,
                DriverDamageReportsController.prototype.create,
            ),
        ).toEqual({ resource: 'scm.trips', action: 'update' })
        expect(
            Reflect.getMetadata(
                PERMISSION_KEY,
                DriverDamageReportsController.prototype.context,
            ),
        ).toEqual({
            resource: ['scm.trips', 'scm.trip-planning', 'scm.tracking'],
            action: 'read',
        })
    })
})
