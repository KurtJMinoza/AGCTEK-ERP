import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import * as XLSX from 'xlsx'
import { PrismaService } from '../prisma/prisma.service'
import { MaterialsService } from '../mm/materials/materials.service'
import { ProductFamilyService } from './product-family.service'
import {
    defaultMaterialTypeId,
    resolveImportBin,
    resolveImportWarehouse,
    resolveMaterialCategory,
    resolveMaterialUom,
} from './material-import-lookups'

/** One mapped spreadsheet row (canonical column names, raw cell values). */
type ImportRow = {
    materialSku?: string
    barcode?: string
    productName?: string
    category?: string
    brand?: string
    uom?: string
    unitCost?: string
    srp?: string
    initialStock?: string
    reorderLevel?: string
    warehouse?: string
    storageLocation?: string
    salesDescription?: string
    salesAvailability?: string
}

type RowPlan = {
    action: 'UPDATE' | 'ADD_LISTING' | 'CREATE_MATERIAL' | null
    errors: string[]
    warnings: string[]
    payload: ImportRow
    materialId?: string
    productId?: string
    variantId?: string
    price?: number
    categoryName?: string
    qty?: number
    source?: 'SD' | 'MM'
}

const COLUMN_ALIASES: Record<keyof ImportRow, string[]> = {
    materialSku: ['materialsku', 'sku', 'materialcode'],
    barcode: ['barcode', 'eancode', 'upccode'],
    productName: ['productname', 'materialname', 'name', 'itemname'],
    category: ['category', 'materialcategory'],
    brand: ['brand'],
    uom: ['unitofmeasure', 'uom', 'baseuom', 'um'],
    unitCost: ['unitcost', 'standardcost', 'cost'],
    srp: ['srp', 'sellingprice', 'price'],
    initialStock: [
        'initialstockquantity',
        'initialstock',
        'openingstock',
        'openingquantity',
        'available',
    ],
    reorderLevel: ['reorderlevel', 'reorderpoint'],
    warehouse: ['warehouse', 'warehousecode'],
    storageLocation: ['storagelocation', 'storagebin', 'bin'],
    salesDescription: ['salesdescription', 'salesdesc'],
    salesAvailability: [
        'salesavailability',
        'availability',
        'isactive',
    ],
}

const TEMPLATE_COLUMNS: Array<[keyof ImportRow, string]> = [
    ['productName', 'ItemName'],
    ['uom', 'UM'],
    ['category', 'Category'],
    ['initialStock', 'Available'],
    ['barcode', 'Barcode'],
    ['unitCost', 'Cost'],
    ['srp', 'Price'],
]

const MAX_ROWS = 2000

