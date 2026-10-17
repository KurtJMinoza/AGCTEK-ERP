import { BadRequestException, ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { PrismaService } from '../../prisma/prisma.service'
import type { ShipmentsService } from '../shipments/shipments.service'
import type { GoodsIssueService } from '../../mm/stock-ops/goods-issue.service'
import { CarriersService } from './carriers.service'
import { ConsignmentsService } from './consignments.service'
import {
    assertCourierTransition,
    nextCourierStatuses,
    normalizeCarrierCode,
    normalizeTrackingNumber,
    shipmentStatusForCourier,
    trackingUrl,
    validateTrackingUrlTemplate,
} from './couriers.rules'

describe('couriers.rules', () => {
    it('normalizes carrier codes to upper case and rejects bad ones', () => {
        expect(normalizeCarrierCode(' jnt ')).toBe('JNT')
        expect(() => normalizeCarrierCode('J')).toThrow(BadRequestException)
        expect(() => normalizeCarrierCode('J&T')).toThrow(BadRequestException)
    })

    it('requires an http(s) tracking template with {tracking}', () => {
        expect(validateTrackingUrlTemplate('')).toBeNull()
        expect(validateTrackingUrlTemplate('https://x.ph/t/{tracking}')).toBe(
            'https://x.ph/t/{tracking}',
        )
        expect(() => validateTrackingUrlTemplate('https://x.ph/t')).toThrow(
            BadRequestException,
        )
        expect(() => validateTrackingUrlTemplate('x.ph/{tracking}')).toThrow(
            BadRequestException,
        )
    })

    it('builds the public tracking link and strips whitespace from AWBs', () => {
        expect(trackingUrl('https://x.ph/t/{tracking}', 'AB 12')).toBe(
            'https://x.ph/t/AB%2012',
        )
        expect(trackingUrl(null, 'AB12')).toBeNull()
        expect(normalizeTrackingNumber(' 7701 2345 ')).toBe('77012345')
        expect(() => normalizeTrackingNumber('  ')).toThrow(BadRequestException)
    })

    it('allows the normal courier path and blocks skips / reopening', () => {
        expect(() => assertCourierTransition('BOOKED', 'PICKED_UP', false)).not.toThrow()
        expect(() => assertCourierTransition('PICKED_UP', 'DELIVERED', true)).not.toThrow()
        expect(() => assertCourierTransition('BOOKED', 'DELIVERED', false)).toThrow(
            BadRequestException,
        )
        expect(() => assertCourierTransition('DELIVERED', 'IN_TRANSIT', true)).toThrow(
            BadRequestException,
        )
        expect(() => assertCourierTransition('PICKED_UP', 'CANCELLED', true)).toThrow(
            BadRequestException,
        )
    })

    it('limits EXCEPTION exits by whether the courier already has the parcel', () => {
        expect(nextCourierStatuses('EXCEPTION', false)).toEqual(['PICKED_UP', 'CANCELLED'])
        expect(nextCourierStatuses('EXCEPTION', true)).toEqual([
            'IN_TRANSIT',
            'OUT_FOR_DELIVERY',
            'DELIVERED',
            'RETURNED',
        ])
    })

    it('mirrors courier status onto the shipment', () => {
        expect(shipmentStatusForCourier('PICKED_UP')).toBe('DISPATCHED')
        expect(shipmentStatusForCourier('OUT_FOR_DELIVERY')).toBe('IN_TRANSIT')
        expect(shipmentStatusForCourier('EXCEPTION')).toBe('EXCEPTION_HOLD')
        expect(shipmentStatusForCourier('CANCELLED')).toBe('READY')
    })
})

describe('ConsignmentsService.updateStatus', () => {
    const setup = (consignment: Record<string, unknown>, opts: { giError?: Error } = {}) => {
        const row = {
            id: 'cc-1',
            status: 'BOOKED',
            pickedUpAt: null,
            trackingNumber: 'JT1',
            carrier: { name: 'J&T Express', trackingUrlTemplate: null },
            shipment: { id: 'sh-1', reference: 'SHP-1', packageId: 'pkg-1', goodsIssueId: null },
            events: [],
            ...consignment,
        }
        const shipmentUpdates: Array<{ data: Record<string, unknown> }> = []
        const emitted: Array<[string, unknown]> = []
        const txClient: { current?: unknown } = {}
        const prisma = {
            courierConsignment: {
                findUnique: jest.fn(async () => row),
                updateMany: jest.fn(async () => ({ count: 1 })),
            },
            courierConsignmentEvent: { create: jest.fn(async () => ({})) },
            shipment: {
                update: jest.fn(async (args: { data: Record<string, unknown> }) => {
                    shipmentUpdates.push(args)
                    return {}
                }),
            },
            wmPackage: { updateMany: jest.fn(async () => ({ count: 1 })) },
            $transaction: jest.fn(
                async (fn: (tx: unknown) => unknown): Promise<unknown> =>
                    fn(txClient.current),
            ),
        }
        txClient.current = prisma
        const goodsIssues = {
            issueAndPostFromPackage: jest.fn(async () => {
                if (opts.giError) throw opts.giError
                return { id: 'gi-1' }
            }),
        }
        const service = new ConsignmentsService(
            prisma as unknown as PrismaService,
            {} as unknown as ShipmentsService,
            goodsIssues as unknown as GoodsIssueService,
            { emit: (name: string, payload: unknown) => emitted.push([name, payload]) } as never,
        )
        return { service, prisma, goodsIssues, shipmentUpdates, emitted }
    }

    it('PICKED_UP posts the goods issue once and dispatches the shipment', async () => {
        const { service, goodsIssues, shipmentUpdates, prisma } = setup({})
        await service.updateStatus('cc-1', { status: 'picked_up' }, 'u-1')
        expect(goodsIssues.issueAndPostFromPackage).toHaveBeenCalledWith('pkg-1', {
            createdBy: 'u-1',
        })
        expect(shipmentUpdates[0].data).toEqual({ goodsIssueId: 'gi-1' })
        expect(prisma.wmPackage.updateMany).toHaveBeenCalled()
        expect(shipmentUpdates[1].data).toMatchObject({ status: 'DISPATCHED' })
    })

    it('skips goods issue when the shipment already has one', async () => {
        const { service, goodsIssues } = setup({
            shipment: { id: 'sh-1', reference: 'SHP-1', packageId: 'pkg-1', goodsIssueId: 'gi-0' },
        })
        await service.updateStatus('cc-1', { status: 'PICKED_UP' })
        expect(goodsIssues.issueAndPostFromPackage).not.toHaveBeenCalled()
    })

    it('a failed goods issue leaves the consignment unchanged', async () => {
        const { service, prisma } = setup({}, { giError: new Error('no stock') })
        await expect(service.updateStatus('cc-1', { status: 'PICKED_UP' })).rejects.toThrow(
            /goods issue failed/,
        )
        expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('DELIVERED marks the shipment delivered and emits shipment.delivered', async () => {
        const { service, shipmentUpdates, emitted } = setup({
            status: 'OUT_FOR_DELIVERY',
            pickedUpAt: new Date(),
        })
        await service.updateStatus('cc-1', { status: 'DELIVERED' })
        expect(shipmentUpdates[0].data).toMatchObject({ status: 'DELIVERED' })
        expect(emitted).toEqual([
            ['shipment.delivered', { shipmentIds: ['sh-1'] }],
            [
                'courier.consignment.status-changed',
                { consignmentId: 'cc-1', shipmentId: 'sh-1', status: 'DELIVERED', pickedUp: true },
            ],
        ])
    })

    it('CANCELLED before pickup returns the shipment to the own fleet and clears the SD projection', async () => {
        const { service, shipmentUpdates, emitted } = setup({})
        await service.updateStatus('cc-1', { status: 'CANCELLED' })
        expect(shipmentUpdates[0].data).toMatchObject({
            status: 'READY',
            executionMode: 'OWN_FLEET',
        })
        expect(emitted.map(([name]) => name)).toEqual([
            'courier.consignment.changed',
            'courier.consignment.status-changed',
        ])
        expect(emitted[0][1]).toEqual({
            shipmentId: 'sh-1',
            carrierName: null,
            trackingNumber: null,
        })
        expect(emitted.some(([name]) => name === 'shipment.delivered')).toBe(false)
    })

    it('rejects a future event time and a lost race', async () => {
        const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
        const { service } = setup({})
        await expect(
            service.updateStatus('cc-1', { status: 'CANCELLED', occurredAt: future }),
        ).rejects.toThrow(BadRequestException)

        const raced = setup({})
        raced.prisma.courierConsignment.updateMany.mockResolvedValueOnce({ count: 0 })
        await expect(
            raced.service.updateStatus('cc-1', { status: 'CANCELLED' }),
        ).rejects.toThrow(ConflictException)
    })
})

describe('CarriersService', () => {
    const setup = (consignments = 0) => {
        const prisma = {
            carrier: {
                create: jest.fn(async ({ data }) => ({ id: 'c-1', ...data })),
                findUnique: jest.fn(async () => ({
                    id: 'c-1',
                    _count: { consignments },
                })),
                delete: jest.fn(async () => ({})),
            },
        }
        return {
            prisma,
            service: new CarriersService(prisma as unknown as PrismaService),
        }
    }

    it('creates a MANUAL carrier with COD off by default', async () => {
        const { service } = setup()
        const created = await service.create({ code: 'ninjavan', name: 'Ninja Van' })
        expect(created).toMatchObject({
            code: 'NINJAVAN',
            integrationType: 'MANUAL',
            supportsCod: false,
            isActive: true,
        })
    })

    it('rejects API integration until an adapter exists', async () => {
        const { service } = setup()
        await expect(
            service.create({ code: 'JNT', name: 'J&T', integrationType: 'API' }),
        ).rejects.toThrow(BadRequestException)
    })

    it('refuses to delete a carrier that has consignments', async () => {
        const { service, prisma } = setup(2)
        await expect(service.remove('c-1')).rejects.toThrow(ConflictException)
        expect(prisma.carrier.delete).not.toHaveBeenCalled()
    })
})

describe('ConsignmentsService.book', () => {
    type Opts = {
        shipment?: Record<string, unknown>
        carrier?: Record<string, unknown> | null
        paymentMethod?: string
        onLoadPlan?: boolean
        onTrip?: boolean
        claimCount?: number
        createError?: unknown
    }

    const setup = (opts: Opts = {}) => {
        const shipment = {
            id: 'sh-1',
            reference: 'SHP-1',
            movementType: 'DELIVERY',
            status: 'READY',
            executionMode: 'OWN_FLEET',
            courierConsignment: null,
            package: { salesOrderId: 'so-1' },
            ...opts.shipment,
        }
        const carrier =
            opts.carrier === null
                ? null
                : { id: 'c-1', name: 'J&T Express', isActive: true, ...opts.carrier }
        const events: unknown[] = []
        const shipmentUpdates: unknown[] = []
        const txClient: { current?: unknown } = {}
        const transaction = jest.fn(
            async (fn: (tx: unknown) => unknown): Promise<unknown> =>
                fn(txClient.current),
        )
        const prisma = {
            shipment: {
                findUnique: jest.fn(async () => shipment),
                updateMany: jest.fn(async (args: unknown) => {
                    shipmentUpdates.push(args)
                    return { count: opts.claimCount ?? 1 }
                }),
            },
            carrier: { findUnique: jest.fn(async () => carrier) },
            sdSalesOrder: {
                findUnique: jest.fn(async () => ({
                    orderNumber: 'SO-1',
                    paymentMethod: opts.paymentMethod ?? 'CARD_DEMO',
                })),
            },
            loadPlanLine: {
                findFirst: jest.fn(async () =>
                    opts.onLoadPlan ? { loadPlan: { code: 'LP-1' } } : null,
                ),
            },
            tripStopShipment: {
                findFirst: jest.fn(async () =>
                    opts.onTrip ? { tripStop: { trip: { code: 'TRP-1' } } } : null,
                ),
            },
            courierConsignment: {
                create: jest.fn(async () => {
                    if (opts.createError) throw opts.createError
                    return { id: 'cc-1' }
                }),
                updateMany: jest.fn(async () => ({ count: 1 })),
                findUnique: jest.fn(async () => ({
                    id: 'cc-1',
                    status: 'BOOKED',
                    pickedUpAt: null,
                    trackingNumber: 'JT123',
                    carrier: { trackingUrlTemplate: null },
                    events,
                })),
            },
            courierConsignmentEvent: {
                create: jest.fn(async ({ data }) => {
                    events.push(data)
                    return data
                }),
            },
            $transaction: transaction,
        }
        txClient.current = prisma
        const shipments = { resolveSalesOrderId: jest.fn(async () => null) }
        const service = new ConsignmentsService(
            prisma as unknown as PrismaService,
            shipments as unknown as ShipmentsService,
            {} as unknown as GoodsIssueService,
        )
        return { service, prisma, events, shipmentUpdates }
    }

    const body = { shipmentId: 'sh-1', carrierId: 'c-1', trackingNumber: 'JT 123' }

    it('books a READY shipment: THIRD_PARTY + BOOKED consignment + BOOKED event', async () => {
        const { service, prisma, events, shipmentUpdates } = setup()
        const result = await service.book(body, 'user-1')
        expect(result.id).toBe('cc-1')
        expect(shipmentUpdates[0]).toMatchObject({
            where: { id: 'sh-1', status: 'READY' },
            data: { executionMode: 'THIRD_PARTY' },
        })
        expect(prisma.courierConsignment.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    shipmentId: 'sh-1',
                    carrierId: 'c-1',
                    trackingNumber: 'JT123',
                    status: 'BOOKED',
                    createdBy: 'user-1',
                }),
            }),
        )
        expect(events).toEqual([
            expect.objectContaining({ status: 'BOOKED', source: 'MANUAL' }),
        ])
    })

    it.each([
        ['not READY', { status: 'DISPATCHED' }],
        ['a pickup', { movementType: 'PICKUP' }],
    ])('rejects a shipment that is %s', async (_label, shipment) => {
        const { service } = setup({ shipment })
        await expect(service.book(body)).rejects.toThrow(BadRequestException)
    })

    it('rejects a shipment already booked with a courier', async () => {
        const { service } = setup({
            shipment: {
                courierConsignment: {
                    id: 'cc-0',
                    status: 'BOOKED',
                    carrier: { name: 'LBC Express' },
                },
            },
        })
        await expect(service.book(body)).rejects.toThrow(ConflictException)
    })

    it('rejects an inactive carrier', async () => {
        const { service } = setup({ carrier: { isActive: false } })
        await expect(service.book(body)).rejects.toThrow(BadRequestException)
    })

    it('blocks Cash on Delivery orders until courier remittance exists', async () => {
        const { service, prisma } = setup({ paymentMethod: 'COD' })
        await expect(service.book(body)).rejects.toThrow(/Cash on Delivery/)
        expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it.each([
        ['on a load plan', { onLoadPlan: true }],
        ['on an active trip', { onTrip: true }],
    ])('rejects cargo already %s', async (_label, opts) => {
        const { service, prisma } = setup(opts)
        await expect(service.book(body)).rejects.toThrow(ConflictException)
        expect(prisma.courierConsignment.create).not.toHaveBeenCalled()
    })

    it('re-books a CANCELLED consignment in place', async () => {
        const { service, prisma } = setup({
            shipment: {
                executionMode: 'THIRD_PARTY',
                courierConsignment: {
                    id: 'cc-1',
                    status: 'CANCELLED',
                    carrier: { name: 'LBC Express' },
                },
            },
        })
        await service.book(body)
        expect(prisma.courierConsignment.create).not.toHaveBeenCalled()
        expect(prisma.courierConsignment.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'cc-1', status: 'CANCELLED' },
                data: expect.objectContaining({ status: 'BOOKED', pickedUpAt: null }),
            }),
        )
    })

    it('reports a duplicate tracking number for the same carrier as a conflict', async () => {
        const { service } = setup({
            createError: new Prisma.PrismaClientKnownRequestError('dup', {
                code: 'P2002',
                clientVersion: 'test',
            }),
        })
        await expect(service.book(body)).rejects.toThrow(/already used/)
    })

    it('rejects when the shipment stopped being READY mid-booking', async () => {
        const { service } = setup({ claimCount: 0 })
        await expect(service.book(body)).rejects.toThrow(ConflictException)
    })
})
