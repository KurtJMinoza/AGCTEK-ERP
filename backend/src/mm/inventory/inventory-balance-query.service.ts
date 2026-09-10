import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { BalanceQueryDto } from './dto/balance-query.dto'
import { TransactionQueryDto } from './dto/transaction-query.dto'

@Injectable()
export class InventoryBalanceQueryService {
    constructor(private prisma: PrismaService) {}

    private readonly balanceIncludes = {
        company: true,
        warehouse: true,
        storageBin: true,
        material: true,
        batch: true,
        serialNumber: true,
    }

    private readonly transactionIncludes = {
        company: true,
        warehouse: true,
        storageBin: true,
        material: true,
        batch: true,
        serialNumber: true,
        uom: true,
    }

    async queryBalances(dto: BalanceQueryDto) {
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
        if (dto.stockStatus) where.stockStatus = dto.stockStatus

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
