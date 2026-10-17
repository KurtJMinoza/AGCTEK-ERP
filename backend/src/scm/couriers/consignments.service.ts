import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    Logger,
    Optional,
    forwardRef,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import {
    CourierConsignmentStatus,
    CourierEventSource,
    Prisma,
    ShipmentExecutionMode,
    ShipmentMovementType,
    ShipmentStatus,
    TripStatus,
} from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { GoodsIssueService } from '../../mm/stock-ops/goods-issue.service'
import { ShipmentsService } from '../shipments/shipments.service'
import {
    assertFound,
    optionalDate,
    optionalString,
    parsePagination,
    requireString,
    type ListQuery,
    type PaginatedResult,
} from '../scm.utils'
import {
    COURIER_EVENTS,
    type CourierConsignmentChangedEvent,
    type CourierStatusChangedEvent,
} from './courier-events'
import {
    assertCourierTransition,
    nextCourierStatuses,
    normalizeTrackingNumber,
    shipmentStatusForCourier,
    trackingUrl,
} from './couriers.rules'

type UpdateStatusBody = {
    status?: string
    occurredAt?: string
    note?: string | null
    podUrl?: string | null
}

/** Clock skew allowed on a manually entered event time. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000

type BookConsignmentBody = {
    shipmentId?: string
    carrierId?: string
    trackingNumber?: string
    externalBookingId?: string | null
    notes?: string | null
}

export type ConsignmentListQuery = ListQuery & { carrierId?: string }

const CONSIGNMENT_STATUSES = new Set(Object.values(CourierConsignmentStatus))

const listInclude = {
    carrier: {
        select: { id: true, code: true, name: true, trackingUrlTemplate: true },
    },
    shipment: {
        select: {
            id: true,
            reference: true,
            customerName: true,
            destAddress: true,
            status: true,
            packageId: true,
        },
    },
} satisfies Prisma.CourierConsignmentInclude

type ConsignmentRow = Prisma.CourierConsignmentGetPayload<{
    include: typeof listInclude
}>

function withTrackingUrl<T extends ConsignmentRow>(row: T) {
    return {
        ...row,
        trackingUrl: trackingUrl(
            row.carrier.trackingUrlTemplate,
            row.trackingNumber,
        ),
    }
}

/** Cargo already on a load plan or an active trip belongs to the own fleet. */
async function assertNotOnOwnFleet(
    tx: Prisma.TransactionClient,
    shipmentId: string,
) {
    const loaded = await tx.loadPlanLine.findFirst({
        where: { shipmentLine: { shipmentId } },
        select: { loadPlan: { select: { code: true } } },
    })
    if (loaded) {
        throw new ConflictException(
            `Shipment is on load plan ${loaded.loadPlan.code} — remove it before shipping with a courier`,
        )
    }
    const onTrip = await tx.tripStopShipment.findFirst({
        where: {
            shipmentId,
            tripStop: { trip: { status: { not: TripStatus.CANCELLED } } },
        },
        select: { tripStop: { select: { trip: { select: { code: true } } } } },
    })
    if (onTrip) {
        throw new ConflictException(
            `Shipment is on trip ${onTrip.tripStop.trip.code} — remove it before shipping with a courier`,
        )
    }
}

function isUniqueViolation(err: unknown): boolean {
    return (
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
    )
}

/**
 * SCM Couriers — third-party (3PL) hand-off for a READY shipment (docs/SCM_COURIERS.md).
 * Courier status drives the shipment: PICKED_UP posts the MM goods issue, DELIVERED
 * emits `shipment.delivered` (SD delivers the order and posts the invoice).
 */
@Injectable()
export class ConsignmentsService {
    private readonly logger = new Logger(ConsignmentsService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly shipments: ShipmentsService,
        @Inject(forwardRef(() => GoodsIssueService))
        private readonly goodsIssues: GoodsIssueService,
        @Optional() private readonly events?: EventEmitter2,
    ) {}

    async findAll(query: ConsignmentListQuery): Promise<PaginatedResult<unknown>> {
        const { page, pageSize, skip } = parsePagination(query)
        const where: Prisma.CourierConsignmentWhereInput = {}
        if (query.status) {
            if (!CONSIGNMENT_STATUSES.has(query.status as CourierConsignmentStatus)) {
                throw new BadRequestException('Invalid consignment status')
            }
            where.status = query.status as CourierConsignmentStatus
        }
        if (query.carrierId) where.carrierId = query.carrierId
        if (query.search?.trim()) {
            const q = query.search.trim()
            where.OR = [
                { trackingNumber: { contains: q, mode: 'insensitive' } },
                { shipment: { reference: { contains: q, mode: 'insensitive' } } },
                { shipment: { customerName: { contains: q, mode: 'insensitive' } } },
            ]
        }
        const [rows, total] = await this.prisma.$transaction([
            this.prisma.courierConsignment.findMany({
                where,
                orderBy: { bookedAt: 'desc' },
                skip,
                take: pageSize,
                include: listInclude,
            }),
            this.prisma.courierConsignment.count({ where }),
        ])
        return { data: rows.map(withTrackingUrl), total, page, pageSize }
    }

