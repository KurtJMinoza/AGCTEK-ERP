/**
 * Store counter = non-VAT output; materials stay VATable for marketplace.
 *
 *   node scripts/set-company-pos-non-vat-policy.cjs AWIC
 *   node scripts/set-company-pos-non-vat-policy.cjs --company-id <cuid>
 */
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
    const arg = process.argv[2]
    if (!arg) {
        console.error('Usage: node scripts/set-company-pos-non-vat-policy.cjs <companyCode>')
        process.exit(1)
    }
    const company =
        arg === '--company-id'
            ? await prisma.company.findUnique({ where: { id: process.argv[3] } })
            : await prisma.company.findFirst({
                  where: {
                      OR: [
                          { code: { equals: arg, mode: 'insensitive' } },
                          { name: { contains: arg, mode: 'insensitive' } },
                      ],
                  },
              })
    if (!company) {
        console.error('Company not found.')
        process.exit(1)
    }
    const updated = await prisma.ficoCompanyAccountingSettings.updateMany({
        where: { companyId: company.id },
        data: { posSaleTaxPolicy: 'NON_VAT_OUTPUT' },
    })
    console.log(
        `Set posSaleTaxPolicy=NON_VAT_OUTPUT for ${company.code ?? company.name} (${company.id}); rows=${updated.count}`,
    )
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())