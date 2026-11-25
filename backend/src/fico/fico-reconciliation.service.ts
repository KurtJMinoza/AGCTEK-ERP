import { Injectable } from '@nestjs/common'
import { ledgerCommittedJournalWhere } from './fico-ledger-policy'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'

export type ReconciliationRow = {
    companyId: string
    materialId?: string
    mmValue: number
    ficoValue: number
    difference: number
    status: 'MATCH' | 'VARIANCE'
}

@Injectable()
export class FicoReconciliationService {
    constructor(private prisma: PrismaService) {}

    async reconcile(input: {
        companyId: string
        materialId?: string
        dateFrom?: Date
        dateTo?: Date
    }): Promise<{
        companyId: string
        rows: ReconciliationRow[]
        summary: {
            mmTotal: number
            ficoTotal: number
            difference: number
            varianceCount: number
        }
    }> {
        const valuationWhere: any = { companyId: input.companyId }
        if (input.materialId) valuationWhere.materialId = input.materialId

        const valuations = await this.prisma.mmMaterialValuation.findMany({
            where: valuationWhere,
            select: {
                materialId: true,
                movingAverageCost: true,
                standardCost: true,
            },
        })

        const balances = await this.prisma.mmInventoryBalance.groupBy({
            by: ['materialId'],
            where: {
                companyId: input.companyId,
                ...(input.materialId ? { materialId: input.materialId } : {}),
                stockStatus: 'UNRESTRICTED',
            },
            _sum: { quantity: true },
        })
        const qtyByMaterial = new Map(
            balances.map((b) => [b.materialId, b._sum.quantity ?? new Decimal(0)]),
        )

        const mmByMaterial = new Map<string, Decimal>()
        for (const v of valuations) {
            const qty = qtyByMaterial.get(v.materialId) ?? new Decimal(0)
            const unitCost = v.movingAverageCost.gt(0)
                ? v.movingAverageCost
                : v.standardCost
            const value = qty.mul(unitCost)
            mmByMaterial.set(v.materialId, value)
        }
        for (const [materialId, qty] of qtyByMaterial) {
            if (!mmByMaterial.has(materialId)) {
                mmByMaterial.set(materialId, qty)
            }
        }

        const journals = await this.prisma.ficoJournalEntry.findMany({
            where: ledgerCommittedJournalWhere({
                companyId: input.companyId,
                ...(input.dateFrom || input.dateTo
                    ? {
                          postingDate: {
                              ...(input.dateFrom
                                  ? { gte: input.dateFrom }
                                  : {}),
                              ...(input.dateTo ? { lte: input.dateTo } : {}),
                          },
                      }
                    : {}),
            }),
            select: { totalAmount: true, metadata: true },
        })

        const ficoByMaterial = new Map<string, Decimal>()
        let ficoUnallocated = new Decimal(0)
        for (const j of journals) {
            const meta = j.metadata as any
            const lines = Array.isArray(meta?.lines) ? meta.lines : []
            if (!lines.length) {
                ficoUnallocated = ficoUnallocated.plus(j.totalAmount)
                continue
            }
            for (const line of lines) {
                const materialId = String(line.materialId)
                if (input.materialId && materialId !== input.materialId) continue
                const current = ficoByMaterial.get(materialId) ?? new Decimal(0)
                ficoByMaterial.set(
                    materialId,
                    current.plus(Math.abs(Number(line.totalCost ?? 0))),
                )
            }
        }

        const materialIds = new Set([
            ...mmByMaterial.keys(),
            ...ficoByMaterial.keys(),
        ])
        if (input.materialId) {
            materialIds.clear()
            materialIds.add(input.materialId)
        }

        const rows: ReconciliationRow[] = []
        for (const materialId of materialIds) {
            const mmValue = Number(mmByMaterial.get(materialId) ?? 0)
            const ficoValue = Number(ficoByMaterial.get(materialId) ?? 0)
            const difference = mmValue - ficoValue
            rows.push({
                companyId: input.companyId,
                materialId,
                mmValue,
                ficoValue,
                difference,
                status: Math.abs(difference) < 0.0001 ? 'MATCH' : 'VARIANCE',
            })
        }

        if (!input.materialId && ficoUnallocated.gt(0)) {
            rows.push({
                companyId: input.companyId,
                mmValue: 0,
                ficoValue: Number(ficoUnallocated),
                difference: -Number(ficoUnallocated),
                status: 'VARIANCE',
            })
        }

        const mmTotal = rows.reduce((s, r) => s + r.mmValue, 0)
        const ficoTotal = rows.reduce((s, r) => s + r.ficoValue, 0)
        const difference = mmTotal - ficoTotal

        return {
            companyId: input.companyId,
            rows,
            summary: {
                mmTotal,
                ficoTotal,
                difference,
                varianceCount: rows.filter((r) => r.status === 'VARIANCE').length,
            },
        }
    }

