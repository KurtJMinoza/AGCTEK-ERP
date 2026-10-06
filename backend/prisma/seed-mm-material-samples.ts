import type { PrismaClient } from '@prisma/client'
import { seedMmOrgAndWarehouseStructure } from './seed-mm-org-warehouse-structure'

type SampleMaterial = {
    materialCode: string
    materialName: string
    sku: string
    description: string
    typeCode: string
    categoryCode: string
    uomCode: string
    barcodeType: string
    barcodeValue: string
    standardCost: number
    /** Suggested retail / selling reference (stored in shortDescription for UI) */
    sellingReference: number
    batchManaged: boolean
    serialManaged: boolean
    expiryManaged: boolean
}

/** Alternate units → material base UOM (1 SKU = 1 base unit unless noted). */
const MATERIAL_ALTERNATE_UOM: Record<string, { from: string; factor: number }[]> = {
    'SKU-LUBE-1L': [
        { from: 'PCS', factor: 1 },
        { from: 'BTL', factor: 1 },
        { from: 'EA', factor: 1 },
    ],
}

async function upsertMaterialUomConversions(
    prisma: PrismaClient,
    materialId: string,
    baseUomId: string,
    materialCode: string,
) {
    const alts = MATERIAL_ALTERNATE_UOM[materialCode]
    if (!alts?.length) return

    const uomByCode = Object.fromEntries(
        (await prisma.mmUom.findMany({ where: { deletedAt: null } })).map((u) => [u.code, u]),
    )

    for (const alt of alts) {
        const fromUom = uomByCode[alt.from]
        if (!fromUom || fromUom.id === baseUomId) continue

        const existing = await prisma.mmUomConversion.findFirst({
            where: {
                fromUomId: fromUom.id,
                toUomId: baseUomId,
                materialId,
            },
        })
        if (existing) {
            await prisma.mmUomConversion.update({
                where: { id: existing.id },
                data: { factor: alt.factor, deletedAt: null },
            })
        } else {
            await prisma.mmUomConversion.create({
                data: {
                    fromUomId: fromUom.id,
                    toUomId: baseUomId,
                    factor: alt.factor,
                    materialId,
                },
            })
        }
    }
}

const SAMPLES: SampleMaterial[] = [
    {
        materialCode: 'SKU-HELMET-001',
        materialName: 'AGCTEK Safety Helmet (White)',
        sku: 'RET-HELMET-WHT',
        description: 'ANSI-rated hard hat for warehouse and plant floor.',
        typeCode: 'MERCHANDISE',
        categoryCode: 'CON_SAFETY',
        uomCode: 'PCS',
        barcodeType: 'EAN13',
        barcodeValue: '4800123456789',
        standardCost: 450,
        sellingReference: 699,
        batchManaged: false,
        serialManaged: true,
        expiryManaged: false,
    },
    {
        materialCode: 'SKU-LUBE-1L',
        materialName: 'AGCTEK Machine Lubricant 1L',
        sku: 'RET-LUBE-1L',
        description: 'General-purpose industrial lubricant; batch tracked for expiry.',
        typeCode: 'CONSUMABLE',
        categoryCode: 'CON_CHEMICALS',
        uomCode: 'L',
        barcodeType: 'EAN13',
        barcodeValue: '4800987654321',
        standardCost: 185.5,
        sellingReference: 299,
        batchManaged: true,
        serialManaged: false,
        expiryManaged: true,
    },
]

async function ensureMaterialType(
    prisma: PrismaClient,
    code: string,
    name: string,
    sortOrder: number,
) {
    return prisma.mmMaterialType.upsert({
        where: { code },
        update: { name, deletedAt: null },
        create: { code, name, sortOrder },
    })
}

async function ensureCategory(
    prisma: PrismaClient,
    code: string,
    name: string,
    sortOrder: number,
    parentCode?: string,
) {
    let parentId: string | undefined
    if (parentCode) {
        const parent = await prisma.mmMaterialCategory.findUnique({
            where: { code: parentCode },
        })
        parentId = parent?.id
    }
    return prisma.mmMaterialCategory.upsert({
        where: { code },
        update: { name, sortOrder, parentId: parentId ?? null, deletedAt: null },
        create: { code, name, sortOrder, parentId: parentId ?? null },
    })
}

/**
 * Registers two sample materials (MM master): code, name, UOM, barcode, cost,
 * selling reference, and tracking (serial vs batch).
 */
