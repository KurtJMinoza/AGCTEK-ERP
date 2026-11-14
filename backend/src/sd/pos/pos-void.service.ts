import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { GoodsIssueService } from '../../mm/stock-ops/goods-issue.service'
import { SdIntegrationService } from '../../mm/integration/sd/sd-integration.service'
import { SdEventEmitterService } from '../sd-event-emitter.service'
import { SD_EVENTS } from '../sd-event.types'

/**
 * Void of a completed POS sale.
 *
 * The money, the stock and the documents of the sale are reversed together:
 * the MM goods issue is reversed (the stock returns to its bin), the
 * reservation of the order is released, the tenders are cancelled (so the
 * drawer no longer counts them) and the sale itself is closed with a reason.
 *
 * Every step is safe to repeat: a void that fails halfway can be retried and
 * the parts that are already done are skipped.
 */
@Injectable()
export class PosVoidService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly goodsIssue: GoodsIssueService,
        private readonly sdIntegration: SdIntegrationService,
        private readonly sdEvents: SdEventEmitterService,
    ) {}

    async voidSale(
        orderId: string,
        dto: { reason: string; voidedBy?: string | null },
    ) {
        const order = await this.prisma.sdSalesOrder.findFirst({
            where: { id: orderId, channel: 'POS' },
            include: { lines: true, payments: true },
        })
        if (!order) throw new NotFoundException('Sale not found')

        const reason = dto.reason?.trim()
        if (!reason) {
            throw new BadRequestException('Enter why the sale is voided.')
        }
        if (reason.length > 500) {
            throw new BadRequestException(
                'The reason is too long (500 characters max).',
            )
        }

        // Already voided: the same answer, no second reversal.
        if (order.voidedAt) {
            const existingVoid =
                await this.prisma.sdPosVoidTransaction.findUnique({
                    where: { salesOrderId: order.id },
                })
            return {
                salesOrderId: order.id,
                orderNumber: order.orderNumber,
                receiptNumber: order.receiptNumber,
                status: 'VOIDED',
                voidedAt: order.voidedAt,
                voidedBy: order.voidedBy,
                voidReason: order.voidReason,
                tendersCancelled: order.payments.filter(
                    (payment) => payment.status === 'Cancelled',
                ).length,
                voidTransactionNumber: existingVoid?.voidNumber ?? null,
                voidedAmount: Number(
                    existingVoid?.amount ?? -Number(order.totalAmount ?? 0),
                ),
            }
        }
        if (order.status !== 'COMPLETED') {
            throw new ConflictException(
                `Only a completed sale can be voided (this sale is ${order.status}).`,
            )
        }

        // 1. The stock returns: reverse the goods issue of the sale.
        const goodsIssue = await this.prisma.mmGoodsIssue.findFirst({
            where: {
                sourceDocumentType: 'SALES_ORDER',
                sourceDocumentId: order.id,
                status: 'POSTED',
            },
        })
        if (goodsIssue) {
            await this.goodsIssue.reverse(
                goodsIssue.id,
                dto.voidedBy ?? undefined,
            )
        }

        // 2. The reservation of the sale goes: the reversal put the stock
        // back on hold for a demand that no longer exists.
        try {
            await this.sdIntegration.releaseVoidedDemand(order.id)
        } catch {
            // The reservation may already be gone (a sale issued from a
            // reservation that was consumed); the stock is back either way.
        }

        // 3. The money is closed: the tenders are cancelled (the drawer no
        // longer counts them), a salary deduction gives its credit back and
        // the lines and the sale itself are closed. One transaction, so a
        // failure never leaves a voided sale with live tenders (or the other
        // way round).
        const salaryLoanCredit = order.payments
            .filter(
                (payment) =>
                    payment.paymentMethod === 'SALARY_LOAN' &&
                    !['Cancelled', 'Refunded'].includes(payment.status),
            )
            .reduce((sum, payment) => sum + Number(payment.amount), 0)

        const voidNumber = `V-${order.receiptNumber ?? order.orderNumber}`
        const voidedAmount = new Decimal(order.totalAmount ?? 0).negated()

        const { cancelled, voided, voidTransaction } =
            await this.prisma.$transaction(
            async (tx) => {
                const cancelled = await tx.sdSalesOrderPayment.updateMany({
                    where: {
                        salesOrderId: order.id,
                        status: { notIn: ['Cancelled', 'Refunded'] },
                    },
                    data: { status: 'Cancelled' },
                })

                await tx.sdSalesOrderLine.updateMany({
                    where: { salesOrderId: order.id },
                    data: { integrationStatus: 'CANCELLED' },
                })

                const voided = await tx.sdSalesOrder.update({
                    where: { id: order.id },
                    data: {
                        status: 'CANCELLED',
                        paymentStatus: 'Cancelled',
                        voidedAt: new Date(),
                        voidedBy: dto.voidedBy ?? null,
                        voidReason: reason,
                    },
                })

                // The checkout booked the deduction against the employee's
                // credit; the voided sale no longer owes it.
                if (salaryLoanCredit > 0 && order.customerId) {
                    await tx.sdCustomer.updateMany({
                        where: { id: order.customerId },
                        data: {
                            availableCredit: {
                                increment: new Decimal(salaryLoanCredit),
                            },
                        },
                    })
                }

                // The void is a transaction of its own: a reversal entry
                // that follows the completed sale in the register history.
                const voidTransaction = await tx.sdPosVoidTransaction.upsert({
                    where: { salesOrderId: order.id },
                    create: {
                        voidNumber,
                        salesOrderId: order.id,
                        originalReceiptNumber: order.receiptNumber,
                        companyId: order.companyId,
                        branchId: order.branchId,
                        posSessionId: order.posSessionId,
                        cashierUserId: dto.voidedBy ?? order.cashierUserId,
                        currency: order.currency ?? 'PHP',
                        amount: voidedAmount,
                        reason,
                        voidedBy: dto.voidedBy ?? null,
                    },
                    update: {},
                })

                return { cancelled, voided, voidTransaction }
            },
        )

        await this.sdEvents.emit(SD_EVENTS.POS_SALE_VOIDED, {
            salesOrderId: voided.id,
            orderNumber: voided.orderNumber,
            receiptNumber: voided.receiptNumber,
            companyId: voided.companyId,
            branchId: voided.branchId,
            posSessionId: voided.posSessionId,
            cashierUserId: voided.cashierUserId,
            customerId: voided.customerId,
            currency: voided.currency,
            voidReason: reason,
            voidedBy: dto.voidedBy ?? null,
            totalAmount: (voided.totalAmount ?? 0).toString(),
            voidTransactionNumber: voidTransaction.voidNumber,
            voidedAmount: voidTransaction.amount.toString(),
            idempotencyKey: `void:${order.id}`,
        })

        return {
            salesOrderId: voided.id,
            orderNumber: voided.orderNumber,
            receiptNumber: voided.receiptNumber,
            status: 'VOIDED',
            voidedAt: voided.voidedAt,
            voidedBy: voided.voidedBy,
            voidReason: voided.voidReason,
            tendersCancelled: cancelled.count,
            voidTransactionNumber: voidTransaction.voidNumber,
            voidedAmount: Number(voidTransaction.amount),
        }
    }
}
