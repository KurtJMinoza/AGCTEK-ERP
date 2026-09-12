import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { GenerateCountPlanDto } from './dto/count-engine.dto'

/**
 * Selects balance rows for count task generation using ABC, warehouse,
 * last count date, variance history, risk, and configurable policy cycle.
 */
@Injectable()
export class CountGenerationService {
    constructor(private prisma: PrismaService) {}

    async selectBalances(input: {
        companyId: string
        warehouseId: string
        countType: string
        policyId?: string | null
        dto?: GenerateCountPlanDto
    }) {
        const { companyId, warehouseId, countType, policyId, dto = {} } = input
        const includeZero =
            dto.includeZeroBalances !== undefined
                ? dto.includeZeroBalances
                : countType === 'PHYSICAL_INVENTORY'

        const balanceWhere: Record<string, unknown> = {
            companyId,
            warehouseId,
            stockStatus: 'UNRESTRICTED',
            quantity: includeZero ? { gte: 0 } : { gt: 0 },
        }
        if (dto.storageBinIds?.length) {
            balanceWhere.storageBinId = { in: dto.storageBinIds }
        }

        let policy: Awaited<ReturnType<typeof this.prisma.mmCountPolicy.findUnique>> = null
        if (policyId) {
            policy = await this.prisma.mmCountPolicy.findUnique({ where: { id: policyId } })
            if (!policy || !policy.isActive) {
                throw new BadRequestException('Count policy not found or inactive')
            }
            if (policy.warehouseId && policy.warehouseId !== warehouseId) {
                throw new BadRequestException('Policy warehouse does not match plan warehouse')
            }
        }

        if (
            (countType === 'CYCLE_COUNT' || countType === 'BLIND_COUNT') &&
            policy
        ) {
            const materialWhere: Record<string, unknown> = {
                deletedAt: null,
                inventoryManaged: true,
                status: 'ACTIVE',
            }
            if (policy.abcClass) materialWhere.abcClass = policy.abcClass
            if (policy.velocityClass) materialWhere.velocityClass = policy.velocityClass
            if (policy.riskClass) materialWhere.riskClass = policy.riskClass
            if (policy.materialCategoryId) {
                materialWhere.materialCategoryId = policy.materialCategoryId
            }
            if (policy.materialTypeId) materialWhere.materialTypeId = policy.materialTypeId
            if (policy.minUnitValue != null || policy.maxUnitValue != null) {
                const standardCost: Record<string, unknown> = {}
                if (policy.minUnitValue != null) standardCost.gte = policy.minUnitValue
                if (policy.maxUnitValue != null) standardCost.lte = policy.maxUnitValue
                materialWhere.standardCost = standardCost
            }

            let materials = await this.prisma.mmMaterial.findMany({
                where: materialWhere,
                select: {
                    id: true,
                    standardCost: true,
                    riskClass: true,
                    abcClass: true,
                },
            })

            // Frequency filter: skip materials counted within policy.frequencyDays
            if (policy.frequencyDays > 0 && materials.length) {
                const cutoff = new Date()
                cutoff.setDate(cutoff.getDate() - policy.frequencyDays)
                const recent = await this.prisma.mmCountTask.findMany({
                    where: {
                        materialId: { in: materials.map((m) => m.id) },
                        status: { in: ['ADJUSTED', 'COUNTED', 'APPROVED'] },
                        updatedAt: { gte: cutoff },
                        session: { warehouseId, companyId },
                    },
                    select: { materialId: true },
                    distinct: ['materialId'],
                })
                const recentlyCounted = new Set(recent.map((r) => r.materialId))
                // Keep materials due for count OR with HIGH risk (risk boost)
                materials = materials.filter(
                    (m) => !recentlyCounted.has(m.id) || m.riskClass === 'HIGH',
                )
            }

            if (materials.length === 0) {
                throw new BadRequestException('No materials match the count policy / cycle')
            }
            balanceWhere.materialId = { in: materials.map((m) => m.id) }
        }

        const balances = await this.prisma.mmInventoryBalance.findMany({
            where: balanceWhere,
            include: { material: true },
            orderBy: [{ storageBinId: 'asc' }, { materialId: 'asc' }],
        })

        if (balances.length === 0) {
            throw new BadRequestException('No stock balances found to count')
        }

        // Variance history boost
        const recentVariance = await this.prisma.mmCountVariance.findMany({
            where: {
                status: { in: ['ADJUSTED', 'OPEN', 'PENDING_ADJUSTMENT'] },
                varianceQuantity: { not: 0 },
                task: { materialId: { in: balances.map((b) => b.materialId) } },
                updatedAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
            },
            select: { task: { select: { materialId: true } } },
            distinct: ['taskId'],
        })
        const discrepancySet = new Set(
            recentVariance.map((r) => r.task.materialId).filter(Boolean),
        )

        balances.sort((a, b) => {
            const riskRank = (r?: string | null) =>
                r === 'HIGH' ? 0 : r === 'MEDIUM' ? 1 : 2
            const ad = discrepancySet.has(a.materialId) ? 0 : 1
            const bd = discrepancySet.has(b.materialId) ? 0 : 1
            if (ad !== bd) return ad - bd
            return riskRank(a.material.riskClass) - riskRank(b.material.riskClass)
        })

        return { balances, policy }
    }

    exceedsTolerance(
        policy: {
            varianceQtyTolerance: Decimal | number
            variancePctTolerance?: Decimal | number | null
            varianceValueTolerance: Decimal | number
        } | null,
        varianceQty: Decimal,
        variancePct: Decimal,
        varianceValue: Decimal,
    ): boolean {
        if (!policy) {
            return !varianceQty.equals(0)
        }
        const qtyTol = new Decimal(policy.varianceQtyTolerance)
        const pctTol = new Decimal(policy.variancePctTolerance ?? 0)
        const valTol = new Decimal(policy.varianceValueTolerance)
        if (varianceQty.abs().gt(qtyTol)) return true
        if (pctTol.gt(0) && variancePct.abs().gt(pctTol)) return true
        if (varianceValue.abs().gt(valTol)) return true
        return false
    }
}
