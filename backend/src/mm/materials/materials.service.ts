import {
    Injectable,
    ConflictException,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { InventoryAvailabilityService } from '../inventory/inventory-availability.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
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

/** Live MM ledger totals for one material (MM-08 ATP authority). */
export type LedgerTotals = {
    onHandQty: number
    reservedQty: number
    availableQty: number
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
    constructor(
        private prisma: PrismaService,
        private availability: InventoryAvailabilityService,
        private posting: InventoryPostingService,
    ) {}

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

    private async enrichCommercialStockBatch(
        rows: Array<Record<string, unknown>>,
    ): Promise<Array<Record<string, unknown> & { availableQty: number }>> {
        if (!rows.length) return []

        // Live company-wide totals from the MM ledger (same source as the SD
        // Product Catalog). `onHandQty` / `reservedQty` stay the material master
        // cache; the `ledger*` fields are the authoritative display values.
        const ledgerTotals = await this.getLedgerTotalsForMaterials(rows)

        return rows.map((row) => {
            const totals: LedgerTotals = ledgerTotals.get(row.id as string) ?? {
                onHandQty: toNumber(row.onHandQty),
                reservedQty: toNumber(row.reservedQty),
                availableQty: 0,
            }
            return {
                ...row,
                onHandQty: toNumber(row.onHandQty),
                reservedQty: toNumber(row.reservedQty),
                /** Sellable = unrestricted MM on-hand − active reservations. */
                availableQty: Math.max(0, totals.availableQty),
                ledgerOnHandQty: totals.onHandQty,
                ledgerReservedQty: totals.reservedQty,
                ledgerAvailableQty: totals.availableQty,
            }
        })
    }

    /**
     * Live MM ledger totals per material, grouped by the material's own company.
     *
     * Delegates to the single MM authority — `InventoryAvailabilityService` — so
     * Material Master, the MM inventory screens and the SD Product Catalog all
     * report the same on-hand / reserved / sellable numbers. The material master
     * `onHandQty` / `reservedQty` columns are only a cache and must never be the
     * display source for actual stock.
     */
    private async getLedgerTotalsForMaterials(
        rows: Array<Record<string, unknown>>,
    ): Promise<Map<string, LedgerTotals>> {
        const result = new Map<string, LedgerTotals>()

        const byCompany = new Map<string, string[]>()
        for (const row of rows) {
            const materialId = row.id as string | undefined
            const companyId = row.companyId as string | null | undefined
            if (!materialId || !companyId) continue
            const ids = byCompany.get(companyId) ?? []
            ids.push(materialId)
            byCompany.set(companyId, ids)
        }

        for (const [companyId, materialIds] of byCompany) {
            const totals = await this.availability.getCompanyMaterialTotalsBatch(
                companyId,
                [...new Set(materialIds)],
            )
            for (const [materialId, total] of totals) {
                result.set(materialId, total)
            }
        }

        // Materials without a company (or without ledger rows) report an honest
        // zero instead of falling back to the stale master cache.
        for (const row of rows) {
            const materialId = row.id as string | undefined
            if (!materialId || result.has(materialId)) continue
            result.set(materialId, {
                onHandQty: 0,
                reservedQty: 0,
                availableQty: 0,
            })
        }

        return result
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

        const enriched = await this.enrichCommercialStockBatch(
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

        // Get live ledger totals for this material (same as Product Catalog)
        const companyId = material.companyId
        const ledger = companyId
            ? await this.getLedgerTotalsForMaterials([
                  { id: material.id, companyId: material.companyId },
              ])
            : null
        // Get live ledger totals for this material (same source as the SD
        // Product Catalog). A material without a company has no ledger rows, so
        // it reports an honest zero rather than the stale master cache.
        const ledgerTotals = ledger?.get(material.id) ?? {
            onHandQty: 0,
            reservedQty: 0,
            availableQty: 0,
        }

        const enriched = this.enrichCommercialStock(
            material as Record<string, unknown>,
        )
        const serialized = serializeMaterial(enriched)
        // Override availableQty with live ledger data (same as Product Catalog)
        return {
            ...serialized,
            availableQty: Math.max(0, ledgerTotals.availableQty),
            ledgerOnHandQty: ledgerTotals.onHandQty,
            ledgerReservedQty: ledgerTotals.reservedQty,
            ledgerAvailableQty: ledgerTotals.availableQty,
        } as typeof serialized & {
            ledgerOnHandQty: number
            ledgerReservedQty: number
            ledgerAvailableQty: number
        }
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

        const [deletedByCode, deletedBySku] = await Promise.all([
            this.prisma.mmMaterial.findFirst({
                where: {
                    materialCode: { equals: materialCode, mode: 'insensitive' },
                    deletedAt: { not: null },
                },
            }),
            this.prisma.mmMaterial.findFirst({
                where: {
                    sku: { equals: sku, mode: 'insensitive' },
                    deletedAt: { not: null },
                },
            }),
        ])

        if (deletedByCode && deletedBySku && deletedByCode.id !== deletedBySku.id) {
            throw new ConflictException(
                'Material code and SKU belong to different deleted materials; use a different code or SKU',
            )
        }

        // Never create directly as ACTIVE without activation checks
        let status = dto.status || 'DRAFT'
        if (status === 'ACTIVE') {
            await assertActivateReady(this.prisma, dto as any)
        } else if (status === 'BLOCKED') {
            // allow create as blocked only via explicit status after draft path — force DRAFT
            status = 'DRAFT'
        }

        // Materials default to the PHP currency. The New/Edit Material form no
        // longer exposes a currency picker; the API remains the authority.
        const currencyId =
            dto.currencyId && dto.currencyId.trim() !== ''
                ? dto.currencyId
                : ((await this.prisma.mmCurrency.findFirst({
                      where: { code: 'PHP' },
                      select: { id: true },
                  }))?.id ?? null)

        const data = {
            ...(dto as Prisma.MmMaterialUncheckedCreateInput),
            materialCode,
            sku,
            status,
            currencyId,
            onHandQty: new Decimal(0),
            reservedQty: new Decimal(0),
        }

        const deletedMaterial = deletedByCode ?? deletedBySku
        try {
            const material = deletedMaterial
                ? await this.prisma.mmMaterial.update({
                      where: { id: deletedMaterial.id },
                      data: {
                          ...data,
                          deletedAt: null,
                      } as Prisma.MmMaterialUncheckedUpdateInput,
                      include: this.includes,
                  })
                : await this.prisma.mmMaterial.create({
                      data,
                      include: this.includes,
                  })

            // Opening stock entered on the material form is ledger-owned: post
            // it through the inventory engine (cache only mirrors the ledger).
            if (Number(dto.onHandQty ?? 0) > 0) {
                await this.postStockChange({
                    materialId: material.id,
                    onHandQty: Number(dto.onHandQty),
                    currentlyOnHand: 0,
                    companyId:
                        material.companyId ?? dto.companyId ?? null,
                    warehouseId:
                        material.defaultWarehouseId ??
                        dto.defaultWarehouseId ??
                        null,
                    createdBy: 'material-form',
                })
            }

            await this.writeAudit(
                material.id,
                deletedMaterial ? 'RESTORE' : 'CREATE',
                deletedMaterial ? this.diffChanges(deletedMaterial, material) : null,
                material,
            )
            return serializeMaterial(material)
        } catch (error) {
            this.rethrowUniqueConflict(error)
            throw error
        }
    }

    private async generateNextCode(): Promise<string> {
        const materials = await this.prisma.mmMaterial.findMany({
            where: { materialCode: { startsWith: 'MAT-' } },
            select: { materialCode: true },
        })
        const seq = this.nextNumericSuffix(materials.map(({ materialCode }) => materialCode), 'MAT-')
        return `MAT-${String(seq).padStart(6, '0')}`
    }

    private async generateNextSku(): Promise<string> {
        const materials = await this.prisma.mmMaterial.findMany({
            where: { sku: { startsWith: 'SKU-' } },
            select: { sku: true },
        })
        const seq = this.nextNumericSuffix(
            materials.flatMap(({ sku }) => sku ? [sku] : []),
            'SKU-',
        )
        return `SKU-${String(seq).padStart(6, '0')}`
    }

    private nextNumericSuffix(values: string[], prefix: string): number {
        const max = values.reduce((currentMax, value) => {
            const suffix = value.slice(prefix.length)
            if (!/^\d+$/.test(suffix)) return currentMax
            return Math.max(currentMax, Number(suffix))
        }, 0)
        return max + 1
    }

    private rethrowUniqueConflict(error: unknown): void {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
            return
        }

        const target = Array.isArray(error.meta?.target)
            ? error.meta.target.join(',')
            : String(error.meta?.target ?? '')
        if (target.includes('materialCode')) {
            throw new ConflictException('Material code already exists')
        }
        if (target.includes('sku')) {
            throw new ConflictException('SKU already exists')
        }
        throw new ConflictException('Material code or SKU already exists')
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

        // On-hand is ledger-owned: takes the target from the form, posts the
        // delta through InventoryPostingService, and never writes the master
        // cache directly (reservedQty also stays read-only).
        const targetOnHand =
            dto.onHandQty !== undefined ? Number(dto.onHandQty) : undefined
        const targetReserved =
            dto.reservedQty !== undefined ? Number(dto.reservedQty) : undefined
        delete (dto as any).onHandQty
        delete (dto as any).reservedQty

        const updated = await this.prisma.mmMaterial.update({
            where: { id },
            data: this.mapUpdateDto(dto),
            include: this.includes,
        })

        if (targetOnHand !== undefined) {
            await this.postStockChange({
                materialId: id,
                onHandQty: targetOnHand,
                currentlyOnHand:
                    Number(existing.ledgerOnHandQty ?? existing.onHandQty ?? 0),
                companyId:
                    (dto.companyId ?? existing.companyId ?? null) as
                        | string
                        | null,
                warehouseId:
                    (dto.defaultWarehouseId ??
                        existing.defaultWarehouseId ??
                        null) as string | null,
                createdBy: 'material-form',
            })
        }

        if (targetReserved !== undefined) {
            // Reserved is derived from reservations — never typed by hand.
            // Only the audit below records the attempt for traceability.
            void targetReserved
        }

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

    /**
     * Opening/adjusted on-hand from the material form. Stock is ledger-owned:
     * a positive target posts an ADJUSTMENT_IN through InventoryPostingService
     * (and the diff for edits), never a direct master-cache write. Requires
     * company + warehouse scope so the transaction lands on a real balance.
     */
    private async postStockChange(args: {
        materialId: string
        onHandQty: number
        currentlyOnHand: number
        companyId?: string | null
        warehouseId?: string | null
        createdBy?: string | null
    }) {
        const delta = new Decimal(args.onHandQty)
            .minus(new Decimal(args.currentlyOnHand))
            .toNumber()
        if (delta === 0) return
        if (!args.companyId || !args.warehouseId) {
            throw new BadRequestException(
                'Opening stock requires the material to have a Company and a Default warehouse. Save those first, then set On hand.',
            )
        }
        const key = `material-stock:${args.materialId}:${delta}`
        await this.posting.postTransaction({
            companyId: args.companyId,
            warehouseId: args.warehouseId,
            materialId: args.materialId,
            stockStatus: 'UNRESTRICTED',
            movementType: delta > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
            quantity: Math.abs(delta),
            uomId: (await this.prisma.mmMaterial.findUnique({
                where: { id: args.materialId },
                select: { baseUomId: true },
            }))?.baseUomId ?? '',
            postingDate: new Date().toISOString(),
            documentDate: new Date().toISOString(),
            sourceModule: 'MATERIAL_MASTER',
            sourceDocumentType: 'MATERIAL_STOCK_THRESHOLD',
            sourceDocumentId: args.materialId,
            reasonCode: 'THRESHOLD_EDIT',
            idempotencyKey: key,
            createdBy: args.createdBy ?? undefined,
        })
        // Keep the master cache aligned with the ledger after the posting.
        if (args.companyId) {
            await this.availability.syncMaterialMasterFromLedger(args.materialId)
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
