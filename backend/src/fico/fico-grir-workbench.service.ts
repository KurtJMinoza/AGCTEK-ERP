import { Injectable } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { FicoAccountsPayableService } from './fico-accounts-payable.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import { FicoGrIrOpenItemService } from './fico-grir-open-item.service'
import type { FicoGrIrWorkbenchQueryDto } from './dto/fico-grir.dto'

type Actor = AuthRequestUser | undefined

const MONEY_TOLERANCE = new Decimal('0.01')

@Injectable()
export class FicoGrIrWorkbenchService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly access: FicoCompanyAccessService,
        private readonly accountsPayable: FicoAccountsPayableService,
        private readonly grirOpenItems: FicoGrIrOpenItemService,
    ) {}

    async getWorkbench(query: FicoGrIrWorkbenchQueryDto, user: Actor) {
        await this.access.assertAccess(user, query.companyId)

        if (query.backfill) {
            await this.grirOpenItems.backfillCompany(query.companyId)
        }

        const where: Record<string, unknown> = { companyId: query.companyId }
        if (query.supplierId) where.supplierId = query.supplierId
        if (query.purchaseOrderId) where.purchaseOrderId = query.purchaseOrderId
        if (query.materialId) where.materialId = query.materialId
        if (query.plantId) where.plantId = query.plantId
        if (query.status) where.status = query.status
        if (query.reconciliationStatus) {
            where.reconciliationStatus = query.reconciliationStatus
        }
        if (query.outstandingOnly) {
            where.outstandingAmount = { gt: MONEY_TOLERANCE }
        }

        const items = await this.prisma.ficoGrIrOpenItem.findMany({
            where,
            include: {
                supplier: {
                    select: { id: true, supplierCode: true, supplierName: true },
                },
                material: {
                    select: { id: true, materialCode: true, materialName: true },
                },
                goodsReceipt: {
                    select: {
                        id: true,
                        documentNumber: true,
                        postingDate: true,
                    },
                },
                purchaseOrder: { select: { id: true, poNumber: true } },
            },
            orderBy: { receiptPostedAt: 'desc' },
            take: query.limit ?? 200,
        })

        const asOf = query.asOfDate ? new Date(query.asOfDate) : new Date()
        type WorkbenchRow = {
            id: string
            companyId: string
            supplierId: string | null
            supplier: (typeof items)[0]['supplier']
            purchaseOrderId: string | null
            poNumber: string | null
            goodsReceiptId: string
            goodsReceiptNumber: string
            goodsReceiptLineId: string
            materialId: string
            material: (typeof items)[0]['material']
            plantId: string | null
            warehouseId: string | null
            currencyCode: string
            receivedQuantity: (typeof items)[0]['receivedQuantity']
            invoicedQuantity: (typeof items)[0]['invoicedQuantity']
            returnedQuantity: (typeof items)[0]['returnedQuantity']
            receiptValuation: (typeof items)[0]['receiptValuation']
            invoiceValuation: (typeof items)[0]['invoiceValuation']
            clearedAmount: (typeof items)[0]['clearedAmount']
            outstandingAmount: (typeof items)[0]['outstandingAmount']
            status: string
            reconciliationStatus: string
            receiptPostedAt: Date
            lastClearedAt: Date | null
            agingDays: number
            goodsReceiptJournalEntryId: string | null
            lastInvoiceJournalEntryId: string | null
        }

        const rows: WorkbenchRow[] = items
            .filter((item) => {
                if (!query.agingDaysMin) return true
                const ageMs = asOf.getTime() - item.receiptPostedAt.getTime()
                const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000))
                return ageDays >= Number(query.agingDaysMin)
            })
            .map((item) => {
                const ageMs = asOf.getTime() - item.receiptPostedAt.getTime()
                const agingDays = Math.max(0, Math.floor(ageMs / (24 * 60 * 60 * 1000)))
                return {
                    id: item.id,
                    companyId: item.companyId,
                    supplierId: item.supplierId,
                    supplier: item.supplier,
                    purchaseOrderId: item.purchaseOrderId,
                    poNumber: item.purchaseOrder?.poNumber ?? null,
                    goodsReceiptId: item.goodsReceiptId,
                    goodsReceiptNumber: item.goodsReceipt.documentNumber,
                    goodsReceiptLineId: item.goodsReceiptLineId,
                    materialId: item.materialId,
                    material: item.material,
                    plantId: item.plantId,
                    warehouseId: item.warehouseId,
                    currencyCode: item.currencyCode,
                    receivedQuantity: item.receivedQuantity,
                    invoicedQuantity: item.invoicedQuantity,
                    returnedQuantity: item.returnedQuantity,
                    receiptValuation: item.receiptValuation,
                    invoiceValuation: item.invoiceValuation,
                    clearedAmount: item.clearedAmount,
                    outstandingAmount: item.outstandingAmount,
                    status: item.status,
                    reconciliationStatus: item.reconciliationStatus,
                    receiptPostedAt: item.receiptPostedAt,
                    lastClearedAt: item.lastClearedAt,
                    agingDays,
                    goodsReceiptJournalEntryId: item.goodsReceiptJournalEntryId,
                    lastInvoiceJournalEntryId: item.lastInvoiceJournalEntryId,
                }
            })

        const [blockedInvoices, invoiceBeforeReceipt, glReconciliation] =
            await Promise.all([
                this.prisma.mmSupplierInvoice.findMany({
                    where: {
                        companyId: query.companyId,
                        status: { in: ['BLOCKED', 'VARIANCE'] },
                        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
                    },
                    select: {
                        id: true,
                        invoiceNumber: true,
                        status: true,
                        supplierId: true,
                        purchaseOrderId: true,
                        totalAmount: true,
                        paymentBlocked: true,
                        matchedAt: true,
                    },
                    take: 100,
                }),
                this.prisma.mmSupplierInvoice.findMany({
                    where: {
                        companyId: query.companyId,
                        status: {
                            in: ['SUBMITTED', 'MATCHED', 'PARTIALLY_MATCHED', 'DRAFT'],
                        },
                        lines: {
                            some: { receipts: { none: {} } },
                        },
                        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
                    },
                    select: {
                        id: true,
                        invoiceNumber: true,
                        status: true,
                        supplierId: true,
                        purchaseOrderId: true,
                        totalAmount: true,
                    },
                    take: 100,
                }),
                this.accountsPayable.getGrIrReconciliation(query.companyId, user),
            ])

        const summary = {
            openLineCount: rows.filter((r) =>
                new Decimal(r.outstandingAmount.toString()).abs().gt(MONEY_TOLERANCE),
            ).length,
            fullyMatchedCount: rows.filter(
                (r) => r.reconciliationStatus === 'FULLY_MATCHED',
            ).length,
            grNotInvoicedCount: rows.filter(
                (r) => r.reconciliationStatus === 'GR_NOT_INVOICED',
            ).length,
            blockedInvoiceCount: blockedInvoices.length,
            invoiceBeforeReceiptCount: invoiceBeforeReceipt.length,
            outstandingAmount: rows
                .reduce(
                    (sum, row) => sum.plus(new Decimal(row.outstandingAmount.toString())),
                    new Decimal(0),
                )
                .toDecimalPlaces(4),
        }

        return {
            companyId: query.companyId,
            asOfDate: asOf.toISOString().slice(0, 10),
            summary,
            items: rows,
            blockedInvoices,
            invoiceBeforeReceipt,
            glReconciliation,
        }
    }
}