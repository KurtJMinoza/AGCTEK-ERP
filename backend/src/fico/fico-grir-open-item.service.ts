import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import type { FicoGrIrOpenStatus, FicoGrIrReconciliationStatus } from './fico-grir.constants'

const MONEY = new Decimal('0.0001')

function money(value: Decimal | Prisma.Decimal | number | string | null | undefined) {
    return new Decimal(value?.toString?.() ?? value ?? 0)
}

type Tx = Prisma.TransactionClient

@Injectable()
export class FicoGrIrOpenItemService {
    private readonly logger = new Logger(FicoGrIrOpenItemService.name)

    constructor(private readonly prisma: PrismaService) {}

    /** Create or refresh open items for all valuated procurement receipt lines. */
    async syncFromGoodsReceipt(goodsReceiptId: string): Promise<number> {
        const receipt = await this.prisma.mmGoodsReceipt.findUnique({
            where: { id: goodsReceiptId },
            include: {
                purchaseOrder: { include: { currency: true } },
                lines: true,
                warehouse: { select: { id: true, plantId: true } },
            },
        })
        if (!receipt || receipt.status !== 'POSTED') return 0
        if (receipt.receiptPurpose !== 'PROCUREMENT') return 0

        const currencyCode =
            receipt.purchaseOrder?.currency?.code?.trim().toUpperCase() ?? 'PHP'
        let upserted = 0
        for (const line of receipt.lines) {
            const receivedQty = money(line.quantity)
            if (receivedQty.lte(0)) continue
            const receiptValuation = money(line.totalCost)
            const outstandingAmount = receiptValuation
            const { status, reconciliationStatus } = this.deriveStatuses({
                receivedQuantity: receivedQty,
                invoicedQuantity: new Decimal(0),
                returnedQuantity: new Decimal(0),
                clearedAmount: new Decimal(0),
                outstandingAmount,
                reversed: false,
            })

            await this.prisma.ficoGrIrOpenItem.upsert({
                where: { goodsReceiptLineId: line.id },
                create: {
                    companyId: receipt.companyId,
                    supplierId: receipt.supplierId,
                    purchaseOrderId: receipt.purchaseOrderId,
                    purchaseOrderLineId: line.purchaseOrderLineId,
                    goodsReceiptId: receipt.id,
                    goodsReceiptLineId: line.id,
                    materialId: line.materialId,
                    plantId: receipt.warehouse?.plantId ?? null,
                    warehouseId: receipt.warehouseId,
                    currencyCode,
                    receivedQuantity: receivedQty,
                    receiptValuation,
                    outstandingAmount,
                    status,
                    reconciliationStatus,
                    receiptPostedAt: receipt.postingDate,
                },
                update: {
                    receivedQuantity: receivedQty,
                    receiptValuation,
                    outstandingAmount,
                    status,
                    reconciliationStatus,
                },
            })
            upserted += 1
        }
        return upserted
    }

    async markReceiptReversed(goodsReceiptId: string): Promise<void> {
        await this.prisma.ficoGrIrOpenItem.updateMany({
            where: { goodsReceiptId },
            data: {
                status: 'REVERSED',
                reconciliationStatus: 'REVERSED',
                outstandingAmount: new Decimal(0),
            },
        })
    }

    async applySupplierReturnLine(input: {
        goodsReceiptLineId: string
        quantity: Decimal
        unitCost: Decimal
    }): Promise<void> {
        const item = await this.prisma.ficoGrIrOpenItem.findUnique({
            where: { goodsReceiptLineId: input.goodsReceiptLineId },
        })
        if (!item || item.status === 'REVERSED') return
        const returnQty = money(input.quantity)
        const returnVal = returnQty.mul(money(input.unitCost))
        const returnedQuantity = money(item.returnedQuantity).plus(returnQty)
        const clearedAmount = money(item.clearedAmount)
        const receiptValuation = money(item.receiptValuation)
        const outstandingAmount = receiptValuation
            .minus(clearedAmount)
            .minus(returnVal)
            .toDecimalPlaces(4)
        const { status, reconciliationStatus } = this.deriveStatuses({
            receivedQuantity: money(item.receivedQuantity),
            invoicedQuantity: money(item.invoicedQuantity),
            returnedQuantity,
            clearedAmount,
            outstandingAmount,
            reversed: false,
        })
        await this.prisma.ficoGrIrOpenItem.update({
            where: { id: item.id },
            data: {
                returnedQuantity,
                outstandingAmount,
                status,
                reconciliationStatus,
            },
        })
    }

