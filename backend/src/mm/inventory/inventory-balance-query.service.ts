import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { RESTRICTED_STOCK_STATUSES } from './inventory.constants'
import { BalanceQueryDto } from './dto/balance-query.dto'
import { TransactionQueryDto } from './dto/transaction-query.dto'

@Injectable()
export class InventoryBalanceQueryService {
    constructor(private prisma: PrismaService) {}

    private readonly balanceIncludes = {
        company: { select: { id: true, code: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        storageBin: { select: { id: true, code: true } },
        material: {
            select: {
                id: true,
                materialCode: true,
                materialName: true,
                materialCategoryId: true,
            },
        },
        batch: { select: { id: true, batchNumber: true, expiryDate: true } },
        serialNumber: { select: { id: true, serialNumber: true } },
    }

    private readonly transactionIncludes = {
        company: { select: { id: true, code: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        storageBin: { select: { id: true, code: true } },
        material: {
            select: { id: true, materialCode: true, materialName: true },
        },
        batch: { select: { id: true, batchNumber: true } },
        serialNumber: { select: { id: true, serialNumber: true } },
        uom: { select: { id: true, code: true, name: true } },
    }

    private buildBalanceWhere(dto: BalanceQueryDto) {
        const where: Record<string, string> = {}
        if (dto.companyId) where.companyId = dto.companyId
        if (dto.warehouseId) where.warehouseId = dto.warehouseId
        if (dto.materialId) where.materialId = dto.materialId
        if (dto.storageBinId) where.storageBinId = dto.storageBinId
        if (dto.batchId) where.batchId = dto.batchId
        if (dto.serialNumberId) where.serialNumberId = dto.serialNumberId
        if (dto.stockStatus) where.stockStatus = dto.stockStatus
        return where
    }

    async queryBalanceSummary(dto: BalanceQueryDto) {
        const where = this.buildBalanceWhere(dto)

        const [byStatus, reservedAgg, rowCount] = await Promise.all([
            this.prisma.mmInventoryBalance.groupBy({
                by: ['stockStatus'],
                where,
                _sum: { quantity: true, reservedQuantity: true },
                _count: { _all: true },
            }),
            this.prisma.mmInventoryBalance.aggregate({
                where: { ...where, stockStatus: 'UNRESTRICTED' },
                _sum: { reservedQuantity: true, quantity: true },
            }),
            this.prisma.mmInventoryBalance.count({ where }),
        ])

        let onHand = new Decimal(0)
        let unrestrictedOnHand = new Decimal(0)
        let restricted = new Decimal(0)
        const statusRows: Array<{ status: string; rowCount: number; quantity: number }> =
            []

        for (const row of byStatus) {
            const qty = new Decimal(row._sum.quantity ?? 0)
            onHand = onHand.plus(qty)
            statusRows.push({
                status: row.stockStatus,
                rowCount: row._count._all,
                quantity: Number(qty),
            })
            if (row.stockStatus === 'UNRESTRICTED') {
                unrestrictedOnHand = qty
            } else if (RESTRICTED_STOCK_STATUSES.has(row.stockStatus as any)) {
                restricted = restricted.plus(qty)
            }
        }

        const reserved = new Decimal(reservedAgg._sum.reservedQuantity ?? 0)
        if (unrestrictedOnHand.eq(0) && reservedAgg._sum.quantity != null) {
            unrestrictedOnHand = new Decimal(reservedAgg._sum.quantity)
        }
        const available = unrestrictedOnHand.minus(reserved)

        return {
            filters: where,
            rowCount,
            onHand: Number(onHand),
            unrestrictedOnHand: Number(unrestrictedOnHand),
            reserved: Number(reserved),
            restricted: Number(restricted),
            available: Number(available),
            byStatus: statusRows.sort((a, b) => a.status.localeCompare(b.status)),
        }
    }

    async queryBalances(dto: BalanceQueryDto) {
        const page = dto.page ?? 1
        const limit = dto.limit ?? 50
        const skip = (page - 1) * limit

        const where = this.buildBalanceWhere(dto)

        const [data, total] = await Promise.all([
            this.prisma.mmInventoryBalance.findMany({
                where,
                include: this.balanceIncludes,
                orderBy: { updatedAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.mmInventoryBalance.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async queryTransactions(dto: TransactionQueryDto) {
        const page = dto.page ?? 1
        const limit = dto.limit ?? 50
        const skip = (page - 1) * limit

        const where: any = {}
        if (dto.companyId) where.companyId = dto.companyId
        if (dto.warehouseId) where.warehouseId = dto.warehouseId
        if (dto.materialId) where.materialId = dto.materialId
        if (dto.storageBinId) where.storageBinId = dto.storageBinId
        if (dto.batchId) where.batchId = dto.batchId
        if (dto.serialNumberId) where.serialNumberId = dto.serialNumberId
        if (dto.movementType) where.movementType = dto.movementType
        if (dto.stockStatus) where.stockStatus = dto.stockStatus
        if (dto.sourceDocumentId) where.sourceDocumentId = dto.sourceDocumentId
        if (dto.fromDate || dto.toDate) {
            where.postingDate = {}
            if (dto.fromDate) where.postingDate.gte = new Date(dto.fromDate)
            if (dto.toDate) where.postingDate.lte = new Date(dto.toDate)
        }
        if (dto.reversalFilter === 'reversals') {
            where.reversalOfId = { not: null }
        } else if (dto.reversalFilter === 'original') {
            where.reversalOfId = null
        }

        const [data, total] = await Promise.all([
            this.prisma.mmInventoryTransaction.findMany({
                where,
                include: this.transactionIncludes,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.mmInventoryTransaction.count({ where }),
        ])

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    async getByMaterial(materialId: string) {
        const [balances, recentTransactions] = await Promise.all([
            this.prisma.mmInventoryBalance.findMany({
                where: { materialId },
                include: this.balanceIncludes,
                orderBy: { updatedAt: 'desc' },
            }),
            this.prisma.mmInventoryTransaction.findMany({
                where: { materialId },
                include: this.transactionIncludes,
                orderBy: { createdAt: 'desc' },
                take: 50,
            }),
        ])
        return { balances, recentTransactions }
    }

    async getByWarehouse(warehouseId: string) {
        const [balances, recentTransactions] = await Promise.all([
            this.prisma.mmInventoryBalance.findMany({
                where: { warehouseId },
                include: this.balanceIncludes,
                orderBy: { updatedAt: 'desc' },
            }),
            this.prisma.mmInventoryTransaction.findMany({
                where: { warehouseId },
                include: this.transactionIncludes,
                orderBy: { createdAt: 'desc' },
                take: 50,
            }),
        ])
        return { balances, recentTransactions }
    }
}
