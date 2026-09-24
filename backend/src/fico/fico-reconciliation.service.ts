import { Injectable } from '@nestjs/common'
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

        const journalWhere: any = {
            companyId: input.companyId,
            status: 'POSTED',
        }
        if (input.dateFrom || input.dateTo) {
            journalWhere.postingDate = {}
            if (input.dateFrom) journalWhere.postingDate.gte = input.dateFrom
            if (input.dateTo) journalWhere.postingDate.lte = input.dateTo
        }

        const journals = await this.prisma.ficoJournalEntry.findMany({
            where: journalWhere,
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
}
