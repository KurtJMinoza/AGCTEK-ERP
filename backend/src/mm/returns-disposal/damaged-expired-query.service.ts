import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { SupplierReturnService } from './supplier-return.service'
import { DisposalService } from './disposal.service'
import {
    DamagedExpiredQueryDto,
    IdentifyDamageDto,
    MarkExpiredDto,
    CreateFromBalancesDto,
} from './dto/returns-disposal.dto'

@Injectable()
export class DamagedExpiredQueryService {
    constructor(
        private prisma: PrismaService,
        private postingService: InventoryPostingService,
        private returnService: SupplierReturnService,
        private disposalService: DisposalService,
    ) {}

    async getDamagedStock(query: DamagedExpiredQueryDto) {
        const where: any = {
            stockStatus: { in: ['BLOCKED', 'DAMAGED'] },
            quantity: { gt: 0 },
        }
        if (query.companyId) where.companyId = query.companyId
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.materialId) where.materialId = query.materialId

        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 50

        const [data, total] = await Promise.all([
            this.prisma.mmInventoryBalance.findMany({
                where,
                include: {
                    material: true,
                    warehouse: true,
                    batch: true,
                    storageBin: true,
                },
                orderBy: { updatedAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmInventoryBalance.count({ where }),
        ])

        return { data, total, page, pageSize }
    }

    async getExpiredStock(query: DamagedExpiredQueryDto) {
        const now = new Date()

        const where: any = {
            quantity: { gt: 0 },
            OR: [
                { stockStatus: 'EXPIRED' },
                { batch: { expiryDate: { lt: now } } },
            ],
        }
        if (query.companyId) where.companyId = query.companyId
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.materialId) where.materialId = query.materialId

        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 50

        const [data, total] = await Promise.all([
            this.prisma.mmInventoryBalance.findMany({
                where,
                include: {
                    material: true,
                    warehouse: true,
                    batch: true,
                    storageBin: true,
                },
                orderBy: { updatedAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmInventoryBalance.count({ where }),
        ])

        return { data, total, page, pageSize }
    }

    /** UNRESTRICTED → BLOCKED (DAMAGE) via transfer pair */
    async identifyDamage(dto: IdentifyDamageDto) {
        if (dto.quantity <= 0) {
            throw new BadRequestException('Quantity must be positive')
        }
        const now = new Date().toISOString()
        const base = {
            companyId: dto.companyId,
            warehouseId: dto.warehouseId,
            storageBinId: dto.storageBinId,
            materialId: dto.materialId,
            batchId: dto.batchId,
            serialNumberId: dto.serialNumberId,
            quantity: dto.quantity,
            uomId: dto.uomId,
            unitCost: dto.unitCost ?? 0,
            postingDate: now,
            documentDate: now,
            sourceModule: 'RETURNS_DISPOSAL',
            sourceDocumentType: 'DAMAGE_IDENTIFY',
            sourceDocumentId: `${dto.materialId}:${dto.warehouseId}`,
            reasonCode: 'DAMAGE',
            createdBy: dto.performedBy,
        }

        await this.postingService.postTransaction({
            ...base,
            stockStatus: 'UNRESTRICTED',
            movementType: 'TRANSFER_OUT',
        })
        const txnIn = await this.postingService.postTransaction({
            ...base,
            stockStatus: 'BLOCKED',
            movementType: 'TRANSFER_IN',
        })
        return { ok: true, inventoryTxnId: txnIn.id, stockStatus: 'BLOCKED' }
    }

    /** Move qty from UNRESTRICTED (or given) → EXPIRED */
    async markExpired(dto: MarkExpiredDto) {
        if (dto.quantity <= 0) {
            throw new BadRequestException('Quantity must be positive')
        }
        const fromStatus = dto.fromStockStatus ?? 'UNRESTRICTED'
        const now = new Date().toISOString()
        const base = {
            companyId: dto.companyId,
            warehouseId: dto.warehouseId,
            storageBinId: dto.storageBinId,
            materialId: dto.materialId,
            batchId: dto.batchId,
            serialNumberId: dto.serialNumberId,
            quantity: dto.quantity,
            uomId: dto.uomId,
            unitCost: dto.unitCost ?? 0,
            postingDate: now,
            documentDate: now,
            sourceModule: 'RETURNS_DISPOSAL',
            sourceDocumentType: 'EXPIRE_MARK',
            sourceDocumentId: `${dto.materialId}:${dto.warehouseId}`,
            reasonCode: 'EXPIRY',
            createdBy: dto.performedBy,
        }

        await this.postingService.postTransaction({
            ...base,
            stockStatus: fromStatus,
            movementType: 'TRANSFER_OUT',
        })
        const txnIn = await this.postingService.postTransaction({
            ...base,
            stockStatus: 'EXPIRED',
            movementType: 'TRANSFER_IN',
        })
        return { ok: true, inventoryTxnId: txnIn.id, stockStatus: 'EXPIRED' }
    }

    async createSupplierReturnFromBalances(dto: CreateFromBalancesDto) {
        if (!dto.supplierId) {
            throw new BadRequestException('supplierId is required')
        }
        return this.returnService.create({
            companyId: dto.companyId,
            warehouseId: dto.warehouseId,
            supplierId: dto.supplierId,
            goodsReceiptId: dto.goodsReceiptId,
            reason: dto.reason,
            remarks: dto.remarks,
            createdBy: dto.createdBy,
            lines: dto.lines.map((l) => ({
                materialId: l.materialId,
                uomId: l.uomId,
                batchId: l.batchId,
                serialNumberId: l.serialNumberId,
                storageBinId: l.storageBinId,
                quantity: l.quantity,
                unitCost: l.unitCost ?? 0,
                reason: dto.reason,
                stockStatus: l.stockStatus ?? 'BLOCKED',
            })),
        })
    }

    async createDisposalFromBalances(dto: CreateFromBalancesDto) {
        const disposalType = dto.disposalType ?? 'DISPOSAL'
        return this.disposalService.create({
            companyId: dto.companyId,
            warehouseId: dto.warehouseId,
            disposalType,
            reason: dto.reason,
            remarks: dto.remarks,
            createdBy: dto.createdBy,
            lines: dto.lines.map((l) => ({
                materialId: l.materialId,
                uomId: l.uomId,
                batchId: l.batchId,
                serialNumberId: l.serialNumberId,
                storageBinId: l.storageBinId,
                quantity: l.quantity,
                unitCost: l.unitCost ?? 0,
                reason: dto.reason,
                stockStatus: l.stockStatus ?? (disposalType === 'DISPOSAL' ? 'EXPIRED' : 'BLOCKED'),
            })),
        })
    }
}
