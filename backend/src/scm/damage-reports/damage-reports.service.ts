import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
    assertFound,
    optionalString,
    parsePagination,
    requireInt,
    requireString,
    type ListQuery,
    type PaginatedResult,
} from '../scm.utils'
import { ShipmentsService } from '../shipments/shipments.service'
import { assertAssignedDriver } from '../trips/trip-execution.rules'
import {
    DAMAGE_REPORT_SOURCE,
    driverReportBlocker,
    driverReportGraceMinutes,
    parseDriverPhotos,
} from './driver-damage.rules'

export const DAMAGE_REPORT_STATUS = {
    SUBMITTED: 'SUBMITTED',
    CANCELLED: 'CANCELLED',
    RETURN_CREATED: 'RETURN_CREATED',
} as const
export type DamageReportStatus =
    (typeof DAMAGE_REPORT_STATUS)[keyof typeof DAMAGE_REPORT_STATUS]

/** Damage may only be reported against a delivery that actually happened or was held on exception. */
export const REPORTABLE_SHIPMENT_STATUSES: ReadonlySet<string> = new Set([
    'DELIVERED',
    'EXCEPTION_HOLD',
])

const SALES_ORDER_STATUS = {
    RESOLVED: 'RESOLVED',
    UNRESOLVED: 'UNRESOLVED',
} as const

type DamageReportActor = { id: string; userName?: string; role?: string }

export type CreateDamageReportInput = {
    companyId?: string
    shipmentLineId?: string | null
    damagedQuantity?: number
    description?: string
    photoUrls?: string[] | string
    idempotencyKey?: string
}

export type DriverDamageReportInput = {
    shipmentId?: string
    shipmentLineId?: string
    damagedQuantity?: number
    description?: string
    photoUrls?: unknown
    idempotencyKey?: string
}

type ReportOrigin = { tripStopId: string; driverId: string }

type CancelDamageReportInput = { reason?: string }

const reportInclude = {
    shipment: {
        select: {
            id: true,
            reference: true,
            customerName: true,
            status: true,
            deliveredAt: true,
            exceptionCode: true,
            exceptionNote: true,
        },
    },
    shipmentLine: {
        select: {
            id: true,
            lineNo: true,
            materialCode: true,
            description: true,
            quantity: true,
        },
    },
    sdReturnRequest: {
        select: {
            id: true,
            requestNumber: true,
            status: true,
            refundStatus: true,
        },
    },
    audits: { orderBy: { performedAt: 'asc' as const } },
} satisfies Prisma.DamageReportInclude

function dropoffShipmentIds(stop: {
    shipments: Array<{ action: string; shipmentId: string }>
}): string[] {
    return stop.shipments
        .filter((link) => link.action === 'DROPOFF')
        .map((link) => link.shipmentId)
}

function parsePhotoUrls(
    value: string[] | string | null | undefined,
): string[] | null {
    const raw = Array.isArray(value)
        ? value
        : typeof value === 'string'
          ? value.split(/\s*[,;\n]\s*/)
          : []
    const urls = raw.map((u) => u.trim()).filter((u) => u.length > 0)
    return urls.length > 0 ? urls : null
}

/**
 * SCM damage reports against deliveries (customer return integration — Phase 2).
 * Reports are SCM-owned and append to the delivery history (a completed delivery is never
 * rewritten). The SD Sales Return handoff (Phase 3) and MM intake (Phase 4) will reference
 * these records; this service does not write to SD or MM tables.
 *
 * Design decisions (see docs/SCM_DAMAGE_REPORT_DESIGN.md): company scope and sales-order
 * resolution reuse existing SCM/SD infrastructure; a report is only handed to SD Sales Return
 * when the order relationship is verified RESOLVED — UNRESOLVED shipments are reported but
 * excluded from the automated handoff.
 */
