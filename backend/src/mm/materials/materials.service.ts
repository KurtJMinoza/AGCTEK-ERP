import {
    Injectable,
    ConflictException,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateMaterialDto } from './dto/create-material.dto'
import { UpdateMaterialDto } from './dto/update-material.dto'
import { MaterialQueryDto } from './dto/material-query.dto'
import { assertActivateReady } from './material-usability'

const DECIMAL_UPDATE_KEYS = new Set([
    'onHandQty',
    'reservedQty',
    'minimumStock',
    'maximumStock',
    'safetyStock',
    'reorderPoint',
    'reorderQuantity',
    'minimumOrderQuantity',
    'standardCost',
    'weight',
    'length',
    'width',
    'height',
    'volume',
])

function toNumber(value: unknown): number {
    if (value == null) return 0
    if (typeof value === 'number') return value
    if (typeof value === 'string') return Number(value)
    if (value instanceof Decimal) return value.toNumber()
    return Number(value)
}

/** JSON-friendly material (Prisma Decimal → number). */
function serializeMaterial<T extends object>(row: T): T {
    const out = { ...row } as unknown as Record<string, unknown>
    for (const key of [
        'onHandQty',
        'reservedQty',
        'minimumStock',
        'maximumStock',
        'safetyStock',
        'reorderPoint',
        'reorderQuantity',
        'minimumOrderQuantity',
        'standardCost',
        'weight',
        'length',
        'width',
        'height',
        'volume',
    ]) {
        if (key in out) out[key] = toNumber(out[key])
    }
    return out as T
}

@Injectable()
export class MaterialsService {
    constructor(private prisma: PrismaService) {}

    /** Sellable qty from material master thresholds (same source as Product Catalog). */
    private enrichCommercialStock<T extends Record<string, unknown>>(
        row: T,
    ): T & { availableQty: number } {
        const onHand = toNumber(row.onHandQty)
        const reserved = toNumber(row.reservedQty)
        return {
            ...row,
            onHandQty: onHand,
            reservedQty: reserved,
            availableQty: Math.max(0, onHand - reserved),
        }
    }

    private enrichCommercialStockBatch(
        rows: Array<Record<string, unknown>>,
    ): Array<Record<string, unknown> & { availableQty: number }> {
        return rows.map((row) => this.enrichCommercialStock(row))
    }

    /** Nullable FK scalars — empty string clears the relation. */
    private static readonly NULLABLE_FK_KEYS = new Set([
        'currencyId',
        'valuationClassId',
        'companyId',
        'defaultWarehouseId',
        'preferredSupplierId',
        'purchaseUomId',
        'salesUomId',
    ])

    private mapUpdateDto(dto: UpdateMaterialDto): Prisma.MmMaterialUncheckedUpdateInput {
        const data: Prisma.MmMaterialUncheckedUpdateInput = {}
        for (const [key, value] of Object.entries(dto)) {
            if (value === undefined) continue
            if (DECIMAL_UPDATE_KEYS.has(key)) {
                ;(data as Record<string, unknown>)[key] = new Decimal(value as number)
            } else if (
                MaterialsService.NULLABLE_FK_KEYS.has(key) &&
                (value === '' || value === null)
            ) {
                ;(data as Record<string, unknown>)[key] = null
            } else {
                ;(data as Record<string, unknown>)[key] = value
            }
        }
        return data
    }

    private readonly includes = {
        materialType: true,
        materialCategory: true,
        baseUom: true,
        purchaseUom: true,
        salesUom: true,
        currency: true,
        valuationClass: true,
        company: true,
        defaultWarehouse: true,
        preferredSupplier: { select: { id: true, supplierCode: true, supplierName: true } },
    }

    /** List / dropdown — avoid loading every UOM/valuation relation. */
    private readonly listIncludes = {
        materialType: { select: { id: true, code: true, name: true } },
        materialCategory: { select: { id: true, code: true, name: true } },
        baseUom: { select: { id: true, code: true, name: true } },
        currency: { select: { id: true, code: true, name: true, symbol: true } },
        company: { select: { id: true, code: true, name: true } },
        defaultWarehouse: { select: { id: true, code: true, name: true } },
        preferredSupplier: { select: { id: true, supplierCode: true, supplierName: true } },
    }

