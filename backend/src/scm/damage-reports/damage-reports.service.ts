import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { SalesReturnService } from '../../sd/sales-return.service'
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
    audits: { orderBy: { performedAt: 'asc' as const } },
} satisfies Prisma.DamageReportInclude

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
        private readonly salesReturns: SalesReturnService,
    ) {}

    async createForShipment(
        shipmentId: string,
        input: CreateDamageReportInput,
        user: DamageReportActor,
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

        let shipmentLineId: string | null = input.shipmentLineId || null
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
                    reportedBy: user.id,
                    createdBy: user.id,
                    ...(idempotencyKey ? { idempotencyKey } : {}),
                    audits: {
                        create: {
                            action: 'CREATED',
                            performedBy: user.id,
                            details: { companyId, salesOrderStatus },
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
                'Cannot cancel a damage report that already created its SD sales return',
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
     * SCM → SD handoff (Phase 3). Creating a Sales Return from this report is a command, not a
     * fact: it runs inside one transaction with the SD create (SD writes its own tables, SCM
     * writes the link), is idempotent on `damageReportId`, and only ever produces a REQUESTED
     * return — authorization is a separate SD transition. UNRESOLVED or non-line-level reports
     * stay SUBMITTED for manual handling and are never guessed.
     */
    async initiateSalesReturn(reportId: string, user: DamageReportActor) {
        if (!user.role)
            throw new BadRequestException(
                'Missing role for cross-module handoff',
            )
        const actor = { id: user.id, userName: user.userName, role: user.role }
        const report = await this.findOne(reportId)
        if (report.salesOrderStatus !== 'RESOLVED' || !report.salesOrderId) {
            throw new ConflictException(
                'This report has no resolvable sales order; resolve the order before handing off',
            )
        }
        if (report.status !== DAMAGE_REPORT_STATUS.SUBMITTED) {
            throw new ConflictException(
                report.status === DAMAGE_REPORT_STATUS.RETURN_CREATED
                    ? 'This report already created its SD sales return'
                    : 'This report is cancelled and cannot be handed off',
            )
        }
        const salesOrderId = report.salesOrderId

        const result = await this.prisma.$transaction(async (tx) => {
            // Optimistic claim: only one handoff per report may proceed; the loser returns the
            // winner's return (idempotent) instead of creating a duplicate.
            const claim = await tx.damageReport.updateMany({
                where: {
                    id: reportId,
                    status: DAMAGE_REPORT_STATUS.SUBMITTED,
                    sdSalesReturnId: null,
                },
                data: {
                    status: DAMAGE_REPORT_STATUS.RETURN_CREATED,
                    updatedBy: user.id,
                },
            })
            if (claim.count === 0) {
                const existing = await tx.sdSalesReturn.findUnique({
                    where: { damageReportId: reportId },
                    select: { id: true },
                })
                if (existing) {
                    return {
                        created: false,
                        salesReturn: await this.salesReturns.findOne(
                            existing.id,
                        ),
                    }
                }
                throw new ConflictException(
                    'A return is already being created for this report; reload and retry',
                )
            }

            // Exact line resolution against the reservation chain; rejects ambiguity (guardrail 2).
            const target = await this.resolveHandoffTarget(tx, report)
            const created = await this.salesReturns.create(
                {
                    salesOrderId,
                    companyId: report.companyId,
                    damageReportId: reportId,
                    reason: 'DAMAGED_IN_TRANSIT',
                    notes: `Damage report ${report.reference}`,
                    lines: [
                        {
                            salesOrderLineId: target.salesOrderLineId,
                            materialId: target.materialId,
                            quantity: report.damagedQuantity,
                        },
                    ],
                },
                actor,
                { tx },
            )
            await tx.damageReport.update({
                where: { id: reportId },
                data: { sdSalesReturnId: created.id },
            })
            return { created: true, salesReturn: created }
        })

        return { ...result, damageReport: await this.findOne(reportId) }
    }

    /**
     * Resolves the exact order line for the report's affected shipment line. Material matching
     * alone is insufficient; the reservation chain (`MmInventoryReservationLine.demandReferenceLineId`)
     * must resolve to exactly one distinct SdSalesOrderLine, otherwise the handoff is rejected.
     */
    private async resolveHandoffTarget(
        tx: Prisma.TransactionClient,
        report: { salesOrderId: string | null; shipmentLineId: string | null },
    ) {
        if (!report.salesOrderId) {
            throw new ConflictException('No sales order to hand this report to')
        }
        if (!report.shipmentLineId) {
            throw new ConflictException(
                'The report is not line-level; resolve the affected item before handing off',
            )
        }
        const line = await tx.shipmentLine.findUnique({
            where: { id: report.shipmentLineId },
            select: { packageItemId: true },
        })
        if (!line?.packageItemId) {
            throw new ConflictException(
                'The damaged line has no MM package item; auto-resolution is unavailable',
            )
        }
        const item = await tx.wmPackageItem.findUnique({
            where: { id: line.packageItemId },
            select: { materialId: true },
        })
        if (!item) {
            throw new ConflictException(
                'The damaged line has no MM package item; auto-resolution is unavailable',
            )
        }
        const header = await tx.mmInventoryReservationHeader.findFirst({
            where: {
                sourceModule: 'SD',
                sourceDocumentType: 'SALES_ORDER',
                sourceDocumentId: report.salesOrderId,
            },
            select: { id: true },
        })
        if (!header) {
            throw new ConflictException(
                'No MM reservation header links this shipment to the sales order',
            )
        }
        const reservationLines = await tx.mmInventoryReservationLine.findMany({
            where: { headerId: header.id, materialId: item.materialId },
            select: { demandReferenceLineId: true },
        })
        const orderLineIds = [
            ...new Set(
                reservationLines
                    .map((r) => r.demandReferenceLineId)
                    .filter((id): id is string => Boolean(id)),
            ),
        ]
        if (orderLineIds.length === 0) {
            throw new ConflictException(
                'The damaged item cannot be mapped to a sales order line',
            )
        }
        if (orderLineIds.length > 1) {
            throw new ConflictException(
                'The damaged item matches multiple sales order lines; resolve the exact line before handing off',
            )
        }
        return {
            salesOrderLineId: orderLineIds[0],
            materialId: item.materialId,
        }
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