@Injectable()
export class DamageReportsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly shipments: ShipmentsService,
    ) {}

    async createForShipment(
        shipmentId: string,
        input: CreateDamageReportInput,
        user: DamageReportActor,
        driverOrigin?: ReportOrigin,
    ) {
        const idempotencyKey = input.idempotencyKey?.trim() || null
        if (idempotencyKey) {
            const existing = await this.prisma.damageReport.findUnique({
                where: { idempotencyKey },
            })
            if (existing) return this.findOne(existing.id)
        }

        const providedCompanyId = optionalString(input.companyId)

        const shipment = await this.prisma.shipment.findUnique({
            where: { id: shipmentId },
            include: { lines: { orderBy: { lineNo: 'asc' } } },
        })
        if (!shipment) throw new NotFoundException('Shipment not found')
        if (!REPORTABLE_SHIPMENT_STATUSES.has(shipment.status)) {
            throw new ConflictException(
                `Damage can only be reported on a DELIVERED or EXCEPTION_HOLD shipment (current: ${shipment.status})`,
            )
        }

        const damagedQuantity = requireInt(
            input.damagedQuantity,
            'damagedQuantity',
        )
        if (damagedQuantity < 1) {
            throw new BadRequestException('damagedQuantity must be at least 1')
        }
        const description = requireString(input.description, 'description')

        const shipmentLineId: string | null = input.shipmentLineId || null
        if (shipmentLineId) {
            const line = shipment.lines.find((l) => l.id === shipmentLineId)
            if (!line) {
                throw new BadRequestException(
                    'shipmentLineId does not belong to this shipment',
                )
            }
            if (damagedQuantity > line.quantity) {
                throw new BadRequestException(
                    `damagedQuantity exceeds the line quantity (${line.quantity})`,
                )
            }
        } else if (damagedQuantity > shipment.quantity) {
            throw new BadRequestException(
                `damagedQuantity exceeds the shipment quantity (${shipment.quantity})`,
            )
        }

        // Verifiable SO resolution: the report records whatever order the chain proves. Shipments
        // without a provable order stay UNRESOLVED and are excluded from the automated SD handoff.
        const salesOrderId =
            await this.shipments.resolveSalesOrderId(shipmentId)
        const salesOrderStatus = salesOrderId
            ? SALES_ORDER_STATUS.RESOLVED
            : SALES_ORDER_STATUS.UNRESOLVED

        // Company scope (SCM cargo has no company column): derive it from the proven SD order when
        // possible, otherwise require the caller to supply it — the UNRESOLVED case is never silently
        // assumed to belong to a company.
        const companyId =
            providedCompanyId ??
            (await this.orderCompanyId(salesOrderId)) ??
            (() => {
                throw new BadRequestException(
                    'companyId is required: this shipment has no resolvable sales order to scope the report',
                )
            })()
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
        })
        if (!company) throw new BadRequestException('Unknown companyId')
        const photoUrls = parsePhotoUrls(input.photoUrls)

        const reference = await this.nextReference()
        const row = await this.prisma.$transaction(async (tx) => {
            const created = await tx.damageReport.create({
                data: {
                    reference,
                    companyId,
                    shipmentId,
                    shipmentLineId,
                    salesOrderId,
                    salesOrderStatus,
                    damagedQuantity,
                    description,
                    photoUrls: photoUrls as Prisma.InputJsonValue | undefined,
                    source: driverOrigin
                        ? DAMAGE_REPORT_SOURCE.DRIVER
                        : DAMAGE_REPORT_SOURCE.STAFF,
                    tripStopId: driverOrigin?.tripStopId ?? null,
                    reportedBy: user.id,
                    createdBy: user.id,
                    ...(idempotencyKey ? { idempotencyKey } : {}),
                    audits: {
                        create: {
                            action: 'CREATED',
                            performedBy: user.id,
                            details: {
                                companyId,
                                salesOrderStatus,
                                ...(driverOrigin
                                    ? {
                                          source: DAMAGE_REPORT_SOURCE.DRIVER,
                                          driverId: driverOrigin.driverId,
                                          tripStopId: driverOrigin.tripStopId,
                                      }
                                    : {}),
                            },
                        },
                    },
                },
                include: reportInclude,
            })
            return created
        })
        return row
    }

    async listForShipment(
        shipmentId: string,
        query: ListQuery,
    ): Promise<PaginatedResult<unknown>> {
        assertFound(
            await this.prisma.shipment.findUnique({
                where: { id: shipmentId },
                select: { id: true },
            }),
            'Shipment not found',
        )
        const { page, pageSize, skip } = parsePagination(query)
        const where: Prisma.DamageReportWhereInput = { shipmentId }
        const [data, total] = await this.prisma.$transaction([
            this.prisma.damageReport.findMany({
                where,
                include: reportInclude,
                orderBy: { createdAt: 'desc' },
                skip,
                take: pageSize,
            }),
            this.prisma.damageReport.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    /** Driver app: what can be reported on a delivered stop, and what already was. */
    async driverStopContext(
        tripId: string,
        stopId: string,
        callerDriverId: string | null | undefined,
    ) {
        const { trip, stop } = await this.loadDriverStop(
            tripId,
            stopId,
            callerDriverId,
        )
        const shipmentIds = dropoffShipmentIds(stop)
        const [shipments, reports] = await Promise.all([
            this.prisma.shipment.findMany({
                where: { id: { in: shipmentIds } },
                select: {
                    id: true,
                    reference: true,
                    customerName: true,
                    status: true,
                    lines: {
                        orderBy: { lineNo: 'asc' },
                        select: {
                            id: true,
                            lineNo: true,
                            materialCode: true,
                            description: true,
                            quantity: true,
                        },
                    },
                },
            }),
            this.prisma.damageReport.findMany({
                where: {
                    shipmentId: { in: shipmentIds },
                    status: { not: DAMAGE_REPORT_STATUS.CANCELLED },
                },
                include: reportInclude,
                orderBy: { createdAt: 'desc' },
            }),
        ])
        const blockedReason = driverReportBlocker(
            trip,
            stop,
            new Date(),
            driverReportGraceMinutes(),
        )
        return {
            canReport: blockedReason === null,
            blockedReason,
            shipments,
            reports,
        }
    }

    /**
     * Driver evidence after a successful delivery. The stop stays COMPLETED and the shipment
     * DELIVERED — damage is never a failed delivery. Line-level only, so staff can hand it to SD.
     */
    async createFromDriver(
        tripId: string,
        stopId: string,
        input: DriverDamageReportInput,
        callerDriverId: string | null | undefined,
        user: DamageReportActor,
    ) {
        const { trip, stop } = await this.loadDriverStop(
            tripId,
            stopId,
            callerDriverId,
        )
        const blockedReason = driverReportBlocker(
            trip,
            stop,
            new Date(),
            driverReportGraceMinutes(),
        )
        if (blockedReason) throw new ConflictException(blockedReason)

        const shipmentId = requireString(input.shipmentId, 'shipmentId')
        if (!dropoffShipmentIds(stop).includes(shipmentId)) {
            throw new BadRequestException(
                'This shipment was not delivered at this stop',
            )
        }
        const shipmentLineId = requireString(
            input.shipmentLineId,
            'shipmentLineId',
        )
        return this.createForShipment(
            shipmentId,
            {
                shipmentLineId,
                damagedQuantity: input.damagedQuantity,
                description: input.description,
                photoUrls: parseDriverPhotos(input.photoUrls) ?? undefined,
                idempotencyKey: input.idempotencyKey,
            },
            user,
            { tripStopId: stopId, driverId: trip.driverId! },
        )
    }

    private async loadDriverStop(
        tripId: string,
        stopId: string,
        callerDriverId: string | null | undefined,
    ) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            select: {
                id: true,
                driverId: true,
                status: true,
                completedAt: true,
                stops: {
                    where: { id: stopId },
                    select: {
                        id: true,
                        status: true,
                        shipments: {
                            select: { action: true, shipmentId: true },
                        },
                    },
                },
            },
        })
        if (!trip) throw new NotFoundException('Trip not found')
        assertAssignedDriver(trip, callerDriverId)
        const stop = trip.stops[0]
        if (!stop) throw new NotFoundException('Stop not found on this trip')
        return { trip, stop }
    }

    async findOne(reportId: string) {
        return assertFound(
            await this.prisma.damageReport.findUnique({
                where: { id: reportId },
                include: reportInclude,
            }),
            'Damage report not found',
        )
    }

    /** Withdraw a mistaken report before it reaches the SD/MM handoff. */
    async cancel(
        reportId: string,
        input: CancelDamageReportInput,
        user: DamageReportActor,
    ) {
        const report = await this.findOne(reportId)
        if (report.customerReturnId) {
            throw new ConflictException(
                'Cannot cancel a damage report that already opened an MM customer return intake',
            )
        }
        if (
            report.sdSalesReturnId ||
            report.status === DAMAGE_REPORT_STATUS.RETURN_CREATED
        ) {
            throw new ConflictException(
                'Cannot cancel a damage report that already created its customer return',
            )
        }
        await this.prisma.$transaction(async (tx) => {
            const result = await tx.damageReport.updateMany({
                where: { id: reportId, status: DAMAGE_REPORT_STATUS.SUBMITTED },
                data: {
                    status: DAMAGE_REPORT_STATUS.CANCELLED,
                    updatedBy: user.id,
                },
            })
            if (result.count === 0) {
                throw new ConflictException(
                    'Damage report changed concurrently, reload and retry',
                )
            }
            await tx.damageReportAudit.create({
                data: {
                    reportId,
                    action: DAMAGE_REPORT_STATUS.CANCELLED,
                    performedBy: user.id,
                    ...(input.reason?.trim()
                        ? { details: { reason: input.reason.trim() } }
                        : {}),
                },
            })
        })
        return this.findOne(reportId)
    }

    /**
     * Read-only company-scope derivation from the proven SD order. SD stays the owner of the
     * sales order; SCM only reads the order's companyId to scope the report (the same way the
     * shipment's own resolver reads the MM reservation chain).
     */
    private async orderCompanyId(
        salesOrderId: string | null,
    ): Promise<string | null> {
        if (!salesOrderId) return null
        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: salesOrderId },
            select: { companyId: true },
        })
        return order?.companyId ?? null
    }

    private async nextReference(): Promise<string> {
        for (let attempt = 0; attempt < 4; attempt++) {
            const reference = `DR-${Date.now().toString(36).toUpperCase()}${Math.random()
                .toString(36)
                .slice(2, 8)
                .toUpperCase()}`
            const clash = await this.prisma.damageReport.findUnique({
                where: { reference },
            })
            if (!clash) return reference
        }
        return `DR-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`
    }
}
