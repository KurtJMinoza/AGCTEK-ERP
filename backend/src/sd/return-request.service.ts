import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { Prisma } from '@prisma/client'

const DAMAGED_REASONS = new Set(['DAMAGED_ITEM', 'DEFECTIVE_ITEM'])

export type CreateReturnRequestInput = {
    companyId: string
    salesOrderId: string
    customerId: string
    reason?: string
    conditionNote?: string
    photos?: unknown
    requestedBy?: string
    lines: Array<{
        salesOrderLineId: string
        quantity: number
        reason?: string
        conditionNote?: string
    }>
}

/** Composes a return request on behalf of a signed-in storefront customer. */
export type CreateCustomerReturnInput = {
    reason?: string
    conditionNote?: string
    photos?: unknown
    lines: Array<{
        salesOrderLineId: string
        quantity: number
        reason?: string
        conditionNote?: string
    }>
}

/**
 * Customer return requests raised from delivered/fulfilled sales orders
 * (storefront or admin). Approval hands the request to MM customer returns
 * (intake → inspection → disposition), keeping SD → MM ownership:
 * SD owns the customer request, MM owns stock disposition.
 */
@Injectable()
export class ReturnRequestService {
    private readonly logger = new Logger(ReturnRequestService.name)

    constructor(private prisma: PrismaService) {}

