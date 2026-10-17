import {
    BadRequestException,
    ConflictException,
    Injectable,
} from '@nestjs/common'
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
import { ShipmentsService } from '../shipments/shipments.service'
import {
    assertFound,
    optionalString,
    parsePagination,
    requireString,
    type ListQuery,
    type PaginatedResult,
} from '../scm.utils'
import { normalizeTrackingNumber, trackingUrl } from './couriers.rules'

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
 * SCM Couriers — third-party (3PL) hand-off for a READY shipment.
 * Phase 1: book (carrier + tracking number). Status changes, goods issue on
 * PICKED_UP and SD delivery on DELIVERED follow in later phases (docs/SCM_COURIERS.md).
 */
@Injectable()
export class ConsignmentsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly shipments: ShipmentsService,
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
        return withTrackingUrl(row)
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
