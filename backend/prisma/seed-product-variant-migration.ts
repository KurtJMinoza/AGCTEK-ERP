/**
 * Backfill migration: unified product-variant architecture.
 *
 * - Sets productConfig on all products (VARIABLE when variants exist, else SIMPLE)
 * - Creates hidden default variants for simple products
 * - Links material from SdProductMaterialAssignment to the default variant
 * - Backfills combinationKey on existing variants
 * - Sets defaultVariantId on products that have a default variant
 * - Reports ambiguous data (variants without materials, duplicate combos)
 *
 * Run: npx ts-node --project tsconfig.json prisma/seed-product-variant-migration.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('=== Product-Variant Architecture Migration ===\n')

    // 1. Load all products with their variants and material assignments
    const products = await prisma.sdProduct.findMany({
        include: {
            variants: {
                include: {
                    optionValues: {
                        include: {
                            optionValue: {
                                include: { option: true },
                            },
                        },
                    },
                },
                orderBy: { sortOrder: 'asc' },
            },
            options: {
                include: { values: { orderBy: { sortOrder: 'asc' } } },
                orderBy: { sortOrder: 'asc' },
            },
            materialAssignments: {
                where: { status: 'ACTIVE' },
                orderBy: { effectiveFrom: 'asc' },
            },
        },
    })

    let simpleCount = 0
    let variableCount = 0
    let defaultVariantCreated = 0
    let combinationKeyFilled = 0
    let warnings: string[] = []

    for (const product of products) {
        const hasVariants = product.variants.length > 0
        const config = hasVariants ? 'VARIABLE' : 'SIMPLE'

        // 2. Set productConfig
        if (product.productConfig !== config) {
            await prisma.sdProduct.update({
                where: { id: product.id },
                data: { productConfig: config },
            })
        }

        if (config === 'SIMPLE') {
            simpleCount++

            // 3. Create hidden default variant for simple products (if missing)
            const existingDefault = product.variants.find(
                (v) => v.combinationKey === '__default__',
            )
            if (!existingDefault) {
                const primaryAssignment = product.materialAssignments[0]
                const variantSku = `${product.sku}-V01`

                // Check if SKU already exists
                const skuExists = await prisma.sdProductVariant.findUnique({
                    where: { sku: variantSku },
                })
                const finalSku = skuExists
                    ? `${product.sku}-V01-${Date.now()}`
                    : variantSku

                const variant = await prisma.sdProductVariant.create({
                    data: {
                        productId: product.id,
                        variantName: 'Default',
                        combinationKey: '__default__',
                        sku: finalSku,
                        isActive: true,
                        isDefault: true,
                        isPublished: true,
                        isHidden: true,
                        materialId: primaryAssignment?.materialId ?? null,
                        companyId: primaryAssignment?.companyId ?? null,
                    },
                })

                await prisma.sdProduct.update({
                    where: { id: product.id },
                    data: { defaultVariantId: variant.id },
                })

                // Mark material as catalog-linked
                if (primaryAssignment?.materialId) {
                    await prisma.mmMaterial.update({
                        where: { id: primaryAssignment.materialId },
                        data: {
                            catalogVariantId: variant.id,
                            catalogSource: 'MANUALLY_LINKED',
                        },
                    })
                }

                defaultVariantCreated++
            }
        } else {
            variableCount++

            // 4. Backfill combinationKey on existing variants
            for (const variant of product.variants) {
                if (
                    variant.combinationKey !== '__default__' &&
                    variant.combinationKey !== ''
                ) {
                    continue // already filled
                }

                // Build combination key from option values
                const sortedValues = [...variant.optionValues].sort((a, b) => {
                    const aOpt = product.options.findIndex(
                        (o) => o.id === a.optionValue.optionId,
                    )
                    const bOpt = product.options.findIndex(
                        (o) => o.id === b.optionValue.optionId,
                    )
                    return aOpt - bOpt
                })

                const key = sortedValues
                    .map((ov) => {
                        const optName = ov.optionValue.option.name
                            .toLowerCase()
                            .trim()
                        const valName = ov.optionValue.value
                            .toLowerCase()
                            .trim()
                        return `${optName}:${valName}`
                    })
                    .join('|')

                if (key) {
                    try {
                        await prisma.sdProductVariant.update({
                            where: { id: variant.id },
                            data: { combinationKey: key },
                        })
                        combinationKeyFilled++
                    } catch (err: any) {
                        if (err.code === 'P2002') {
                            warnings.push(
                                `Duplicate combination key "${key}" for variant ${variant.sku} on product ${product.sku}`,
                            )
                        } else {
                            throw err
                        }
                    }
                }
            }

            // 5. Set defaultVariantId if not set
            if (!product.defaultVariantId) {
                const defaultVariant = product.variants.find(
                    (v) => v.isDefault && v.isActive,
                ) ?? product.variants.find((v) => v.isActive)
                if (defaultVariant) {
                    await prisma.sdProduct.update({
                        where: { id: product.id },
                        data: { defaultVariantId: defaultVariant.id },
                    })
                }
            }

            // 6. Check for variants without materials
            const unmapped = product.variants.filter(
                (v) => v.isActive && !v.materialId,
            )
            if (unmapped.length > 0) {
                warnings.push(
                    `Product ${product.sku} has ${unmapped.length} active variant(s) without a material: ${unmapped.map((v) => v.sku).join(', ')}`,
                )
            }
        }
    }

    console.log(`Products processed: ${products.length}`)
    console.log(`  Simple: ${simpleCount}`)
    console.log(`  Variable: ${variableCount}`)
    console.log(`  Default variants created: ${defaultVariantCreated}`)
    console.log(`  Combination keys backfilled: ${combinationKeyFilled}`)

    if (warnings.length > 0) {
        console.log(`\n⚠ Warnings (${warnings.length}):`)
        for (const w of warnings) {
            console.log(`  - ${w}`)
        }
    } else {
        console.log('\n✓ No warnings.')
    }

    console.log('\n=== Migration complete ===')
}

main()
    .catch((err) => {
        console.error('Migration failed:', err)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
