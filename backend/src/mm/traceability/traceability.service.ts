import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ExpiryControlService } from '../returns-disposal/expiry-control.service'

const TXN_INCLUDE = {
    warehouse: { select: { id: true, code: true, name: true } },
    material: {
        select: { id: true, materialCode: true, materialName: true },
    },
    batch: true,
    serialNumber: true,
    storageBin: { select: { id: true, code: true } },
    uom: { select: { id: true, code: true } },
} as const

/** Inbound / receipt-oriented movement types for backward genealogy. */
const BACKWARD_MOVEMENTS = new Set([
    'RECEIPT',
    'RETURN_IN',
    'TRANSFER_IN',
    'ADJUSTMENT_IN',
    'COUNT_GAIN',
])

/** Outbound / consumption-oriented movement types for forward / where-used. */
const FORWARD_MOVEMENTS = new Set([
    'ISSUE',
    'RETURN_OUT',
    'TRANSFER_OUT',
    'SCRAP',
    'ADJUSTMENT_OUT',
    'COUNT_LOSS',
])

@Injectable()
export class TraceabilityService {
    constructor(
        private prisma: PrismaService,
        private expiryControl: ExpiryControlService,
    ) {}

    async getBatch(id: string) {
        const batch = await this.prisma.mmBatch.findFirst({
            where: { id, deletedAt: null },
            include: {
                material: true,
                supplier: {
                    select: { id: true, supplierCode: true, supplierName: true },
                },
            },
        })
        if (!batch) throw new NotFoundException('Batch not found')

        const [balances, txnCount, returnOutCount, disposalCount] = await Promise.all([
            this.prisma.mmInventoryBalance.findMany({
                where: { batchId: id, quantity: { gt: 0 } },
                include: {
                    warehouse: { select: { id: true, code: true, name: true } },
                    storageBin: { select: { id: true, code: true } },
                },
            }),
            this.prisma.mmInventoryTransaction.count({ where: { batchId: id } }),
            this.prisma.mmInventoryTransaction.count({
                where: { batchId: id, movementType: 'RETURN_OUT' },
            }),
            this.prisma.mmInventoryTransaction.count({
                where: { batchId: id, movementType: 'SCRAP' },
            }),
        ])

        const firstReceipt = await this.prisma.mmInventoryTransaction.findFirst({
            where: {
                batchId: id,
                movementType: { in: ['RECEIPT', 'RETURN_IN'] },
            },
            orderBy: { postingDate: 'asc' },
            include: TXN_INCLUDE,
        })

        const expiry = this.expiryControl.computeExpiryInfo(batch)

        return {
            batch: { ...batch, ...expiry },
            summary: {
                transactionCount: txnCount,
                returnOutCount,
                scrapCount: disposalCount,
                onHandQuantity: balances.reduce((s, b) => s + Number(b.quantity), 0),
                balances,
                firstReceipt,
            },
        }
    }

    async batchForward(id: string) {
        await this.assertBatch(id)
        const transactions = await this.prisma.mmInventoryTransaction.findMany({
            where: { batchId: id },
            include: TXN_INCLUDE,
            orderBy: { postingDate: 'asc' },
        })
        return {
            batchId: id,
            direction: 'forward',
            chain: transactions.map((t) => this.toChainNode(t)),
        }
    }

    async batchBackward(id: string) {
        await this.assertBatch(id)
        const transactions = await this.prisma.mmInventoryTransaction.findMany({
            where: { batchId: id },
            include: TXN_INCLUDE,
            orderBy: { postingDate: 'desc' },
        })

        const towardOrigin = transactions.filter(
            (t) =>
                BACKWARD_MOVEMENTS.has(t.movementType) ||
                t.sourceDocumentType === 'GOODS_RECEIPT' ||
                t.sourceDocumentType === 'PURCHASE_ORDER' ||
                t.sourceDocumentType === 'ASN',
        )

        return {
            batchId: id,
            direction: 'backward',
            chain: (towardOrigin.length ? towardOrigin : transactions).map((t) =>
                this.toChainNode(t),
            ),
        }
    }