    /**
     * MM ↔ FICO bridge audit using valuation transactions and accounting events
     * (authoritative MM costs, not catalog prices).
     */
    async auditInventoryAccounting(input: {
        companyId: string
        dateFrom?: Date
        dateTo?: Date
    }) {
        const txWhere: {
            companyId: string
            totalCost: { gt: Decimal }
            postingDate?: { gte?: Date; lte?: Date }
        } = {
            companyId: input.companyId,
            totalCost: { gt: new Decimal(0) },
        }
        if (input.dateFrom || input.dateTo) {
            txWhere.postingDate = {
                ...(input.dateFrom ? { gte: input.dateFrom } : {}),
                ...(input.dateTo ? { lte: input.dateTo } : {}),
            }
        }

        const [valuationMovements, events, journalKeys] = await Promise.all([
            this.prisma.mmInventoryTransaction.findMany({
                where: txWhere,
                select: {
                    id: true,
                    totalCost: true,
                    movementType: true,
                    sourceDocumentId: true,
                },
                take: 5000,
            }),
            this.prisma.mmAccountingEvent.findMany({
                where: {
                    companyId: input.companyId,
                    sourceModule: { in: ['STOCK_OPS', 'MM', 'VALUATION'] },
                    ...(input.dateFrom || input.dateTo
                        ? {
                              postingDate: {
                                  ...(input.dateFrom ? { gte: input.dateFrom } : {}),
                                  ...(input.dateTo ? { lte: input.dateTo } : {}),
                              },
                          }
                        : {}),
                },
                select: {
                    id: true,
                    status: true,
                    documentId: true,
                    totalValue: true,
                    journalEntryId: true,
                    lastErrorCode: true,
                    idempotencyKey: true,
                },
            }),
            this.prisma.ficoJournalEntry.findMany({
                where: { companyId: input.companyId },
                select: { idempotencyKey: true },
            }),
        ])
        const keyCounts = new Map<string, number>()
        for (const row of journalKeys) {
            keyCounts.set(
                row.idempotencyKey,
                (keyCounts.get(row.idempotencyKey) ?? 0) + 1,
            )
        }
        const duplicateJournals = [...keyCounts.entries()]
            .filter(([, count]) => count > 1)
            .map(([idempotencyKey]) => ({ idempotencyKey }))

        const financiallyRelevant = valuationMovements.filter((row) =>
            row.totalCost?.gt(0),
        )
        const eventsByDoc = new Map(
            events.map((event) => [event.documentId, event]),
        )

        const missingFinancialJournal = financiallyRelevant
            .filter((row) => {
                const docId = row.sourceDocumentId ?? row.id
                const event = eventsByDoc.get(docId)
                return !event || (event.status !== 'CONSUMED' && event.status !== 'SKIPPED')
            })
            .map((row) => ({
                code: 'MISSING_FINANCIAL_JOURNAL',
                inventoryTransactionId: row.id,
                movementType: row.movementType,
                totalCost: row.totalCost?.toString() ?? '0',
            }))

        const failedEvents = events
            .filter((e) => e.status === 'FAILED')
            .map((e) => ({
                code: 'FAILED_ACCOUNTING_EVENT',
                eventId: e.id,
                documentId: e.documentId,
                errorCode: e.lastErrorCode,
            }))

        const consumedWithoutJournal = events
            .filter((e) => e.status === 'CONSUMED' && !e.journalEntryId)
            .map((e) => ({
                code: 'CONSUMED_WITHOUT_JOURNAL',
                eventId: e.id,
            }))

        const valueMismatches = events
            .filter((e) => e.status === 'CONSUMED' && e.journalEntryId)
            .map((event) => {
                const movement = financiallyRelevant.find(
                    (row) =>
                        (row.sourceDocumentId ?? row.id) === event.documentId,
                )
                if (!movement?.totalCost || !event.totalValue) return null
                if (!movement.totalCost.eq(event.totalValue)) {
                    return {
                        code: 'VALUE_MISMATCH',
                        eventId: event.id,
                        mmValue: movement.totalCost.toString(),
                        eventValue: event.totalValue.toString(),
                    }
                }
                return null
            })
            .filter(Boolean)

        return {
            companyId: input.companyId,
            exceptionCount:
                missingFinancialJournal.length +
                failedEvents.length +
                consumedWithoutJournal.length +
                valueMismatches.length +
                duplicateJournals.length,
            missingFinancialJournal,
            failedEvents,
            consumedWithoutJournal,
            valueMismatches,
            duplicateJournalKeys: duplicateJournals.map(
                (row) => row.idempotencyKey,
            ),
            scannedMovements: financiallyRelevant.length,
            scannedEvents: events.length,
        }
    }
}
