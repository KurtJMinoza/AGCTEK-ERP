/**
 * One-time: marketplace AR counterparties (MP-{SOURCE_CODE}) + link on sd_sales_sources.
 *
 *   node scripts/seed-marketplace-counterparty-customers.cjs
 */
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
    const sources = await prisma.sdSalesSource.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, counterpartyCustomerId: true },
    })
  let linked = 0
    for (const source of sources) {
        if (source.counterpartyCustomerId) continue
        const customerNumber = `MP-${source.code}`
        let customer = await prisma.sdCustomer.findFirst({
            where: { customerNumber },
            select: { id: true },
        })
        if (!customer) {
            customer = await prisma.sdCustomer.create({
                data: {
                    customerNumber,
                    companyName: `${source.name} (Marketplace)`,
                    contactName: source.name,
                    phone: '—',
                    customerCategory: 'WHOLESALE',
                    paymentTerms: 'NET_30',
                },
                select: { id: true },
            })
            console.log(`Created customer ${customerNumber}`)
        }
        await prisma.sdSalesSource.update({
            where: { id: source.id },
            data: { counterpartyCustomerId: customer.id },
        })
        linked += 1
    }
    console.log(`Linked ${linked} sales source(s) to marketplace customers.`)
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())