    async applyInvoiceAllocations(
        tx: Tx,
        input: {
            allocations: Array<{
                goodsReceiptLineId: string
                allocatedQuantity: Decimal
                allocatedAmount: Decimal
            }>
            journalEntryId?: string | null
        },
    ): Promise<void> {
        const now = new Date()
        for (const allocation of input.allocations) {
            const item = await tx.ficoGrIrOpenItem.findUnique({
                where: { goodsReceiptLineId: allocation.goodsReceiptLineId },
            })
            if (!item || item.status === 'REVERSED') {
                this.logger.warn(
                    `GR/IR open item missing for GR line ${allocation.goodsReceiptLineId}; run sync or backfill.`,
                )
                continue
            }
            const invoicedQuantity = money(item.invoicedQuantity).plus(
                money(allocation.allocatedQuantity),
            )
            const invoiceValuation = money(item.invoiceValuation).plus(
                money(allocation.allocatedAmount),
            )
            const clearedAmount = money(item.clearedAmount).plus(
                money(allocation.allocatedAmount),
            )
            const returnedVal = money(item.returnedQuantity).mul(
                money(item.receiptValuation).div(
                    money(item.receivedQuantity).gt(0)
                        ? money(item.receivedQuantity)
                        : 1,
                ),
            )
            const outstandingAmount = money(item.receiptValuation)
                .minus(clearedAmount)
                .minus(returnedVal)
                .toDecimalPlaces(4)
            const { status, reconciliationStatus } = this.deriveStatuses({
                receivedQuantity: money(item.receivedQuantity),
                invoicedQuantity,
                returnedQuantity: money(item.returnedQuantity),
                clearedAmount,
                outstandingAmount,
                reversed: false,
            })
            await tx.ficoGrIrOpenItem.update({
                where: { id: item.id },
                data: {
                    invoicedQuantity,
                    invoiceValuation,
                    clearedAmount,
                    outstandingAmount,
                    status,
                    reconciliationStatus,
                    lastClearedAt: now,
                    lastInvoiceJournalEntryId: input.journalEntryId ?? null,
                },
            })
        }
    }

    /**
     * Backfill open items from posted procurement receipts (idempotent per GR line).
     */
    async backfillCompany(companyId: string): Promise<number> {
        const receipts = await this.prisma.mmGoodsReceipt.findMany({
            where: {
                companyId,
                status: 'POSTED',
                receiptPurpose: 'PROCUREMENT',
            },
            select: { id: true },
        })
        let count = 0
        for (const row of receipts) {
            count += await this.syncFromGoodsReceipt(row.id)
        }
        return count
    }

    private deriveStatuses(input: {
        receivedQuantity: Decimal
        invoicedQuantity: Decimal
        returnedQuantity: Decimal
        clearedAmount: Decimal
        outstandingAmount: Decimal
        reversed: boolean
    }): {
        status: FicoGrIrOpenStatus
        reconciliationStatus: FicoGrIrReconciliationStatus
    } {
        if (input.reversed) {
            return { status: 'REVERSED', reconciliationStatus: 'REVERSED' }
        }
        const netReceived = input.receivedQuantity.minus(input.returnedQuantity)
        let status: FicoGrIrOpenStatus = 'OPEN'
        let reconciliationStatus: FicoGrIrReconciliationStatus = 'GR_NOT_INVOICED'

        if (input.outstandingAmount.abs().lte(MONEY)) {
            status = 'CLEARED'
            reconciliationStatus = 'FULLY_MATCHED'
        } else if (input.clearedAmount.gt(MONEY)) {
            status = 'PARTIALLY_CLEARED'
            reconciliationStatus = 'PARTIALLY_INVOICED'
        }

        if (
            input.invoicedQuantity.gt(netReceived) &&
            input.invoicedQuantity.gt(input.receivedQuantity)
        ) {
            reconciliationStatus = 'INVOICE_EXCESS'
            status = 'OPEN'
        } else if (
            input.clearedAmount.lte(MONEY) &&
            input.invoicedQuantity.lte(MONEY)
        ) {
            reconciliationStatus = 'GR_NOT_INVOICED'
        }

        return { status, reconciliationStatus }
    }
}