    async findOne(id: string) {
        const row = assertFound(
            await this.prisma.courierConsignment.findUnique({
                where: { id },
                include: {
                    ...listInclude,
                    events: { orderBy: { occurredAt: 'desc' } },
                },
            }),
            'Consignment not found',
        )
        return {
            ...withTrackingUrl(row),
            nextStatuses: nextCourierStatuses(row.status, row.pickedUpAt != null),
        }
    }

    /**
     * Manual courier status update (webhook / poll use the same path in Phase 4).
     * Goods issue is posted before the status moves, so a failed GI leaves the
     * consignment BOOKED and the dispatcher can retry.
     */
    async updateStatus(id: string, body: UpdateStatusBody, performedBy?: string) {
        const raw = requireString(body.status, 'status').toUpperCase()
        if (!CONSIGNMENT_STATUSES.has(raw as CourierConsignmentStatus)) {
            throw new BadRequestException('Invalid consignment status')
        }
        const to = raw as CourierConsignmentStatus
        const occurredAt = optionalDate(body.occurredAt) ?? new Date()
        if (occurredAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
            throw new BadRequestException('occurredAt cannot be in the future')
        }
        const note = optionalString(body.note) ?? null
        const podUrl = optionalString(body.podUrl) ?? null

        const current = assertFound(
            await this.prisma.courierConsignment.findUnique({
                where: { id },
                include: {
                    carrier: { select: { name: true } },
                    shipment: {
                        select: {
                            id: true,
                            reference: true,
                            packageId: true,
                            goodsIssueId: true,
                        },
                    },
                },
            }),
            'Consignment not found',
        )
        const pickedUp = current.pickedUpAt != null
        assertCourierTransition(current.status, to, pickedUp)

        if (to === CourierConsignmentStatus.PICKED_UP) {
            await this.postGoodsIssue(current.shipment, performedBy)
        }

        const shipmentStatus = shipmentStatusForCourier(to)
        await this.prisma.$transaction(async (tx) => {
            const claim = await tx.courierConsignment.updateMany({
                where: { id, status: current.status },
                data: {
                    status: to,
                    ...(to === CourierConsignmentStatus.PICKED_UP
                        ? { pickedUpAt: occurredAt }
                        : {}),
                    ...(to === CourierConsignmentStatus.DELIVERED
                        ? { deliveredAt: occurredAt, ...(podUrl ? { podUrl } : {}) }
                        : {}),
                },
            })
            if (claim.count === 0) {
                throw new ConflictException(
                    'Consignment status changed meanwhile — reload and try again',
                )
            }
            await tx.courierConsignmentEvent.create({
                data: {
                    consignmentId: id,
                    status: to,
                    occurredAt,
                    source: CourierEventSource.MANUAL,
                    note,
                    createdBy: performedBy ?? null,
                },
            })
            await tx.shipment.update({
                where: { id: current.shipment.id },
                data: {
                    status: shipmentStatus,
                    ...(to === CourierConsignmentStatus.DELIVERED
                        ? { deliveredAt: occurredAt }
                        : {}),
                    ...(to === CourierConsignmentStatus.EXCEPTION
                        ? {
                              exceptionNote:
                                  note ?? `${current.carrier.name} reported an exception`,
                              exceptionAt: occurredAt,
                          }
                        : {}),
                    // Cancelled before pickup: the shipment is free for the own fleet again.
                    ...(to === CourierConsignmentStatus.CANCELLED
                        ? { executionMode: ShipmentExecutionMode.OWN_FLEET }
                        : {}),
                },
            })
        })

        if (to === CourierConsignmentStatus.DELIVERED) {
            // Same contract as trip completion: SD delivers the order and posts the invoice.
            this.events?.emit('shipment.delivered', {
                shipmentIds: [current.shipment.id],
            })
        }
        if (to === CourierConsignmentStatus.CANCELLED) {
            this.events?.emit(COURIER_EVENTS.CONSIGNMENT_CHANGED, {
                shipmentId: current.shipment.id,
                carrierName: null,
                trackingNumber: null,
            } satisfies CourierConsignmentChangedEvent)
        }
        this.events?.emit(COURIER_EVENTS.STATUS_CHANGED, {
            consignmentId: id,
            shipmentId: current.shipment.id,
            status: to,
            pickedUp: pickedUp || to === CourierConsignmentStatus.PICKED_UP,
        } satisfies CourierStatusChangedEvent)
        return this.findOne(id)
    }

    /** Courier took the parcel: post the MM goods issue once (same path as trip start). */
    private async postGoodsIssue(
        shipment: { id: string; reference: string; packageId: string | null; goodsIssueId: string | null },
        performedBy?: string,
    ) {
        if (!shipment.packageId || shipment.goodsIssueId) return
        try {
            const gi = await this.goodsIssues.issueAndPostFromPackage(
                shipment.packageId,
                { createdBy: performedBy },
            )
            await this.prisma.shipment.update({
                where: { id: shipment.id },
                data: { goodsIssueId: gi.id },
            })
            await this.prisma.wmPackage.updateMany({
                where: {
                    id: shipment.packageId,
                    status: { in: ['READY_FOR_DISPATCH', 'SEALED'] },
                },
                data: { status: 'DISPATCHED' },
            })
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Goods issue failed'
            this.logger.warn(
                `Courier pickup GI failed for ${shipment.reference}: ${message}`,
            )
            throw new BadRequestException(
                `Cannot mark picked up: goods issue failed for ${shipment.reference}: ${message}`,
            )
        }
    }