    async findAll(query: MaterialQueryDto) {
        const {
            page = 1,
            limit = 20,
            search,
            materialTypeId,
            materialCategoryId,
            status,
            batchManaged,
            serialManaged,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = query

        const where: any = { deletedAt: null }

        if (search) {
            where.OR = [
                { materialCode: { contains: search, mode: 'insensitive' } },
                { materialName: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
                { brand: { contains: search, mode: 'insensitive' } },
            ]
        }
        if (materialTypeId) where.materialTypeId = materialTypeId
        if (materialCategoryId) where.materialCategoryId = materialCategoryId
        if (status) where.status = status
        if (batchManaged !== undefined) where.batchManaged = batchManaged
        if (serialManaged !== undefined) where.serialManaged = serialManaged

        const [data, total] = await Promise.all([
            this.prisma.mmMaterial.findMany({
                where,
                include: this.listIncludes,
                orderBy: { [sortBy]: sortOrder },
                skip: (page - 1) * limit,
                take: Math.min(limit, 200),
            }),
            this.prisma.mmMaterial.count({ where }),
        ])

        const enriched = this.enrichCommercialStockBatch(
            data.map((row) => row as Record<string, unknown>),
        )
        return {
            data: enriched.map((row) => serializeMaterial(row)),
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        }
    }

    async findOne(id: string) {
        const material = await this.prisma.mmMaterial.findFirst({
            where: { id, deletedAt: null },
            include: {
                ...this.includes,
                barcodes: { where: { deletedAt: null } },
                batches: { where: { deletedAt: null } },
                serialNumbers: { where: { deletedAt: null } },
                audits: { orderBy: { performedAt: 'desc' }, take: 50 },
                attachments: { orderBy: { uploadedAt: 'desc' } },
            },
        })
        if (!material) throw new NotFoundException('Material not found')
        const enriched = this.enrichCommercialStock(
            material as Record<string, unknown>,
        )
        return serializeMaterial(enriched)
    }

    async listBalances(materialId: string) {
        await this.findOne(materialId)
        return this.prisma.mmInventoryBalance.findMany({
            where: { materialId },
            include: {
                warehouse: { select: { id: true, code: true, name: true } },
                storageBin: { select: { id: true, code: true } },
                batch: { select: { id: true, batchNumber: true } },
            },
            orderBy: [{ warehouseId: 'asc' }, { stockStatus: 'asc' }],
        })
    }

    async listTransactions(materialId: string, limit = 50) {
        await this.findOne(materialId)
        return this.prisma.mmInventoryTransaction.findMany({
            where: { materialId },
            include: {
                warehouse: { select: { id: true, code: true, name: true } },
                uom: { select: { id: true, code: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: Math.min(limit, 200),
        })
    }

    async listAttachments(materialId: string) {
        await this.findOne(materialId)
        return this.prisma.mmMaterialAttachment.findMany({
            where: { materialId },
            orderBy: { uploadedAt: 'desc' },
        })
    }

    async addAttachment(materialId: string, data: {
        fileName: string
        fileUrl?: string
        storageKey?: string
        mimeType?: string
        uploadedBy?: string
    }) {
        await this.findOne(materialId)
        return this.prisma.mmMaterialAttachment.create({
            data: {
                materialId,
                fileName: data.fileName,
                fileUrl: data.fileUrl ?? null,
                storageKey: data.storageKey ?? null,
                mimeType: data.mimeType ?? null,
                uploadedBy: data.uploadedBy ?? null,
            },
        })
    }

    async removeAttachment(materialId: string, attachmentId: string) {
        const att = await this.prisma.mmMaterialAttachment.findFirst({
            where: { id: attachmentId, materialId },
        })
        if (!att) throw new NotFoundException('Attachment not found')
        await this.prisma.mmMaterialAttachment.delete({ where: { id: attachmentId } })
        return { ok: true }
    }

    async create(dto: CreateMaterialDto) {
        const materialCode = dto.materialCode || await this.generateNextCode()
        await this.assertUniqueCode(materialCode)

        const sku = dto.sku?.trim() || (await this.generateNextSku())
        await this.assertUniqueSku(sku)
        this.validateThresholds(dto)

        // Never create directly as ACTIVE without activation checks
        let status = dto.status || 'DRAFT'
        if (status === 'ACTIVE') {
            await assertActivateReady(this.prisma, dto as any)
        } else if (status === 'BLOCKED') {
            // allow create as blocked only via explicit status after draft path — force DRAFT
            status = 'DRAFT'
        }

        const material = await this.prisma.mmMaterial.create({
            data: {
                ...(dto as Prisma.MmMaterialUncheckedCreateInput),
                materialCode,
                sku,
                status,
                onHandQty: new Decimal(dto.onHandQty ?? 0),
                reservedQty: new Decimal(dto.reservedQty ?? 0),
            },
            include: this.includes,
        })

        await this.writeAudit(material.id, 'CREATE', null, material)
        return serializeMaterial(material)
    }

    private async generateNextCode(): Promise<string> {
        const last = await this.prisma.mmMaterial.findFirst({
            where: { materialCode: { startsWith: 'MAT-' } },
            orderBy: { materialCode: 'desc' },
            select: { materialCode: true },
        })
        let seq = 1
        if (last) {
            const num = parseInt(last.materialCode.replace('MAT-', ''), 10)
            if (!isNaN(num)) seq = num + 1
        }
        return `MAT-${String(seq).padStart(6, '0')}`
    }

    private async generateNextSku(): Promise<string> {
        const last = await this.prisma.mmMaterial.findFirst({
            where: { sku: { startsWith: 'SKU-' } },
            orderBy: { sku: 'desc' },
            select: { sku: true },
        })
        let seq = 1
        if (last?.sku) {
            const num = parseInt(last.sku.replace('SKU-', ''), 10)
            if (!isNaN(num)) seq = num + 1
        }
        return `SKU-${String(seq).padStart(6, '0')}`
    }

    async update(id: string, dto: UpdateMaterialDto) {
        const existing = await this.findOne(id)
        if (existing.status === 'BLOCKED') {
            throw new BadRequestException('Cannot update a BLOCKED material')
        }

        delete (dto as any).materialCode
        if (dto.sku && dto.sku !== existing.sku) {
            await this.assertUniqueSku(dto.sku, id)
        }

        const merged = { ...existing, ...dto }
        this.validateThresholds(merged)

        const updated = await this.prisma.mmMaterial.update({
            where: { id },
            data: this.mapUpdateDto(dto),
            include: this.includes,
        })

        if (dto.currencyId !== undefined || dto.standardCost !== undefined) {
            const valuationPatch: Prisma.MmMaterialValuationUncheckedUpdateManyInput = {}
            if (dto.currencyId !== undefined) {
                valuationPatch.currencyId =
                    dto.currencyId && dto.currencyId.trim() !== ''
                        ? dto.currencyId
                        : null
            }
            if (dto.standardCost !== undefined) {
                valuationPatch.standardCost = new Decimal(dto.standardCost)
            }
            if (Object.keys(valuationPatch).length > 0) {
                await this.prisma.mmMaterialValuation.updateMany({
                    where: { materialId: id },
                    data: valuationPatch,
                })
            }
        }

        const changes = this.diffChanges(existing, updated)
        if (Object.keys(changes).length > 0) {
            await this.writeAudit(id, 'UPDATE', changes, null)
        }
        return serializeMaterial(updated)
    }

    async activate(id: string) {
        const material = await this.findOne(id)
        if (material.status === 'ACTIVE') {
            throw new BadRequestException('Material is already active')
        }
        if (material.status === 'BLOCKED') {
            throw new BadRequestException('Unblock the material before activating')
        }
        await assertActivateReady(this.prisma, material as any)
        const updated = await this.prisma.mmMaterial.update({
            where: { id },
            data: { status: 'ACTIVE' },
            include: this.includes,
        })
        await this.writeAudit(id, 'ACTIVATE', {
            status: { old: material.status, new: 'ACTIVE' },
        }, null)
        return updated
    }

    async deactivate(id: string) {
        const material = await this.findOne(id)
        if (material.status === 'INACTIVE') {
            throw new BadRequestException('Material is already inactive')
        }
        if (material.status === 'BLOCKED') {
            throw new BadRequestException('Unblock the material before deactivating')
        }
        const updated = await this.prisma.mmMaterial.update({
            where: { id },
            data: { status: 'INACTIVE' },
            include: this.includes,
        })
        await this.writeAudit(id, 'DEACTIVATE', {
            status: { old: material.status, new: 'INACTIVE' },
        }, null)
        return updated
    }

    async block(id: string, reason?: string) {
        const material = await this.findOne(id)
        if (material.status === 'BLOCKED') {
            throw new BadRequestException('Material is already blocked')
        }
        const updated = await this.prisma.mmMaterial.update({
            where: { id },
            data: { status: 'BLOCKED' },
            include: this.includes,
        })
        await this.writeAudit(id, 'BLOCK', {
            status: { old: material.status, new: 'BLOCKED' },
            reason: reason ?? null,
        }, null)
        return updated
    }

    async unblock(id: string) {
        const material = await this.findOne(id)
        if (material.status !== 'BLOCKED') {
            throw new BadRequestException('Material is not blocked')
        }
        const updated = await this.prisma.mmMaterial.update({
            where: { id },
            data: { status: 'INACTIVE' },
            include: this.includes,
        })
        await this.writeAudit(id, 'UNBLOCK', {
            status: { old: 'BLOCKED', new: 'INACTIVE' },
        }, null)
        return updated
    }

    async softDelete(id: string) {
        await this.findOne(id)
        const activeBatches = await this.prisma.mmBatch.count({
            where: { materialId: id, deletedAt: null, status: 'AVAILABLE' },
        })
        const activeSerials = await this.prisma.mmSerialNumber.count({
            where: { materialId: id, deletedAt: null, status: 'AVAILABLE' },
        })
        if (activeBatches > 0 || activeSerials > 0) {
            throw new BadRequestException(
                'Cannot delete material with active batches or serial numbers',
            )
        }
        return this.prisma.mmMaterial.update({
            where: { id },
            data: { deletedAt: new Date() },
        })
    }

    private async assertUniqueCode(code: string, excludeId?: string) {
        const existing = await this.prisma.mmMaterial.findFirst({
            where: {
                materialCode: { equals: code, mode: 'insensitive' },
                deletedAt: null,
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
        })
        if (existing) {
            throw new ConflictException('Material code already exists')
        }
    }

    private async assertUniqueSku(sku: string, excludeId?: string) {
        const existing = await this.prisma.mmMaterial.findFirst({
            where: {
                sku: { equals: sku, mode: 'insensitive' },
                deletedAt: null,
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
        })
        if (existing) {
            throw new ConflictException('SKU already exists')
        }
    }

    private validateThresholds(data: any) {
        const min = Number(data.minimumStock ?? 0)
        const max = Number(data.maximumStock ?? 0)
        const reorder = Number(data.reorderPoint ?? 0)

        if (max > 0 && min > max) {
            throw new BadRequestException('Minimum stock cannot exceed maximum stock')
        }
        if (max > 0 && reorder > max) {
            throw new BadRequestException('Reorder point cannot exceed maximum stock')
        }
        if (reorder > 0 && min > reorder) {
            throw new BadRequestException('Minimum stock cannot exceed reorder point')
        }
        const onHand = Number(data.onHandQty ?? 0)
        const reserved = Number(data.reservedQty ?? 0)
        if (reserved > onHand) {
            throw new BadRequestException('Reserved cannot exceed on hand')
        }
    }

    private diffChanges(oldObj: any, newObj: any): Record<string, { old: any; new: any }> {
        const skip = new Set([
            'id', 'createdAt', 'updatedAt', 'deletedAt',
            'materialType', 'materialCategory', 'baseUom',
            'purchaseUom', 'salesUom', 'currency', 'valuationClass',
            'company', 'defaultWarehouse', 'preferredSupplier', 'barcodes', 'batches',
            'serialNumbers', 'audits', 'uomConversions', 'attachments',
        ])
        const changes: Record<string, { old: any; new: any }> = {}
        for (const key of Object.keys(newObj)) {
            if (skip.has(key)) continue
            const o = oldObj[key]
            const n = newObj[key]
            if (String(o) !== String(n)) {
                changes[key] = { old: o, new: n }
            }
        }
        return changes
    }

    private async writeAudit(
        materialId: string,
        action: string,
        changes: any,
        fullPayload: any,
    ) {
        await this.prisma.mmMaterialAudit.create({
            data: {
                materialId,
                action,
                changes: changes || fullPayload,
            },
        })
    }
}