function normalizeHeader(value: unknown) {
    return String(value ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
}

function text(value: unknown): string | undefined {
    const out = String(value ?? '').trim()
    return out === '' ? undefined : out
}

function parseNumber(value: string | undefined): number | null {
    if (value === undefined) return null
    const cleaned = value.replace(/[₱,\s]/g, '')
    const num = Number(cleaned)
    return Number.isFinite(num) ? num : NaN
}

function parseBool(value: string | undefined): boolean | null {
    if (value === undefined) return null
    const v = value.trim().toLowerCase()
    if (['true', 'yes', 'y', '1', 'active', 'available'].includes(v)) return true
    if (['false', 'no', 'n', '0', 'inactive', 'unavailable'].includes(v))
        return false
    return null
}

function barcodeType(value: string) {
    if (/^\d{13}$/.test(value)) return 'EAN13'
    if (/^\d{12}$/.test(value)) return 'UPC_A'
    return 'CODE128'
}

/**
 * One Excel import engine for Material Master and the Product Catalog.
 *
 * Material Master stays authoritative: a row either updates an existing SD
 * listing, adds a listing for an existing material, or creates the material
 * first. The catalog never gets a second material for the same SKU/barcode.
 */
@Injectable()
export class ProductImportService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly materials: MaterialsService,
        private readonly productFamily: ProductFamilyService,
    ) {}

    template(): Buffer {
        const sheet = XLSX.utils.aoa_to_sheet([
            TEMPLATE_COLUMNS.map(([, header]) => header),
        ])
        sheet['!cols'] = TEMPLATE_COLUMNS.map(([, header]) => ({
            wch: Math.max(15, header.length + 2),
        }))
        const book = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(book, sheet, 'Products')
        const notes = XLSX.utils.aoa_to_sheet([
            ['Import notes'],
            ['Material SKU and Barcode are matched before creating anything.'],
            ['Initial stock is never posted by the import commit.'],
            [
                'Post it with the separate opening-stock action after reviewing the import.',
            ],
        ])
        XLSX.utils.book_append_sheet(book, notes, 'Notes')
        return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })
    }

    async preview(args: {
        buffer: Buffer | null
        filename: string
        source?: string
        companyId: string
        divisionId: string
        createdBy?: string
        idempotencyKey?: string
    }) {
        if (!args.buffer?.length) {
            throw new BadRequestException('Upload an Excel file (.xlsx, .xls or .csv)')
        }
        if (!args.companyId) throw new BadRequestException('Company is required')
        const company = await this.prisma.company.findUnique({
            where: { id: args.companyId },
            select: { id: true },
        })
        if (!company) throw new BadRequestException('Company not found')

        if (args.idempotencyKey) {
            const existing = await this.prisma.sdProductImportBatch.findUnique({
                where: { idempotencyKey: args.idempotencyKey },
            })
            if (existing) return this.getBatch(existing.id)
        }

        const rows = this.readWorkbook(args.buffer)
        if (!rows.length) {
            throw new BadRequestException('The file has no data rows')
        }
        if (rows.length > MAX_ROWS) {
            throw new BadRequestException(
                `The file has ${rows.length} rows; the limit is ${MAX_ROWS}`,
            )
        }

        const ctx = {
            companyId: args.companyId,
            divisionId: args.divisionId,
            defaultMaterialTypeId: await this.defaultMaterialTypeId(),
            source: (args.source ?? 'SD') as 'SD' | 'MM',
        }

        const seenSkus = new Set<string>()
        const seenBarcodes = new Set<string>()
        const plans: RowPlan[] = []
        for (const [index, row] of rows.entries()) {
            const plan = await this.planRow(row, ctx)
            const skuKey = row.materialSku?.toLowerCase()
            if (skuKey) {
                if (seenSkus.has(skuKey)) {
                    plan.errors.push('Material SKU appears twice in this file')
                    plan.action = null
                }
                seenSkus.add(skuKey)
            }
            if (row.barcode) {
                if (seenBarcodes.has(row.barcode)) {
                    plan.errors.push('Barcode appears twice in this file')
                    plan.action = null
                }
                seenBarcodes.add(row.barcode)
            }
            plans.push(plan)
        }

        const batchNumber = `PIM-${Date.now()}-${Math.floor(
            Math.random() * 9000 + 1000,
        )}`
        const batch = await this.prisma.sdProductImportBatch.create({
            data: {
                batchNumber,
                filename: args.filename || 'products.xlsx',
                source: args.source === 'MM' ? 'MM' : 'SD',
                status: 'PREVIEW',
                idempotencyKey: args.idempotencyKey ?? null,
                companyId: args.companyId,
                divisionId: args.divisionId,
                createdBy: args.createdBy ?? null,
                totalRows: plans.length,
                rows: {
                    create: plans.map((plan, index) => ({
                        rowNumber: index + 2,
                        status: plan.errors.length ? 'INVALID' : 'VALID',
                        action: plan.action,
                        payload: plan.payload as Prisma.InputJsonValue,
                        errors: {
                            errors: plan.errors,
                            warnings: plan.warnings,
                        } as Prisma.InputJsonValue,
                    })),
                },
            },
        })
        await this.refreshCounts(batch.id)
        return this.getBatch(batch.id)
    }

    async listBatches(limit = 20) {
        return this.prisma.sdProductImportBatch.findMany({
            orderBy: { createdAt: 'desc' },
            take: Math.min(Math.max(limit, 1), 100),
            select: {
                id: true,
                batchNumber: true,
                filename: true,
                source: true,
                status: true,
                totalRows: true,
                validRows: true,
                invalidRows: true,
                createdMaterialRows: true,
                createdListingRows: true,
                updatedRows: true,
                duplicateBarcodeRows: true,
                createdAt: true,
                committedAt: true,
            },
        })
    }

    async getBatch(id: string) {
        const batch = await this.prisma.sdProductImportBatch.findUnique({
            where: { id },
            include: { rows: { orderBy: { rowNumber: 'asc' } } },
        })
        if (!batch) throw new NotFoundException('Import batch not found')
        return batch
    }

    async cancel(id: string) {
        const batch = await this.prisma.sdProductImportBatch.findUnique({
            where: { id },
            select: { id: true, status: true },
        })
        if (!batch) throw new NotFoundException('Import batch not found')
        if (batch.status === 'COMMITTED') {
            throw new ConflictException('A committed import cannot be cancelled')
        }
        await this.prisma.sdProductImportBatch.update({
            where: { id },
            data: { status: 'CANCELLED' },
        })
        return this.getBatch(id)
    }

    async retry(id: string) {
        const batch = await this.prisma.sdProductImportBatch.findUnique({
            where: { id },
            include: { rows: true },
        })
        if (!batch) throw new NotFoundException('Import batch not found')
        const retryable = batch.rows.filter((row) => row.status === 'FAILED')
        if (!retryable.length) {
            throw new BadRequestException('This import has no failed rows to retry')
        }
        // A committed batch can still carry failed rows; reopening it lets the
        // normal commit path retry only those rows.
        await this.prisma.$transaction([
            this.prisma.sdProductImportRow.updateMany({
                where: { batchId: id, status: 'FAILED' },
                data: { status: 'VALID', errorMessage: null },
            }),
            this.prisma.sdProductImportBatch.update({
                where: { id },
                data: { status: 'PREVIEW' },
            }),
        ])
        return this.commit(id)
    }

    async commit(id: string) {
        const batch = await this.prisma.sdProductImportBatch.findUnique({
            where: { id },
            include: { rows: { orderBy: { rowNumber: 'asc' } } },
        })
        if (!batch) throw new NotFoundException('Import batch not found')
        if (batch.status === 'COMMITTED' || batch.status === 'CANCELLED') {
            return batch
        }
        if (batch.status === 'COMMITTING') {
            throw new ConflictException('This import is already running')
        }
        const claim = await this.prisma.sdProductImportBatch.updateMany({
            where: { id, status: 'PREVIEW' },
            data: { status: 'COMMITTING' },
        })
        if (claim.count === 0) {
            throw new ConflictException('This import is already running')
        }

        const ctx = {
            companyId: batch.companyId ?? '',
            divisionId: batch.divisionId ?? '',
            defaultMaterialTypeId: await this.defaultMaterialTypeId(),
            source: (batch.source ?? 'SD') as 'SD' | 'MM',
        }

        for (const row of batch.rows) {
            if (row.status === 'IMPORTED' || row.status === 'INVALID') continue
            try {
                const plan = await this.planRow(
                    row.payload as unknown as ImportRow,
                    ctx,
                )
                if (plan.errors.length || !plan.action) {
                    await this.markRow(
                        row.id,
                        'INVALID',
                        plan.errors.join('; ') || 'Row has no import action',
                        plan.errors,
                        plan.warnings,
                    )
                    continue
                }
                const result = await this.applyPlan(
                    plan,
                    batch.id,
                    row.rowNumber,
                    batch.createdBy,
                )
                await this.prisma.sdProductImportRow.update({
                    where: { id: row.id },
                    data: {
                        status: 'IMPORTED',
                        action: plan.action,
                        materialId: result.materialId,
                        productId: result.productId,
                        variantId: result.variantId,
                        errorMessage: null,
                        errors: {
                            errors: [],
                            warnings: plan.warnings,
                        } as Prisma.InputJsonValue,
                    },
                })
            } catch (error) {
                await this.markRow(
                    row.id,
                    'FAILED',
                    error instanceof Error ? error.message : 'Import failed',
                    [error instanceof Error ? error.message : 'Import failed'],
                    [],
                )
            }
        }

        await this.prisma.sdProductImportBatch.update({
            where: { id },
            data: { status: 'COMMITTED', committedAt: new Date() },
        })
        // Automatically post opening stock for rows that carry an Available
        // quantity. Failures here don't fail the import; they are reported on
        // the row so the user can post stock separately via the opening-stock
        // action.
        try {
            await this.postOpeningStock(id, {
                allowExisting: false,
                createdBy: batch.createdBy ?? undefined,
            })
        } catch {
            /* opening stock is best-effort during commit; rows stay IMPORTED */
        }
        await this.refreshCounts(id)
        return this.getBatch(id)
    }

    /**
     * Post opening stock for imported rows that carry a quantity. Separate
     * from commit by design: stock needs a company, warehouse and optional
     * bin, and must never overwrite an existing balance silently.
     */
    async postOpeningStock(
        id: string,
        args: { allowExisting?: boolean; createdBy?: string },
    ) {
        const batch = await this.prisma.sdProductImportBatch.findUnique({
            where: { id },
            include: { rows: true },
        })
        if (!batch) throw new NotFoundException('Import batch not found')
        if (batch.status !== 'COMMITTED') {
            throw new BadRequestException('Commit the import before posting opening stock')
        }
        if (!batch.companyId) {
            throw new BadRequestException('Import has no company scope')
        }

        const results: Array<{
            rowNumber: number
            materialId: string
            status: 'POSTED' | 'SKIPPED' | 'FAILED'
            message?: string
        }> = []

        for (const row of batch.rows) {
            if (row.status !== 'IMPORTED' || !row.materialId) continue
            const payload = row.payload as unknown as ImportRow
            const qty = parseNumber(payload.initialStock)
            if (!qty || Number.isNaN(qty) || qty <= 0) continue
            try {
                let warehouse = await this.resolveWarehouse(
                    payload.warehouse,
                    batch.companyId,
                )
                if (!warehouse) {
                    // No Warehouse column in the file: fall back to the
                    // company's first active warehouse so opening stock can
                    // still be posted.
                    warehouse = await this.prisma.warehouse.findFirst({
                        where: {
                            deletedAt: null,
                            companyId: batch.companyId,
                        },
                        select: { id: true, code: true },
                        orderBy: { code: 'asc' },
                    })
                }
                if (!warehouse) {
                    throw new Error(
                        'No warehouse found for the company. Add a Warehouse column or create a warehouse first.',
                    )
                }
                const bin = await this.resolveBin(
                    payload.storageLocation,
                    warehouse.id,
                )
                if (payload.storageLocation && !bin) {
                    throw new Error('Storage location not found in the warehouse')
                }
                const posted = await this.materials.postImportOpeningStock({
                    materialId: row.materialId,
                    quantity: qty,
                    companyId: batch.companyId,
                    warehouseId: warehouse.id,
                    storageBinId: bin?.id ?? null,
                    batchId: batch.id,
                    allowExisting: args.allowExisting,
                    createdBy: args.createdBy ?? batch.createdBy,
                })
                results.push({
                    rowNumber: row.rowNumber,
                    materialId: row.materialId,
                    status: 'POSTED',
                    message: posted.alreadyPosted
                        ? 'Already posted for this batch'
                        : 'Opening stock posted',
                })
            } catch (error) {
                results.push({
                    rowNumber: row.rowNumber,
                    materialId: row.materialId,
                    status: 'FAILED',
                    message:
                        error instanceof Error
                            ? error.message
                            : 'Opening stock failed',
                })
            }
        }
        return {
            batchId: batch.id,
            posted: results.filter((row) => row.status === 'POSTED').length,
            failed: results.filter((row) => row.status === 'FAILED').length,
            results,
        }
    }

    // ── internals ───────────────────────────────────────────────────────────

    private readWorkbook(buffer: Buffer): ImportRow[] {
        let book: XLSX.WorkBook
        try {
            book = XLSX.read(buffer, { type: 'buffer' })
        } catch {
            throw new BadRequestException('The uploaded file is not a readable workbook')
        }
        const sheet = book.Sheets[book.SheetNames[0]]
        if (!sheet) throw new BadRequestException('The workbook has no sheet')
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
            defval: '',
            raw: false,
        })
        if (!raw.length) return []

        const headerMap = new Map<keyof ImportRow, string>()
        for (const header of Object.keys(raw[0])) {
            const normalized = normalizeHeader(header)
            for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as Array<
                [keyof ImportRow, string[]]
            >) {
                if (aliases.includes(normalized) && !headerMap.has(field)) {
                    headerMap.set(field, header)
                }
            }
        }
        if (!headerMap.has('productName')) {
            throw new BadRequestException(
                'The file has no "Product Name" column. Download the template and keep the header row.',
            )
        }

        return raw
            .map((row) => {
                const mapped: ImportRow = {}
                for (const [field, header] of headerMap) {
                    ;(mapped as Record<string, string | undefined>)[field] =
                        text(row[header])
                }
                return mapped
            })
            .filter((row) => Object.values(row).some(Boolean))
    }

    private async defaultMaterialTypeId() {
        return defaultMaterialTypeId(this.prisma)
    }

    private async planRow(
        row: ImportRow,
        ctx: { companyId: string; divisionId: string; defaultMaterialTypeId: string | null; source: 'SD' | 'MM' },
    ): Promise<RowPlan> {
        const errors: string[] = []
        const warnings: string[] = []
        const result: RowPlan = {
            action: null,
            errors,
            warnings,
            payload: row,
            source: ctx.source,
        }

        const sku = row.materialSku?.trim()
        const barcode = row.barcode?.trim()
        if (barcode && !/^[A-Za-z0-9._-]{4,64}$/.test(barcode)) {
            errors.push(
                'Barcode must be 4-64 characters (letters, digits, dot, dash or underscore)',
            )
        }

        const skuMaterial = sku
            ? await this.prisma.mmMaterial.findFirst({
                  where: {
                      deletedAt: null,
                      OR: [
                          { sku: { equals: sku, mode: 'insensitive' } },
                          { materialCode: { equals: sku, mode: 'insensitive' } },
                      ],
                  },
                  select: {
                      id: true,
                      sku: true,
                      materialCode: true,
                      materialName: true,
                      companyId: true,
                      standardCost: true,
                      materialCategory: { select: { id: true, name: true } },
                      baseUom: { select: { id: true, code: true } },
                  },
              })
            : null

        const barcodeHit = barcode
            ? await this.prisma.mmBarcode.findFirst({
                  where: {
                      barcodeValue: barcode,
                      deletedAt: null,
                      status: 'ACTIVE',
                      ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
                  },
                  select: {
                      id: true,
                      materialId: true,
                      material: {
                          select: {
                              id: true,
                              sku: true,
                              materialCode: true,
                              materialName: true,
                              companyId: true,
                              deletedAt: true,
                              materialCategory: { select: { id: true, name: true } },
                          },
                      },
                  },
              })
            : null
        // A barcode whose material was soft-deleted is a stale leftover: it must
        // not match, otherwise the row is treated as "existing material" and no
        // material is created.
        const liveBarcodeHit =
            barcodeHit && !barcodeHit.material.deletedAt ? barcodeHit : null
        const sdVariantHit = barcode
            ? await this.prisma.sdProductVariant.findFirst({
                  where: { barcode },
                  select: {
                      id: true,
                      productId: true,
                      materialId: true,
                      product: { select: { name: true, sku: true } },
                      material: {
                          select: {
                              id: true,
                              sku: true,
                              materialCode: true,
                              materialName: true,
                              companyId: true,
                              deletedAt: true,
                              materialCategory: { select: { id: true, name: true } },
                          },
                      },
                  },
              })
            : null
        const liveSdVariantHit =
            sdVariantHit && !sdVariantHit.material?.deletedAt
                ? sdVariantHit
                : null

        if (liveBarcodeHit && liveSdVariantHit && liveBarcodeHit.materialId !== liveSdVariantHit.materialId) {
            errors.push(
                `Barcode ${barcode} is registered on two records: ${liveBarcodeHit.material.materialCode} and ${liveSdVariantHit.material?.materialCode ?? liveSdVariantHit.product.sku}`,
            )
        }
        if (liveSdVariantHit && !liveSdVariantHit.materialId) {
            errors.push(
                `Barcode ${barcode} is already used by SD product ${liveSdVariantHit.product.name} (${liveSdVariantHit.product.sku}) without a linked material`,
            )
        }

        const barcodeMaterial = liveBarcodeHit?.material ?? liveSdVariantHit?.material ?? null
        if (
            skuMaterial &&
            barcodeMaterial &&
            barcodeMaterial.id !== skuMaterial.id
        ) {
            errors.push(
                `SKU conflict: ${sku} is ${skuMaterial.materialCode}, but barcode ${barcode} belongs to ${barcodeMaterial.materialCode} (${barcodeMaterial.materialName}). Correct the file; records are not merged.`,
            )
        }
        if (
            !skuMaterial &&
            barcodeMaterial?.companyId &&
            barcodeMaterial.companyId !== ctx.companyId
        ) {
            errors.push(
                `Barcode ${barcode} belongs to another company (${barcodeMaterial.materialCode})`,
            )
        }

        const material = skuMaterial ?? barcodeMaterial
        if (skuMaterial?.companyId && skuMaterial.companyId !== ctx.companyId) {
            errors.push('Material SKU belongs to another company')
        }

        let listing = material
            ? await this.prisma.sdProductVariant.findFirst({
                  where: { materialId: material.id },
                  select: {
                      id: true,
                      productId: true,
                      barcode: true,
                      product: {
                          select: {
                              id: true,
                              name: true,
                              description: true,
                              price: true,
                              isActive: true,
                              status: true,
                          },
                      },
                  },
              })
            : null
        if (material && liveSdVariantHit?.materialId === material.id) {
            listing =
                listing ??
                (await this.prisma.sdProductVariant.findUnique({
                    where: { id: liveSdVariantHit.id },
                    select: {
                        id: true,
                        productId: true,
                        barcode: true,
                        product: {
                            select: {
                                id: true,
                                name: true,
                                description: true,
                                price: true,
                                isActive: true,
                                status: true,
                            },
                        },
                    },
                }))
        }

        const srp = parseNumber(row.srp)
        if (srp !== null && Number.isNaN(srp)) errors.push('SRP must be a number')
        const unitCost = parseNumber(row.unitCost)
        if (unitCost !== null && Number.isNaN(unitCost)) errors.push('Unit Cost must be a number')
        const initialStock = parseNumber(row.initialStock)
        if (Number.isNaN(initialStock) || (initialStock ?? 0) < 0) {
            errors.push('Initial Stock Quantity must be zero or a positive number')
        }
        const reorderLevel = parseNumber(row.reorderLevel)
        if (Number.isNaN(reorderLevel) || (reorderLevel ?? 0) < 0) {
            errors.push('Reorder Level must be zero or a positive number')
        }
        const availability = parseBool(row.salesAvailability)
        if (row.salesAvailability && availability === null) {
            errors.push('Sales Availability must be TRUE or FALSE')
        }

        let warehouse = await this.resolveWarehouse(row.warehouse, ctx.companyId)
        if (!warehouse && row.warehouse) {
            errors.push(`Warehouse "${row.warehouse}" was not found in this company`)
        }
        if (!warehouse && (initialStock ?? 0) > 0) {
            // No Warehouse column: fall back to the company's first active
            // warehouse so opening stock can still be posted.
            warehouse = await this.prisma.warehouse.findFirst({
                where: {
                    deletedAt: null,
                    companyId: ctx.companyId,
                },
                select: { id: true, code: true },
                orderBy: { code: 'asc' },
            })
        }
        if ((initialStock ?? 0) > 0 && !warehouse) {
            errors.push('Warehouse is required when Initial Stock Quantity is greater than zero')
        }
        if (warehouse && row.storageLocation) {
            const bin = await this.resolveBin(row.storageLocation, warehouse.id)
            if (!bin) {
                errors.push(
                    `Storage location "${row.storageLocation}" was not found in ${warehouse.code}`,
                )
            }
        }

        if (!material) {
            if (!row.productName) errors.push('Product Name is required')
            const category = await this.resolveCategory(row.category)
            if (!category) errors.push(`Category "${row.category ?? ''}" was not found`)
            const uom = await this.resolveUom(row.uom)
            if (!uom) errors.push(`Unit of Measure "${row.uom ?? ''}" was not found`)
            if (!ctx.defaultMaterialTypeId) {
                errors.push('No active Material Type is configured')
            }
            if (srp !== null && srp <= 0) errors.push('SRP must be greater than zero')
            if ((initialStock ?? 0) > 0) {
                warnings.push(
                    'Opening stock is validated here but posted only by the separate opening-stock action',
                )
            }
            result.action = errors.length ? null : 'CREATE_MATERIAL'
            result.categoryName = category?.name
            result.price = srp ?? 0
            result.qty = initialStock ?? 0
            return result
        }

        result.materialId = material.id
        if (listing) {
            result.action = errors.length ? null : 'UPDATE'
            result.productId = listing.productId
            result.variantId = listing.id
            result.price = srp ?? undefined
            if ((initialStock ?? 0) > 0) {
                warnings.push(
                    'Material already exists: imported quantity is not added automatically. Post it as an explicit stock receipt.',
                )
            }
            return result
        }

        if (!row.productName) errors.push('Product Name is required for a new listing')
        if (srp !== null && srp <= 0) errors.push('SRP must be greater than zero')
        result.action = errors.length ? null : 'ADD_LISTING'
        result.price = srp ?? 0
        result.categoryName = material.materialCategory?.name
        result.qty = initialStock ?? 0
        return result
    }

    private async applyPlan(
        plan: RowPlan,
        batchId: string,
        rowNumber: number,
        createdBy: string | null,
    ): Promise<{ materialId?: string; productId?: string; variantId?: string }> {
        if (plan.action === 'UPDATE' && plan.productId) {
            // When importing from MM entry point, do not update SD listing
            if (plan.source === 'MM') {
                return {
                    materialId: plan.materialId,
                    productId: plan.productId,
                    variantId: plan.variantId,
                }
            }
            const data: Prisma.SdProductUpdateInput = {}
            if (plan.price !== undefined) data.price = new Prisma.Decimal(plan.price)
            if (plan.payload.salesDescription !== undefined) {
                data.description = plan.payload.salesDescription
            }
            if (plan.payload.salesAvailability !== undefined) {
                const active = parseBool(plan.payload.salesAvailability)
                if (active !== null) {
                    data.isActive = active
                    data.status = active ? 'ACTIVE' : 'INACTIVE'
                }
            }
            await this.prisma.sdProduct.update({
                where: { id: plan.productId },
                data,
            })
            if (plan.variantId && plan.price !== undefined) {
                await this.prisma.sdProductVariant.update({
                    where: { id: plan.variantId },
                    data: { price: new Prisma.Decimal(plan.price) },
                })
            }
            return {
                materialId: plan.materialId,
                productId: plan.productId,
                variantId: plan.variantId,
            }
        }

        let materialId = plan.materialId
        if (plan.action === 'CREATE_MATERIAL') {
            const payload = plan.payload
            const category = await this.resolveCategory(payload.category)
            const uom = await this.resolveUom(payload.uom)
            const typeId = await this.defaultMaterialTypeId()
            if (!category || !uom || !typeId) {
                throw new BadRequestException(
                    'Category, Unit of Measure and Material Type are required to create a material',
                )
            }
            const warehouse = await this.resolveWarehouse(
                payload.warehouse,
                await this.companyOfBatch(batchId),
            )
            const material = await this.materials.createWithClient(
                {
                    materialName: payload.productName!,
                    sku: payload.materialSku,
                    brand: payload.brand,
                    description: payload.salesDescription,
                    baseUomId: uom.id,
                    salesUomId: uom.id,
                    materialCategoryId: category.id,
                    materialTypeId: typeId,
                    status: 'ACTIVE',
                    sellable: true,
                    inventoryManaged: true,
                    standardCost:
                        parseNumber(payload.unitCost) &&
                        !Number.isNaN(parseNumber(payload.unitCost))
                            ? (parseNumber(payload.unitCost) as number)
                            : 0,
                    reorderPoint:
                        parseNumber(payload.reorderLevel) &&
                        !Number.isNaN(parseNumber(payload.reorderLevel))
                            ? (parseNumber(payload.reorderLevel) as number)
                            : 0,
                    companyId: await this.companyOfBatch(batchId),
                    defaultWarehouseId: warehouse?.id ?? null,
                    createdBy: createdBy ?? undefined,
                } as any,
                this.prisma,
            )
            materialId = material.id
        }

        if (!materialId) throw new BadRequestException('No material to link')

        const payload = plan.payload
        if (payload.barcode) {
            const existing = await this.prisma.mmBarcode.findFirst({
                where: { barcodeValue: payload.barcode, deletedAt: null },
                select: {
                    id: true,
                    materialId: true,
                    material: {
                        select: {
                            materialCode: true,
                            materialName: true,
                            deletedAt: true,
                        },
                    },
                },
            })
            if (existing && existing.materialId !== materialId) {
                // A barcode left over from a soft-deleted material is stale:
                // reassign it to the new material instead of failing.
                if (existing.material.deletedAt) {
                    await this.prisma.mmBarcode.update({
                        where: { id: existing.id },
                        data: {
                            materialId,
                            entityType: 'MATERIAL',
                            entityId: materialId,
                            barcodeType: barcodeType(payload.barcode),
                            isPrimary: true,
                            status: 'ACTIVE',
                        },
                    })
                } else {
                    throw new ConflictException(
                        `Barcode ${payload.barcode} belongs to ${existing.material.materialCode} (${existing.material.materialName})`,
                    )
                }
            }
            if (!existing) {
                const material = await this.prisma.mmMaterial.findUniqueOrThrow({
                    where: { id: materialId },
                    select: { companyId: true },
                })
                await this.prisma.mmBarcode.create({
                    data: {
                        companyId: material.companyId,
                        materialId,
                        entityType: 'MATERIAL',
                        entityId: materialId,
                        barcodeType: barcodeType(payload.barcode),
                        barcodeValue: payload.barcode,
                        isPrimary: true,
                        status: 'ACTIVE',
                    },
                })
            }
        }

        const companyId = await this.companyOfBatch(batchId)
        // When importing from MM entry point, do not create an SD listing
        if (plan.source !== 'MM') {
            const product = await this.productFamily.createProductFamily({
                divisionId: (await this.batchDivision(batchId)) || 'DIV_RETAIL',
                name: payload.productName!,
                description: payload.salesDescription,
                brand: payload.brand,
                category: plan.categoryName,
                price: plan.price ?? 0,
                productConfig: 'SIMPLE',
                idempotencyKey: `import:${batchId}:${rowNumber}`,
                materialDefaults: {
                    companyId,
                    materialCategoryId: undefined,
                },
                existingMaterialId: materialId,
            } as any)

            const variant = await this.prisma.sdProductVariant.findFirst({
                where: { productId: product.id },
                select: { id: true },
            })
            if (variant && payload.barcode) {
                await this.prisma.sdProductVariant.update({
                    where: { id: variant.id },
                    data: { barcode: payload.barcode },
                })
            }
            return {
                materialId,
                productId: product.id,
                variantId: variant?.id,
            }
        }
        return { materialId }
    }

    private async markRow(
        id: string,
        status: string,
        message: string,
        errors: string[],
        warnings: string[],
    ) {
        await this.prisma.sdProductImportRow.update({
            where: { id },
            data: {
                status,
                errorMessage: message,
                errors: { errors, warnings } as Prisma.InputJsonValue,
            },
        })
    }

    private async refreshCounts(batchId: string) {
        const rows = await this.prisma.sdProductImportRow.findMany({
            where: { batchId },
            select: { status: true, action: true, errors: true },
        })
        const invalid = rows.filter((row) => row.status === 'INVALID').length
        const planned = rows.filter((row) => row.action)
        const duplicateBarcodeRows = rows.filter(
            (row) =>
                row.status === 'INVALID' &&
                JSON.stringify(row.errors ?? '')
                    .toLowerCase()
                    .includes('barcode'),
        ).length
        await this.prisma.sdProductImportBatch.update({
            where: { id: batchId },
            data: {
                totalRows: rows.length,
                validRows: rows.length - invalid,
                invalidRows: invalid,
                createdMaterialRows: planned.filter(
                    (row) => row.action === 'CREATE_MATERIAL',
                ).length,
                createdListingRows: planned.filter(
                    (row) => row.action === 'ADD_LISTING',
                ).length,
                updatedRows: planned.filter((row) => row.action === 'UPDATE')
                    .length,
                duplicateBarcodeRows,
            },
        })
    }

    private async companyOfBatch(batchId: string) {
        const batch = await this.prisma.sdProductImportBatch.findUniqueOrThrow({
            where: { id: batchId },
            select: { companyId: true },
        })
        return batch.companyId ?? ''
    }

    private async batchDivision(batchId: string) {
        const batch = await this.prisma.sdProductImportBatch.findUniqueOrThrow({
            where: { id: batchId },
            select: { divisionId: true },
        })
        return batch.divisionId
    }

    private async resolveCategory(value: string | undefined) {
        return resolveMaterialCategory(this.prisma, value)
    }

    private async resolveUom(value: string | undefined) {
        return resolveMaterialUom(this.prisma, value)
    }

    private async resolveWarehouse(value: string | undefined, companyId: string) {
        return resolveImportWarehouse(this.prisma, value, companyId)
    }

    private async resolveBin(value: string | undefined, warehouseId: string) {
        return resolveImportBin(this.prisma, value, warehouseId)
    }
}
