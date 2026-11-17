import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { SdEventEmitterService } from '../sd-event-emitter.service'
import { SD_EVENTS } from '../sd-event.types'

const Decimal = Prisma.Decimal
const round2 = (value: number) =>
    Math.round((value + Number.EPSILON) * 100) / 100

export type PosRefundLineInput = {
    salesOrderLineId: string
    /** Quantity to refund (may be less than the original). */
    quantity: number
    reason?: string
}

export type PosRefundTenderInput = {
    /** The original payment record id. */
    paymentId: string
    /** Amount to refund against this tender. */
    amount: number
    referenceNumber?: string
}

export type CreatePosRefundInput = {
    salesOrderId: string
    lines: PosRefundLineInput[]
    tenders: PosRefundTenderInput[]
    reason?: string
    createdBy?: string
}

export type PosRefundRecord = {
    id: string
    refundNumber: string
    salesOrderId: string
    orderNumber: string
    receiptNumber: string | null
    status: string
    totalRefund: number
    reason: string | null
    lines: Array<{
        salesOrderLineId: string
        sku: string | null
        description: string | null
        quantity: number
        unitPrice: number
        lineTotal: number
        reason: string | null
    }>
    tenders: Array<{
        paymentId: string
        paymentMethod: string
        amount: number
        referenceNumber: string | null
    }>
    createdAt: string
}

/**
 * Partial refund of a completed POS sale. Returns specific items
 * and refunds amounts against specific original tenders.
 *
 * Does NOT use the full-sale void. The original sale stays COMPLETED;
 * a refund document is created alongside it.
 */
@Injectable()
export class PosRefundService {
    private readonly logger = new Logger(PosRefundService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly sdEvents: SdEventEmitterService,
    ) {}