    /**
     * Ship with courier: READY own-fleet shipment → THIRD_PARTY + consignment BOOKED.
     * A CANCELLED consignment on the same shipment is re-booked in place (one per shipment).
     */
    async book(body: BookConsignmentBody, performedBy?: string) {
        const shipmentId = requireString(body.shipmentId, 'shipmentId')
        const carrierId = requireString(body.carrierId, 'carrierId')
        const trackingNumber = normalizeTrackingNumber(body.trackingNumber)
        const externalBookingId = optionalString(body.externalBookingId) ?? null
        const notes = optionalString(body.notes) ?? null

        const shipment = assertFound(
            await this.prisma.shipment.findUnique({
                where: { id: shipmentId },
                include: {
                    courierConsignment: { include: { carrier: true } },
                    package: { select: { salesOrderId: true } },
                },
            }),
            'Shipment not found',
        )
        if (shipment.movementType !== ShipmentMovementType.DELIVERY) {
            throw new BadRequestException(
                'Only customer deliveries can ship with a courier',
            )
        }
        if (shipment.status !== ShipmentStatus.READY) {
            throw new BadRequestException(
                `Only READY shipments can ship with a courier (current: ${shipment.status})`,
            )
        }
        const existing = shipment.courierConsignment
        if (existing && existing.status !== CourierConsignmentStatus.CANCELLED) {
            throw new ConflictException(
                `Shipment is already booked with ${existing.carrier.name}`,
            )
        }
        const carrier = assertFound(
            await this.prisma.carrier.findUnique({ where: { id: carrierId } }),
            'Carrier not found',
        )
        if (!carrier.isActive) {
            throw new BadRequestException(`${carrier.name} is not active`)
        }
        await this.assertNotCod(shipment.id, shipment.package?.salesOrderId ?? null)

        try {
            const consignmentId = await this.prisma.$transaction(async (tx) => {
                const claim = await tx.shipment.updateMany({
                    where: { id: shipment.id, status: ShipmentStatus.READY },
                    data: { executionMode: ShipmentExecutionMode.THIRD_PARTY },
                })
                if (claim.count === 0) {
                    throw new ConflictException('Shipment is no longer READY')
                }
                await assertNotOnOwnFleet(tx, shipment.id)
                const data = {
                    carrierId: carrier.id,
                    trackingNumber,
                    externalBookingId,
                    notes,
                    status: CourierConsignmentStatus.BOOKED,
                    bookedAt: new Date(),
                    createdBy: performedBy ?? null,
                }
                let id: string
                if (existing) {
                    const rebook = await tx.courierConsignment.updateMany({
                        where: {
                            id: existing.id,
                            status: CourierConsignmentStatus.CANCELLED,
                        },
                        data: {
                            ...data,
                            pickedUpAt: null,
                            deliveredAt: null,
                            podUrl: null,
                            labelUrl: null,
                        },
                    })
                    if (rebook.count === 0) {
                        throw new ConflictException('Shipment was booked concurrently')
                    }
                    id = existing.id
                } else {
                    const created = await tx.courierConsignment.create({
                        data: { ...data, shipmentId: shipment.id },
                        select: { id: true },
                    })
                    id = created.id
                }
                await tx.courierConsignmentEvent.create({
                    data: {
                        consignmentId: id,
                        status: CourierConsignmentStatus.BOOKED,
                        source: CourierEventSource.MANUAL,
                        note: `Booked with ${carrier.name} · ${trackingNumber}`,
                        createdBy: performedBy ?? null,
                    },
                })
                return id
            })
            this.events?.emit(COURIER_EVENTS.CONSIGNMENT_CHANGED, {
                shipmentId: shipment.id,
                carrierName: carrier.name,
                trackingNumber,
            } satisfies CourierConsignmentChangedEvent)
            return this.findOne(consignmentId)
        } catch (err) {
            if (isUniqueViolation(err)) {
                throw new ConflictException(
                    `Tracking number ${trackingNumber} is already used for ${carrier.name}`,
                )
            }
            throw err
        }
    }

    /** Courier COD stays blocked until 3PL remittance exists (Phase 5). */
    private async assertNotCod(shipmentId: string, packageSalesOrderId: string | null) {
        const salesOrderId =
            packageSalesOrderId ??
            (await this.shipments.resolveSalesOrderId(shipmentId))
        if (!salesOrderId) return
        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: salesOrderId },
            select: { orderNumber: true, paymentMethod: true },
        })
        if (order?.paymentMethod === 'COD') {
            throw new BadRequestException(
                `${order.orderNumber} is Cash on Delivery — ship it with the own fleet until courier COD remittance is available`,
            )
        }
    }
}