export async function seedMmMaterialSamples(prisma: PrismaClient) {
    console.log('Seeding sample materials (product master) …')

    let company = await prisma.company.findFirst({ where: { code: 'AGCTEK' } })
    let warehouse = await prisma.warehouse.findFirst({ where: { code: 'MAIN' } })
    if (!company || !warehouse) {
        const org = await seedMmOrgAndWarehouseStructure(prisma)
        company = await prisma.company.findUnique({ where: { id: org.company.id } })
        warehouse = await prisma.warehouse.findUnique({
            where: { id: org.mainWarehouse.id },
        })
    }
    if (!company || !warehouse) {
        throw new Error('Company AGCTEK and warehouse MAIN are required')
    }

    await ensureMaterialType(prisma, 'MERCHANDISE', 'Merchandise', 7)
    await ensureMaterialType(prisma, 'CONSUMABLE', 'Consumable', 3)
    await ensureCategory(prisma, 'CONSUMABLES', 'Consumables', 6)
    await ensureCategory(prisma, 'CON_SAFETY', 'Safety Gear', 7, 'CONSUMABLES')
    await ensureCategory(prisma, 'CON_CHEMICALS', 'Chemicals', 8, 'CONSUMABLES')

    const currency = await prisma.mmCurrency.upsert({
        where: { code: 'PHP' },
        update: {},
        create: { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
    })

    const valuationClass = await prisma.mmValuationClass.upsert({
        where: { code: 'MOVING_AVERAGE' },
        update: {},
        create: { code: 'MOVING_AVERAGE', name: 'Moving Average' },
    })

    for (const sample of SAMPLES) {
        const materialType = await prisma.mmMaterialType.findUnique({
            where: { code: sample.typeCode },
        })
        const materialCategory = await prisma.mmMaterialCategory.findUnique({
            where: { code: sample.categoryCode },
        })
        const baseUom = await prisma.mmUom.findFirst({
            where: { code: sample.uomCode, deletedAt: null },
        })
        if (!materialType || !materialCategory || !baseUom) {
            throw new Error(
                `Missing reference for ${sample.materialCode}: type, category, or UOM ${sample.uomCode}`,
            )
        }

        const trackingLabel = sample.serialManaged
            ? 'Serial'
            : sample.batchManaged
              ? 'Batch'
              : 'None'

        const material = await prisma.mmMaterial.upsert({
            where: { materialCode: sample.materialCode },
            update: {
                materialName: sample.materialName,
                sku: sample.sku,
                description: sample.description,
                shortDescription: `SRP ₱${sample.sellingReference.toLocaleString('en-PH')} · Tracking: ${trackingLabel}`,
                status: 'ACTIVE',
                standardCost: sample.standardCost,
                batchManaged: sample.batchManaged,
                serialManaged: sample.serialManaged,
                expiryManaged: sample.expiryManaged,
                defaultShelfLifeDays: sample.expiryManaged ? 365 : null,
                sellable: true,
                purchasable: true,
                inventoryManaged: true,
                companyId: company.id,
                defaultWarehouseId: warehouse.id,
                currencyId: currency.id,
                valuationClassId: valuationClass.id,
                valuationMethod: 'MOVING_AVERAGE',
                deletedAt: null,
            },
            create: {
                materialCode: sample.materialCode,
                materialName: sample.materialName,
                sku: sample.sku,
                description: sample.description,
                shortDescription: `SRP ₱${sample.sellingReference.toLocaleString('en-PH')} · Tracking: ${trackingLabel}`,
                materialTypeId: materialType.id,
                materialCategoryId: materialCategory.id,
                baseUomId: baseUom.id,
                salesUomId: baseUom.id,
                purchaseUomId: baseUom.id,
                status: 'ACTIVE',
                standardCost: sample.standardCost,
                batchManaged: sample.batchManaged,
                serialManaged: sample.serialManaged,
                expiryManaged: sample.expiryManaged,
                defaultShelfLifeDays: sample.expiryManaged ? 365 : null,
                sellable: true,
                purchasable: true,
                inventoryManaged: true,
                companyId: company.id,
                defaultWarehouseId: warehouse.id,
                currencyId: currency.id,
                valuationClassId: valuationClass.id,
                valuationMethod: 'MOVING_AVERAGE',
            },
        })

        const existingBarcode = await prisma.mmBarcode.findFirst({
            where: { materialId: material.id, barcodeValue: sample.barcodeValue },
        })
        if (!existingBarcode) {
            await prisma.mmBarcode.updateMany({
                where: { materialId: material.id, isPrimary: true },
                data: { isPrimary: false },
            })
            await prisma.mmBarcode.create({
                data: {
                    materialId: material.id,
                    barcodeType: sample.barcodeType,
                    barcodeValue: sample.barcodeValue,
                    isPrimary: true,
                },
            })
        }

        await prisma.mmMaterialValuation.upsert({
            where: {
                companyId_materialId_warehouseId: {
                    companyId: company.id,
                    materialId: material.id,
                    warehouseId: warehouse.id,
                },
            },
            update: {
                standardCost: sample.standardCost,
                movingAverageCost: sample.standardCost,
                valuationMethod: 'MOVING_AVERAGE',
                currencyId: currency.id,
                isActive: true,
                name: 'MAIN valuation',
            },
            create: {
                companyId: company.id,
                materialId: material.id,
                warehouseId: warehouse.id,
                currencyId: currency.id,
                valuationMethod: 'MOVING_AVERAGE',
                standardCost: sample.standardCost,
                movingAverageCost: sample.standardCost,
                name: 'MAIN valuation',
                isActive: true,
            },
        })

        await upsertMaterialUomConversions(
            prisma,
            material.id,
            material.baseUomId,
            sample.materialCode,
        )

        console.log(
            `  ${material.materialCode} — ${material.materialName} (${trackingLabel}, cost ₱${sample.standardCost}, SRP ₱${sample.sellingReference})`,
        )
    }

    console.log(`Seeded ${SAMPLES.length} material(s).`)
}
