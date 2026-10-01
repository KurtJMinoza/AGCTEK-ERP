import { Prisma, PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join } from 'path'

type SeedProduct = {
    divisionId: string
    sku: string
    name: string
    description: string
    price: number
    originalPrice: number | null
    category: string
    imageUrl: string
    badge: string | null
    sortOrder: number
    attributes: Prisma.InputJsonValue | null
}

/** Creates missing storefront products only; never overwrites admin edits. */
export async function seedSdProducts(prisma: PrismaClient) {
    const products: SeedProduct[] = JSON.parse(
        readFileSync(join(__dirname, 'seed', 'sd-products.json'), 'utf8'),
    )
    let created = 0
    for (const p of products) {
        const exists = await prisma.sdProduct.findUnique({
            where: { divisionId_sku: { divisionId: p.divisionId, sku: p.sku } },
            select: { id: true },
        })
        if (exists) continue
        await prisma.sdProduct.create({
            data: {
                ...p,
                attributes: p.attributes ?? Prisma.DbNull,
                createdBy: 'seed',
            },
        })
        created++
    }
    console.log(`sd_products: ${created} created, ${products.length - created} already present`)
}

if (require.main === module) {
    const prisma = new PrismaClient()
    seedSdProducts(prisma)
        .catch((err) => {
            console.error(err)
            process.exitCode = 1
        })
        .finally(() => prisma.$disconnect())
}
