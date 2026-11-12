import {
    BadRequestException,
    ConflictException,
    Injectable,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { BarcodeResolveService } from '../mm/scanner/barcode-resolve.service'
import { MaterialsService } from '../mm/materials/materials.service'
import { CommercialAvailabilityService } from './commercial-availability.service'
import { ProductFamilyService } from './product-family.service'
import {
    defaultMaterialTypeId,
    resolveImportBin,
    resolveImportWarehouse,
    resolveMaterialCategory,
    resolveMaterialUom,
} from './material-import-lookups'

const MATERIAL_SELECT = {
    id: true,
    materialCode: true,
    sku: true,
    materialName: true,
    description: true,
    brand: true,
    status: true,
    sellable: true,
    standardCost: true,
    companyId: true,
    materialCategory: { select: { id: true, name: true } },
    baseUom: { select: { id: true, code: true } },
} as const

export type QuickAddInput = {
    barcode: string
    productName?: string
    categoryId?: string
    category?: string
    brand?: string
    uomId?: string
    uom?: string
    unitCost?: number
    srp?: number
    companyId: string
    divisionId?: string
    warehouseId?: string
    storageBinId?: string
    initialStock?: number
    allowExisting?: boolean
    createdBy?: string
}

/**
 * One barcode entry point for Material Master, the Product Catalog and POS.
 *
 * Lookup never writes. Quick-add creates the MM material and its barcode in
 * one transaction, then the SD listing that references that material. A retry
 * finds the existing barcode/material and only creates the missing listing.
 */
@Injectable()
export class ProductBarcodeService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly barcodeResolver: BarcodeResolveService,
        private readonly materials: MaterialsService,
        private readonly productFamily: ProductFamilyService,
        private readonly availability: CommercialAvailabilityService,
    ) {}

    async lookup(barcode: string, companyId?: string) {
        const value = barcode?.trim()
        if (!value) throw new BadRequestException('Barcode is required')

        let materialId: string | null = null
        let source: 'MM' | 'SD' = 'MM'
        try {
            const hit = await this.barcodeResolver.resolve(value, companyId)
            materialId = hit.materialId ?? null
        } catch {
            const variant = await this.prisma.sdProductVariant.findFirst({
                where: { barcode: value },
                select: { materialId: true },
            })
            if (variant?.materialId) {
                materialId = variant.materialId
                source = 'SD'
            }
        }
        if (!materialId) {
            return {
                found: false,
                barcode: value,
                message: 'Barcode not found. Register a new material to continue.',
            }
        }

        const material = await this.prisma.mmMaterial.findFirst({
            where: { id: materialId, deletedAt: null },
            select: MATERIAL_SELECT,
        })
        if (!material) {
            return {
                found: false,
                barcode: value,
                message: 'Barcode points to a material that no longer exists.',
            }
        }

        const variant = await this.findListing(material.id)
        const ledger = await this.ledgerFor(
            material.id,
            companyId ?? material.companyId ?? undefined,
        )
        return {
            found: true,
            barcode: value,
            source,
            material: {
                id: material.id,
                materialCode: material.materialCode,
                sku: material.sku,
                name: material.materialName,
                description: material.description,
                brand: material.brand,
                category: material.materialCategory?.name ?? null,
                uom: material.baseUom?.code ?? null,
                unitCost: Number(material.standardCost ?? 0),
                status: material.status,
                sellable: material.sellable,
                companyId: material.companyId,
            },
            listing: variant
                ? {
                      productId: variant.product.id,
                      productName: variant.product.name,
                      productSku: variant.product.sku,
                      status: variant.product.status,
                      isActive: variant.product.isActive,
                      price: Number(variant.price ?? variant.product.price),
                      variantId: variant.id,
                      variantName: variant.variantName,
                      variantSku: variant.sku,
                  }
                : null,
            availability: ledger,
            action: variant
                ? 'OPEN_IN_CATALOG'
                : 'MATERIAL_FOUND_NOT_LISTED',
        }
    }

    async quickAdd(input: QuickAddInput) {
        const barcode = input.barcode?.trim()
        if (!barcode) throw new BadRequestException('Barcode is required')
        if (!/^[A-Za-z0-9._-]{4,64}$/.test(barcode)) {
            throw new BadRequestException(
                'Barcode must be 4-64 characters (letters, digits, dot, dash or underscore)',
            )
        }
        if (!input.companyId) throw new BadRequestException('Company is required')
        const company = await this.prisma.company.findUnique({
            where: { id: input.companyId },
            select: { id: true },
        })
        if (!company) throw new BadRequestException('Company not found')

        const existingBarcode = await this.prisma.mmBarcode.findFirst({
            where: {
                barcodeValue: barcode,
                deletedAt: null,
                status: 'ACTIVE',
                companyId: input.companyId,
            },
            select: { materialId: true },
        })
        const existingVariant = await this.prisma.sdProductVariant.findFirst({
            where: { barcode },
            select: { materialId: true },
        })
        const existingMaterialId =
            existingBarcode?.materialId ?? existingVariant?.materialId ?? null

        if (existingMaterialId) {
            const material = await this.prisma.mmMaterial.findFirst({
                where: { id: existingMaterialId, deletedAt: null },
                select: { id: true, materialName: true },
            })
            if (!material) {
                throw new ConflictException(
                    'The barcode is registered to a material that no longer exists',
                )
            }
            const listing = await this.findListing(material.id)
            if (!listing) {
                const srp = input.srp
                if (srp === undefined || srp < 0) {
                    throw new BadRequestException(
                        'SRP is required to add this existing material to the Product Catalog',
                    )
                }
                await this.createListing(material.id, input, srp, barcode)
            }
            const stockWarning = await this.postStockIfRequested(
                material.id,
                input,
            )
            return {
                createdMaterial: false,
                createdListing: !listing,
                stockWarning,
                ...(await this.lookup(barcode, input.companyId)),
            }
        }

        if (!input.productName?.trim()) {
            throw new BadRequestException('Material name is required')
        }
        if (input.srp === undefined || input.srp < 0) {
            throw new BadRequestException('SRP is required')
        }
        const category = input.categoryId
            ? await this.prisma.mmMaterialCategory.findFirst({
                  where: {
                      id: input.categoryId,
                      deletedAt: null,
                      isActive: true,
                  },
                  select: { id: true, name: true },
              })
            : await resolveMaterialCategory(this.prisma, input.category)
        if (!category) throw new BadRequestException('Material category not found')
        const uom = input.uomId
            ? await this.prisma.mmUom.findFirst({
                  where: { id: input.uomId, deletedAt: null, isActive: true },
                  select: { id: true, code: true },
              })
            : await resolveMaterialUom(this.prisma, input.uom)
        if (!uom) throw new BadRequestException('Unit of Measure not found')
        const typeId = await defaultMaterialTypeId(this.prisma)
        if (!typeId) throw new BadRequestException('No active Material Type')

        const warehouse = input.warehouseId
            ? await this.prisma.warehouse.findFirst({
                  where: {
                      id: input.warehouseId,
                      companyId: input.companyId,
                      deletedAt: null,
                  },
                  select: { id: true, code: true },
              })
            : null
        if (input.warehouseId && !warehouse) {
            throw new BadRequestException(
                'Warehouse does not belong to the selected company',
            )
        }
        const bin = warehouse
            ? await resolveImportBin(
                  this.prisma,
                  input.storageBinId,
                  warehouse.id,
              )
            : null
        if (input.storageBinId && !bin) {
            throw new BadRequestException(
                'Storage location was not found in the selected warehouse',
            )
        }

        const material = await this.prisma.$transaction(async (tx) => {
            const created = await this.materials.createWithClient(
                {
                    materialName: input.productName!,
                    brand: input.brand,
                    materialTypeId: typeId,
                    materialCategoryId: category.id,
                    baseUomId: uom.id,
                    salesUomId: uom.id,
                    status: 'ACTIVE',
                    sellable: true,
                    inventoryManaged: true,
                    standardCost: input.unitCost ?? 0,
                    companyId: input.companyId,
                    defaultWarehouseId: warehouse?.id ?? null,
                    createdBy: input.createdBy,
                } as any,
                tx,
            )
            await tx.mmBarcode.create({
                data: {
                    companyId: input.companyId,
                    materialId: created.id,
                    entityType: 'MATERIAL',
                    entityId: created.id,
                    barcodeType: /^\d{13}$/.test(barcode) ? 'EAN13' : 'CODE128',
                    barcodeValue: barcode,
                    isPrimary: true,
                    status: 'ACTIVE',
                },
            })
            return created
        })

        await this.createListing(material.id, input, input.srp, barcode)
        const stockWarning = await this.postStockIfRequested(material.id, input)
        return {
            createdMaterial: true,
            createdListing: true,
            stockWarning,
            ...(await this.lookup(barcode, input.companyId)),
        }
    }

    private findListing(materialId: string) {
        return this.prisma.sdProductVariant.findFirst({
            where: { materialId },
            select: {
                id: true,
                sku: true,
                variantName: true,
                price: true,
                product: {
                    select: {
                        id: true,
                        name: true,
                        sku: true,
                        price: true,
                        isActive: true,
                        status: true,
                    },
                },
            },
        })
    }

    private async createListing(
        materialId: string,
        input: QuickAddInput,
        price: number,
        barcode?: string,
    ) {
        const material = await this.prisma.mmMaterial.findUniqueOrThrow({
            where: { id: materialId },
            select: {
                id: true,
                materialName: true,
                materialCategory: { select: { name: true } },
            },
        })
        await this.productFamily.createProductFamily({
            divisionId: input.divisionId || 'DIV_RETAIL',
            name: input.productName?.trim() || material.materialName,
            brand: input.brand,
            category: material.materialCategory?.name,
            price,
            productConfig: 'SIMPLE',
            idempotencyKey: `quick-add:${material.id}`,
            materialDefaults: {
                companyId: input.companyId,
                materialCategoryId: undefined,
            },
            existingMaterialId: material.id,
        })
        if (barcode) {
            const variant = await this.prisma.sdProductVariant.findFirst({
                where: { materialId: material.id },
                select: { id: true, barcode: true },
            })
            if (variant && variant.barcode !== barcode) {
                await this.prisma.sdProductVariant.update({
                    where: { id: variant.id },
                    data: { barcode },
                })
            }
        }
    }

    private async postStockIfRequested(
        materialId: string,
        input: QuickAddInput,
    ): Promise<string | null> {
        const qty = Number(input.initialStock ?? 0)
        if (!(qty > 0)) return null
        if (!input.warehouseId) {
            return 'Opening stock was not posted: warehouse is required'
        }
        try {
            await this.materials.postImportOpeningStock({
                materialId,
                quantity: qty,
                companyId: input.companyId,
                warehouseId: input.warehouseId,
                storageBinId: input.storageBinId ?? null,
                batchId: `quick-add:${materialId}`,
                allowExisting: input.allowExisting,
                createdBy: input.createdBy ?? 'barcode-quick-add',
            })
            return null
        } catch (error) {
            return error instanceof Error
                ? error.message
                : 'Opening stock was not posted'
        }
    }

    private async ledgerFor(materialId: string, companyId?: string) {
        if (!companyId) return null
        try {
            return await this.availability.getCompanyMaterialLedger(
                materialId,
                companyId,
            )
        } catch {
            return null
        }
    }
}
