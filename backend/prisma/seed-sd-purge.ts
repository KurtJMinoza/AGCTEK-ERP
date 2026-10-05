import { PrismaClient, type PrismaClient as PrismaClientType } from '@prisma/client'

/**
 * Removes SD demo master data (products, product–material links, related fulfillment rows).
 * Does not delete posted sales orders (historical snapshots stay on order lines).
 */
export async function purgeSalesDistributionDemoData(prisma: PrismaClientType) {
    console.log('Purging Sales & Distribution demo data …')

    await prisma.sdFulfillmentLine.deleteMany({})
    await prisma.sdFulfillment.deleteMany({})
    await prisma.sdProductMaterialAssignment.deleteMany({})
    await prisma.sdBranchFulfillment.deleteMany({})

    const products = await prisma.sdProduct.deleteMany({})
    console.log(`  Deleted ${products.count} sd_product row(s).`)

    console.log('SD demo purge complete.')
}

if (require.main === module) {
    const prisma = new PrismaClient()
    purgeSalesDistributionDemoData(prisma)
        .catch((err: unknown) => {
            console.error(err)
            process.exitCode = 1
        })
        .finally(() => prisma.$disconnect())
}