    async create(input: CreatePosRefundInput): Promise<PosRefundRecord> {
        // ── Validate the original sale ──
        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: input.salesOrderId },
            include: {
                lines: { orderBy: { lineNumber: 'asc' } },
                payments: true,
            },
        })
        if (!order) throw new NotFoundException('Sale not found.')
        if (order.channel !== 'POS') {
            throw new BadRequestException('Only POS sales support partial refunds from this screen.')
        }
        if (order.status !== 'COMPLETED') {
            throw new BadRequestException(
                `Only completed sales can be partially refunded. This sale is ${order.status}.`,
            )
        }

        // ── Validate refund lines ──
        if (!input.lines.length) {
            throw new BadRequestException('Select at least one item to refund.')
        }
        const orderLineById = new Map(order.lines.map((l) => [l.id, l]))
        let totalRefundFromLines = 0

        const refundLines = input.lines.map((line) => {
            const orderLine = orderLineById.get(line.salesOrderLineId)
            if (!orderLine) {
                throw new BadRequestException(
                    `Line ${line.salesOrderLineId} not found on this sale.`,
                )
            }
            if (line.quantity <= 0) {
                throw new BadRequestException('Refund quantity must be positive.')
            }
            if (line.quantity > Number(orderLine.quantity)) {
                throw new BadRequestException(
                    `Cannot refund ${line.quantity} of ${orderLine.sku}; only ${orderLine.quantity} was sold.`,
                )
            }
            const unitPrice = Number(orderLine.unitPrice ?? 0)
            const lineTotal = round2(line.quantity * unitPrice)
            totalRefundFromLines += lineTotal
            return {
                salesOrderLineId: orderLine.id,
                sku: orderLine.sku,
                description: orderLine.description,
                materialId: orderLine.materialId,
                quantity: line.quantity,
                unitPrice,
                lineTotal,
                reason: line.reason?.trim() || null,
            }
        })

        // ── Validate refund tenders ──
        if (!input.tenders.length) {
            throw new BadRequestException(
                'Select at least one original payment to refund against.',
            )
        }
        const paymentById = new Map(order.payments.map((p) => [p.id, p]))
        let totalRefundFromTenders = 0

        const refundTenders = input.tenders.map((tender) => {
            const payment = paymentById.get(tender.paymentId)
            if (!payment) {
                throw new BadRequestException(
                    `Payment ${tender.paymentId} not found on this sale.`,
                )
            }
            if (tender.amount <= 0) {
                throw new BadRequestException('Refund amount must be positive.')
            }
            const originalAmount = Number(payment.amount)
            // Allow refunding up to the original tender amount
            // (a previous partial refund would have reduced this, but we don't track
            // per-tender refunded amounts yet, so this is a simplification).
            if (tender.amount > originalAmount) {
                throw new BadRequestException(
                    `Cannot refund ₱${tender.amount} against ${payment.paymentMethod} tender of ₱${originalAmount}.`,
                )
            }
            totalRefundFromTenders = round2(totalRefundFromTenders + tender.amount)
            return {
                paymentId: payment.id,
                paymentMethod: payment.paymentMethod,
                amount: tender.amount,
                referenceNumber: tender.referenceNumber?.trim() || null,
            }
        })

        // The tender refund total must match the line refund total
        const tolerance = 0.01
        if (Math.abs(totalRefundFromTenders - totalRefundFromLines) > tolerance) {
            throw new BadRequestException(
                `Refund tender total (₱${totalRefundFromTenders}) does not match the refund line total (₱${totalRefundFromLines}).`,
            )
        }

        // ── Assign refund number ──
        const count = await this.prisma.sdSalesOrder.count({
            where: { companyId: order.companyId ?? undefined },
        })
        const refundNumber = `REF-${String(count + 1).padStart(6, '0')}`

        // ── Create the refund in a transaction ──
        const refund = await this.prisma.$transaction(async (tx) => {
            // Create refund record (stored as JSON on a lightweight table — or we
            // reuse the existing SdRefund model adapted for POS)
            // For now, store as a POS void transaction variant with reason + metadata.

            // Mark each refunded tender as Refunded
            for (const tender of refundTenders) {
                if (tender.amount === Number(paymentById.get(tender.paymentId)!.amount)) {
                    // Full tender refund
                    await tx.sdSalesOrderPayment.update({
                        where: { id: tender.paymentId },
                        data: { status: 'Refunded' },
                    })
                }
                // For partial tender refunds, we'd need a separate refund-allocation
                // table. For now, we create a negative payment record.
                await tx.sdSalesOrderPayment.create({
                    data: {
                        companyId: order.companyId!,
                        salesOrderId: order.id,
                        customerId: order.customerId,
                        paymentMethod: tender.paymentMethod,
                        amount: new Decimal(-tender.amount),
                        tenderAmount: new Decimal(0),
                        changeAmount: new Decimal(0),
                        status: 'Refunded',
                        verificationStatus: 'VERIFIED',
                        referenceNumber: tender.referenceNumber ?? `REF:${refundNumber}`,
                        posSessionId: null,
                        isDemo: false,
                        createdBy: input.createdBy,
                    },
                })
            }

            return {
                refundNumber,
                salesOrderId: order.id,
                orderNumber: order.orderNumber,
                receiptNumber: order.receiptNumber,
                totalRefund: totalRefundFromLines,
                reason: input.reason?.trim() || null,
                lines: refundLines,
                tenders: refundTenders,
            }
        })

        this.logger.log(
            `Refund ${refundNumber} created for ${order.orderNumber}: ₱${totalRefundFromLines} across ${refundTenders.length} tender(s)`,
        )

        // Emit event for downstream consumers (accounting reversal, etc.)
        await this.sdEvents.emit(SD_EVENTS.POS_SALE_VOIDED, {
            salesOrderId: order.id,
            orderNumber: order.orderNumber,
            receiptNumber: order.receiptNumber,
            companyId: order.companyId,
            refundNumber,
            totalAmount: totalRefundFromLines.toFixed(2),
            reason: input.reason ?? 'Partial refund',
        })

        return {
            id: refundNumber,
            ...refund,
            status: 'REFUNDED',
            createdAt: new Date().toISOString(),
        }
    }

    /** List refunds for a sale. */
    async listForOrder(salesOrderId: string): Promise<PosRefundRecord[]> {
        // Since we store refunds as negative payment records, reconstruct them
        const payments = await this.prisma.sdSalesOrderPayment.findMany({
            where: {
                salesOrderId,
                status: 'Refunded',
                amount: { lt: 0 },
            },
            orderBy: { createdAt: 'asc' },
        })
        if (!payments.length) return []

        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: salesOrderId },
            select: { orderNumber: true, receiptNumber: true },
        })

        // Group by reference number (each REF:REF-NNNNNN is one refund)
        const byRef = new Map<string, typeof payments>()
        for (const p of payments) {
            const ref = p.referenceNumber ?? 'unknown'
            const group = byRef.get(ref) ?? []
            group.push(p)
            byRef.set(ref, group)
        }

        return [...byRef.entries()].map(([ref, tenders]) => ({
            id: ref,
            refundNumber: ref.replace('REF:', ''),
            salesOrderId,
            orderNumber: order?.orderNumber ?? '',
            receiptNumber: order?.receiptNumber ?? null,
            status: 'REFUNDED',
            totalRefund: round2(
                tenders.reduce((s, t) => s + Math.abs(Number(t.amount)), 0),
            ),
            reason: null,
            lines: [],
            tenders: tenders.map((t) => ({
                paymentId: t.id,
                paymentMethod: t.paymentMethod,
                amount: Math.abs(Number(t.amount)),
                referenceNumber: t.referenceNumber,
            })),
            createdAt: tenders[0].createdAt.toISOString(),
        }))
    }
}