    /**
     * Storefront path: the customer is authenticated, so the order must belong
     * to them and company scope is resolved server-side (never client-supplied).
     */
    async createForCustomer(
        clientId: string,
        salesOrderId: string,
        input: CreateCustomerReturnInput,
    ) {
        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: salesOrderId },
            include: { lines: true },
        })
        if (!order || order.customerId !== clientId) {
            throw new NotFoundException('Sales order not found')
        }
        if (!order.companyId) {
            throw new BadRequestException(
                'Order has no company scope — contact support to request a return',
            )
        }
        if ((order.status ?? '') !== 'COMPLETED') {
            throw new BadRequestException(
                'Returns are only allowed on delivered (completed) orders',
            )
        }
        const existing = await this.prisma.sdReturnRequest.findFirst({
            where: { salesOrderId: order.id, status: 'REQUESTED' },
            select: { id: true },
        })
        if (existing) {
            throw new BadRequestException(
                'A return request is already pending for this order',
            )
        }
        return this.create({
            companyId: order.companyId,
            salesOrderId: order.id,
            customerId: order.customerId,
            reason: input.reason,
            conditionNote: input.conditionNote,
            photos: input.photos,
            lines: input.lines,
        })
    }

    /** Company-scoped list (returns filtered strictly by companyId). */
    async list(companyId: string) {
        return this.prisma.sdReturnRequest.findMany({
            where: { companyId },
            include: {
                lines: { orderBy: { id: 'asc' } },
                salesOrder: {
                    select: {
                        orderNumber: true,
                        customerName: true,
                        status: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
        })
    }

    /** Idempotent: an open (REQUESTED) request for the same order + lines is returned. */
    async create(input: CreateReturnRequestInput) {
        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: input.salesOrderId },
            include: { lines: true },
        })
        if (!order || order.companyId !== input.companyId) {
            throw new NotFoundException('Sales order not found in company scope')
        }
        if ((order.status ?? '') !== 'COMPLETED') {
            throw new BadRequestException(
                'Returns are only allowed on delivered (completed) orders',
            )
        }

        const lineIds = input.lines.map((l) => l.salesOrderLineId)
        const existing = await this.prisma.sdReturnRequest.findFirst({
            where: { salesOrderId: order.id, status: 'REQUESTED' },
            include: { lines: { select: { salesOrderLineId: true } } },
        })
        if (
            existing &&
            existing.lines.length === lineIds.length &&
            lineIds.every((id) =>
                existing.lines.some((l) => l.salesOrderLineId === id),
            )
        ) {
            return existing
        }

        for (const line of input.lines) {
            const soLine = order.lines.find(
                (l) => l.id === line.salesOrderLineId,
            )
            if (!soLine) {
                throw new BadRequestException(
                    `Line ${line.salesOrderLineId} is not on sales order ${order.orderNumber}`,
                )
            }
            if (line.quantity > Number(soLine.quantity)) {
                throw new BadRequestException(
                    'Return quantity exceeds the ordered quantity',
                )
            }
        }

        return this.prisma.sdReturnRequest.create({
            data: {
                requestNumber: await this.nextRequestNumber(),
                companyId: order.companyId,
                salesOrderId: order.id,
                customerId: input.customerId,
                reason: input.reason,
                conditionNote: input.conditionNote,
                photos: (input.photos as Prisma.InputJsonValue) ?? undefined,
                requestedBy: input.requestedBy,
                status: 'REQUESTED',
                lines: {
                    create: input.lines.map((line, index) => {
                        const soLine = order.lines.find(
                            (l) => l.id === line.salesOrderLineId,
                        )
                        const reason = line.reason ?? input.reason
                        return {
                            salesOrderLineId: line.salesOrderLineId,
                            variantId: soLine?.variantId ?? undefined,
                            materialId: soLine?.materialId ?? undefined,
                            quantity: line.quantity,
                            reason,
                            conditionNote:
                                line.conditionNote ?? input.conditionNote,
                            // Damaged → inspection/disposition only (never auto-restock).
                            disposition: this.initialDisposition(reason),
                        }
                    }),
                },
            },
            include: {
                lines: true,
                salesOrder: {
                    select: { orderNumber: true, customerName: true },
                },
            },
        })
    }

    /**
     * Approval routes the request to MM customer returns for intake/inspection
     * and final disposition (restock / quality hold / damaged / scrap / disposal
     * / refund-only). Idempotent via a unique MM return link per request.
     */
    async approve(
        id: string,
        companyId: string,
        approvedBy?: string,
    ) {
        const request = await this.prisma.sdReturnRequest.findFirst({
            where: { id, companyId },
            include: { lines: true },
        })
        if (!request) {
            throw new NotFoundException('Return request not found in company scope')
        }
        if (request.status !== 'REQUESTED') return request

        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: request.salesOrderId },
            select: { warehouseId: true },
        })
        if (!order?.warehouseId) {
            throw new BadRequestException(
                'Order has no warehouse — cannot route the return to receiving',
            )
        }
        if (request.lines.some((l) => !l.materialId)) {
            throw new BadRequestException(
                'Return lines need an MM material mapping before approval',
            )
        }

        let mmCustomerReturnId = request.mmCustomerReturnId
        if (!mmCustomerReturnId) {
            const mmReturn = await this.prisma.mmCustomerReturn.create({
                data: {
                    returnNumber: `CR-${request.requestNumber}`,
                    companyId: request.companyId,
                    warehouseId: order.warehouseId,
                    sdReturnRequestRef: request.id,
                    customerRef: request.customerId,
                    reason: request.reason,
                    status: 'DRAFT',
                    lines: {
                        create: request.lines.map((line, index) => ({
                            lineNumber: index + 1,
                            materialId: line.materialId!,
                            uomId: '',
                            quantity: line.quantity,
                            unitCost: 0,
                            // Damaged/defective → blocked until inspection decides.
                            disposition:
                                line.disposition === 'QUALITY_HOLD'
                                    ? 'BLOCK'
                                    : (line.disposition ?? 'RESTOCK'),
                            dispositionStatus: 'PENDING',
                        })),
                    },
                },
            })
            mmCustomerReturnId = mmReturn.id
            await this.prisma.sdReturnRequest.update({
                where: { id: request.id },
                data: { mmCustomerReturnId },
            })
        }

        return this.prisma.sdReturnRequest.update({
            where: { id: request.id },
            data: { status: 'APPROVED', approvedBy, approvedAt: new Date() },
            include: { lines: true },
        })
    }

    private initialDisposition(reason?: string | null): string {
        if (!reason) return 'RESTOCK'
        const normalized = reason
            .toUpperCase()
            .replace(/[^A-Z_]+/g, '_')
        return DAMAGED_REASONS.has(normalized) ? 'QUALITY_HOLD' : 'RESTOCK'
    }

    private async nextRequestNumber() {
        const prefix = `RET-${new Date()
            .toISOString()
            .slice(0, 10)
            .replace(/-/g, '')}`
        const count = await this.prisma.sdReturnRequest.count({
            where: { requestNumber: { startsWith: prefix } },
        })
        return `${prefix}-${String(count + 1).padStart(4, '0')}`
    }
}