    async batchWhereUsed(id: string) {
        await this.assertBatch(id)
        const transactions = await this.prisma.mmInventoryTransaction.findMany({
            where: {
                batchId: id,
                OR: [
                    { movementType: { in: [...FORWARD_MOVEMENTS] } },
                    {
                        sourceDocumentType: {
                            in: [
                                'GOODS_ISSUE',
                                'CUSTOMER_RETURN',
                                'DISPOSAL',
                                'SUPPLIER_RETURN',
                                'STOCK_TRANSFER',
                            ],
                        },
                    },
                ],
            },
            include: TXN_INCLUDE,
            orderBy: { postingDate: 'asc' },
        })

        const byDoc = new Map<string, any>()
        for (const t of transactions) {
            const key = `${t.sourceDocumentType ?? 'NONE'}:${t.sourceDocumentId ?? t.id}`
            if (!byDoc.has(key)) {
                byDoc.set(key, {
                    sourceDocumentType: t.sourceDocumentType,
                    sourceDocumentId: t.sourceDocumentId,
                    materialId: t.materialId,
                    material: t.material,
                    movementTypes: new Set<string>(),
                    totalQuantity: 0,
                    firstPostingDate: t.postingDate,
                    lastPostingDate: t.postingDate,
                })
            }
            const row = byDoc.get(key)!
            row.movementTypes.add(t.movementType)
            row.totalQuantity += Math.abs(Number(t.quantity))
            if (t.postingDate < row.firstPostingDate) row.firstPostingDate = t.postingDate
            if (t.postingDate > row.lastPostingDate) row.lastPostingDate = t.postingDate
        }

        return {
            batchId: id,
            whereUsed: [...byDoc.values()].map((r) => ({
                ...r,
                movementTypes: [...r.movementTypes],
            })),
        }
    }

    async getSerial(id: string) {
        const serial = await this.prisma.mmSerialNumber.findFirst({
            where: { id, deletedAt: null },
            include: {
                material: {
                    select: { id: true, materialCode: true, materialName: true },
                },
                batch: true,
                currentWarehouse: { select: { id: true, code: true, name: true } },
                currentBin: { select: { id: true, code: true } },
            },
        })
        if (!serial) throw new NotFoundException('Serial number not found')

        const transactions = await this.prisma.mmInventoryTransaction.findMany({
            where: { serialNumberId: id },
            include: TXN_INCLUDE,
            orderBy: { postingDate: 'asc' },
        })

        return {
            serial,
            history: transactions.map((t) => this.toChainNode(t)),
        }
    }

    private async assertBatch(id: string) {
        const batch = await this.prisma.mmBatch.findFirst({
            where: { id, deletedAt: null },
            select: { id: true },
        })
        if (!batch) throw new NotFoundException('Batch not found')
    }

    private toChainNode(t: any) {
        return {
            id: t.id,
            transactionNumber: t.transactionNumber,
            postingDate: t.postingDate,
            movementType: t.movementType,
            quantity: t.quantity,
            signedQuantity: t.signedQuantity,
            stockStatus: t.stockStatus,
            sourceModule: t.sourceModule,
            sourceDocumentType: t.sourceDocumentType,
            sourceDocumentId: t.sourceDocumentId,
            sourceDocumentLineId: t.sourceDocumentLineId,
            warehouse: t.warehouse,
            material: t.material,
            batch: t.batch
                ? {
                      id: t.batch.id,
                      batchNumber: t.batch.batchNumber,
                      expiryDate: t.batch.expiryDate,
                  }
                : null,
            serialNumber: t.serialNumber
                ? {
                      id: t.serialNumber.id,
                      serialNumber: t.serialNumber.serialNumber,
                  }
                : null,
            storageBin: t.storageBin,
            uom: t.uom,
            remarks: t.remarks,
            reversalOfId: t.reversalOfId,
        }
    }
}
