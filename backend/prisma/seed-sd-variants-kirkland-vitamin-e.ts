/**
 * Seed Size variants (Small / Medium / Large) for the Best Seller product
 * RET-PRD-000002 — KIRKLAND Vitamin E Soft Gels.
 *
 * - Converts the product to VARIABLE with a "Size" option.
 * - Small (default) reuses the product's existing MM material and stock.
 * - Medium / Large get their own MM materials (zero stock; receive via MM).
 * - Each variant material gets an ACTIVE SD product–material assignment.
 * - Each variant gets its own photo; the image files must exist in
 *   public/uploads/products (kirkland-vitamin-e-{small,medium,large}.jpg).
 *
 * Idempotent: re-running updates prices and links instead of duplicating rows.
 *
 * Run: npm run prisma:seed-kirkland-variants
 */
import { Prisma, PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DIVISION_ID = 'DIV_RETAIL'
const PRODUCT_SKU = 'RET-PRD-000002'
const OPTION_NAME = 'Size'

type VariantSeed = {
    value: string
    sku: string
    price: number
    compareAtPrice: number
    /** Served by Next.js from public/uploads/products. */
    imageUrl: string
    /** true → reuse the product's current material (existing stock). */
    reuseExistingMaterial: boolean
}

const VARIANTS: VariantSeed[] = [
    { value: 'Small', sku: `${PRODUCT_SKU}-V01`, price: 90, compareAtPrice: 100, imageUrl: '/uploads/products/kirkland-vitamin-e-small.jpg', reuseExistingMaterial: true },
    { value: 'Medium', sku: `${PRODUCT_SKU}-V02`, price: 150, compareAtPrice: 165, imageUrl: '/uploads/products/kirkland-vitamin-e-medium.jpg', reuseExistingMaterial: false },
    { value: 'Large', sku: `${PRODUCT_SKU}-V03`, price: 220, compareAtPrice: 242, imageUrl: '/uploads/products/kirkland-vitamin-e-large.jpg', reuseExistingMaterial: false },
]

const combinationKey = (value: string) =>
    `${OPTION_NAME.toLowerCase().trim()}:${value.toLowerCase().trim()}`

async function nextMaterialCode(tx: Prisma.TransactionClient): Promise<string> {
    const rows = await tx.mmMaterial.findMany({
        where: { materialCode: { startsWith: 'MAT-' } },
        select: { materialCode: true },
    })
    const max = rows.reduce((acc, { materialCode }) => {
        const suffix = materialCode.slice('MAT-'.length)
        return /^\d+$/.test(suffix) ? Math.max(acc, Number(suffix)) : acc
    }, 0)
    return `MAT-${String(max + 1).padStart(6, '0')}`
}

async function main() {
    const product = await prisma.sdProduct.findUnique({
        where: { divisionId_sku: { divisionId: DIVISION_ID, sku: PRODUCT_SKU } },
        include: {
            materialAssignments: {
                where: { status: 'ACTIVE' },
                orderBy: { effectiveFrom: 'asc' },
            },
        },
    })
    if (!product) {
        throw new Error(`Product ${DIVISION_ID}/${PRODUCT_SKU} not found`)
    }

    const existingSmall = await prisma.sdProductVariant.findUnique({
        where: { productId_combinationKey: { productId: product.id, combinationKey: combinationKey('Small') } },
        select: { materialId: true },
    })
    const templateMaterialId =
        existingSmall?.materialId ?? product.materialAssignments[0]?.materialId
    if (!templateMaterialId) {
        throw new Error(`Product ${PRODUCT_SKU} has no active material assignment to base variants on`)
    }
    const template = await prisma.mmMaterial.findUniqueOrThrow({
        where: { id: templateMaterialId },
    })
    const companyId =
        template.companyId ?? product.materialAssignments[0]?.companyId
    if (!companyId) {
        throw new Error(`Material ${template.materialCode} has no company`)
    }

    await prisma.$transaction(
        async (tx) => {
            const option = await tx.sdProductOption.upsert({
                where: { productId_name: { productId: product.id, name: OPTION_NAME } },
                update: {},
                create: {
                    productId: product.id,
                    name: OPTION_NAME,
                    sortOrder: 0,
                    isRequired: true,
                    displayStyle: 'BUTTON',
                },
            })

            // A SIMPLE product's hidden default variant is replaced by the Size variants.
            await tx.sdProductVariant.deleteMany({
                where: { productId: product.id, combinationKey: '__default__' },
            })

            let defaultVariantId: string | null = null

            for (const [index, seed] of VARIANTS.entries()) {
                const optionValue = await tx.sdProductOptionValue.upsert({
                    where: { optionId_value: { optionId: option.id, value: seed.value } },
                    update: { sortOrder: index },
                    create: { optionId: option.id, value: seed.value, sortOrder: index },
                })

                const variantData = {
                    variantName: seed.value,
                    sku: seed.sku,
                    price: new Prisma.Decimal(seed.price),
                    compareAtPrice: new Prisma.Decimal(seed.compareAtPrice),
                    imageUrl: seed.imageUrl,
                    isActive: true,
                    isDefault: index === 0,
                    isPublished: true,
                    isHidden: false,
                    sortOrder: index,
                    companyId,
                    salesUomId: product.salesUomId,
                    materialUomId: template.baseUomId,
                }
                const variant = await tx.sdProductVariant.upsert({
                    where: {
                        productId_combinationKey: {
                            productId: product.id,
                            combinationKey: combinationKey(seed.value),
                        },
                    },
                    update: variantData,
                    create: {
                        ...variantData,
                        productId: product.id,
                        combinationKey: combinationKey(seed.value),
                    },
                })

                await tx.sdProductVariantOptionValue.upsert({
                    where: {
                        variantId_optionValueId: {
                            variantId: variant.id,
                            optionValueId: optionValue.id,
                        },
                    },
                    update: {},
                    create: { variantId: variant.id, optionValueId: optionValue.id },
                })

                let materialId: string
                if (seed.reuseExistingMaterial) {
                    await tx.mmMaterial.update({
                        where: { id: template.id },
                        data: { catalogVariantId: variant.id, catalogSource: 'MANUALLY_LINKED' },
                    })
                    materialId = template.id
                } else {
                    const existing = await tx.mmMaterial.findFirst({
                        where: { sku: seed.sku, deletedAt: null },
                        select: { id: true },
                    })
                    materialId =
                        existing?.id ??
                        (
                            await tx.mmMaterial.create({
                                data: {
                                    materialCode: await nextMaterialCode(tx),
                                    materialName: `${product.name} — ${seed.value}`,
                                    description: `Auto-created from Product Catalog: ${product.name}, variant ${seed.value}`,
                                    sku: seed.sku,
                                    materialTypeId: template.materialTypeId,
                                    materialCategoryId: template.materialCategoryId,
                                    baseUomId: template.baseUomId,
                                    salesUomId: template.salesUomId,
                                    purchaseUomId: template.purchaseUomId,
                                    companyId,
                                    defaultWarehouseId: template.defaultWarehouseId,
                                    currencyId: template.currencyId,
                                    valuationClassId: template.valuationClassId,
                                    valuationMethod: template.valuationMethod,
                                    standardCost: template.standardCost,
                                    batchManaged: template.batchManaged,
                                    serialManaged: template.serialManaged,
                                    expiryManaged: template.expiryManaged,
                                    inventoryManaged: true,
                                    purchasable: true,
                                    sellable: true,
                                    status: 'ACTIVE',
                                    catalogVariantId: variant.id,
                                    catalogSource: 'AUTO_CREATED',
                                },
                                select: { id: true },
                            })
                        ).id
                }

                await tx.sdProductVariant.update({
                    where: { id: variant.id },
                    data: { materialId },
                })

                const assignment = await tx.sdProductMaterialAssignment.findFirst({
                    where: { productId: product.id, materialId, status: 'ACTIVE' },
                    select: { id: true },
                })
                if (!assignment) {
                    await tx.sdProductMaterialAssignment.create({
                        data: {
                            productId: product.id,
                            materialId,
                            companyId,
                            divisionId: DIVISION_ID,
                            salesUomId: product.salesUomId,
                            materialUomId: template.baseUomId,
                            fulfillmentType: 'WAREHOUSE',
                            inventoryRelevant: true,
                            atpRelevant: true,
                            reservationRelevant: true,
                            status: 'ACTIVE',
                        },
                    })
                }

                if (index === 0) defaultVariantId = variant.id
            }

            await tx.sdProduct.update({
                where: { id: product.id },
                data: {
                    productConfig: 'VARIABLE',
                    defaultVariantId,
                    badge: product.badge ?? 'Best Seller',
                },
            })
        },
        { timeout: 60_000 },
    )

    const variants = await prisma.sdProductVariant.findMany({
        where: { productId: product.id },
        orderBy: { sortOrder: 'asc' },
        include: {
            material: {
                select: { materialCode: true, onHandQty: true, reservedQty: true },
            },
        },
    })
    console.log(`${PRODUCT_SKU} — ${product.name} (${product.badge ?? 'Best Seller'})`)
    for (const v of variants) {
        console.log(
            `  ${v.isDefault ? '*' : ' '} ${v.variantName.padEnd(7)} ${v.sku}  ₱${v.price} (was ₱${v.compareAtPrice})  ` +
                `${v.material?.materialCode ?? 'no material'}  on hand ${v.material?.onHandQty ?? 0} · reserved ${v.material?.reservedQty ?? 0}  ${v.imageUrl}`,
        )
    }
}

main()
    .catch((err) => {
        console.error('Seed failed:', err)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
