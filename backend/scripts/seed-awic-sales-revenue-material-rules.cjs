/**
 * Create SALES_REVENUE determination rules from material category codes → AWIC COA.
 *
 *   node scripts/seed-awic-sales-revenue-material-rules.cjs
 */
const { PrismaClient } = require('@prisma/client')
const CATEGORY_MAP = {
    CAPS: '4009',
    HATS: '4009',
    SHIRTS: '4009',
    APPAREL: '4009',
    ACCESSORIES: '4009',
    WATCHES: '4001',
    WATCH: '4001',
    BAGS: '4006',
    LUXURY_BAGS: '4002',
    PERFUME: '4008',
    PERFUMES: '4008',
    FRAGRANCE: '4008',
    FOOD: '4004',
    SUPPLEMENT: '4004',
    SUPPLEMENTS: '4004',
    VITAMINS: '4004',
    SLIMMING: '4003',
    SPEAKER: '4007',
    SPEAKERS: '4007',
    CONSUMABLES: '4004',
}

const ACTOR = 'seed-awic-sales-revenue-material-rules'
const p = new PrismaClient()

async function ensureCompanyGl(companyId, glAccountId, code) {
    await p.ficoCompanyGlAccount.upsert({
        where: {
            companyId_glAccountId: { companyId, glAccountId },
        },
        create: {
            companyId,
            glAccountId,
            postingEnabled: true,
            createdBy: ACTOR,
            updatedBy: ACTOR,
        },
        update: { postingEnabled: true, updatedBy: ACTOR },
    })
    console.log(`Assigned GL ${code} for posting`)
}

async function main() {
    const company = await p.company.findFirst({
        where: { name: { contains: 'Amalgated World' } },
    })
    if (!company) throw new Error('AWIC not found')
    const settings = await p.ficoCompanyAccountingSettings.findFirst({
        where: { companyId: company.id, status: 'ACTIVE' },
    })
    if (!settings?.chartOfAccountsId) throw new Error('AWIC FICO not active')

    for (const [categoryCode, glCode] of Object.entries(CATEGORY_MAP)) {
        const gl = await p.ficoGlAccount.findFirst({
            where: {
                chartOfAccountsId: settings.chartOfAccountsId,
                accountCode: glCode,
            },
        })
        if (!gl) {
            console.log(`Skip ${categoryCode}: GL ${glCode} missing`)
            continue
        }
        await ensureCompanyGl(company.id, gl.id, glCode)
        const ruleCode = `AWIC-SALES-${categoryCode}`
        const existing = await p.ficoAccountDeterminationRule.findUnique({
            where: { determinationCode: ruleCode },
        })
        if (existing) {
            console.log(`Rule ${ruleCode} exists`)
            continue
        }
        await p.ficoAccountDeterminationRule.create({
            data: {
                determinationCode: ruleCode,
                name: `AWIC sales revenue — ${categoryCode}`,
                companyId: company.id,
                sourceModule: 'SD',
                transactionType: 'SALES_REVENUE',
                transactionKeyCode: 'SALES_REVENUE',
                materialGroupCode: categoryCode,
                priority: 20,
                status: 'ACTIVE',
                effectiveFrom: new Date('2020-01-01'),
                createdBy: ACTOR,
                updatedBy: ACTOR,
                approvedBy: ACTOR,
                approvedAt: new Date(),
                activatedBy: ACTOR,
                activatedAt: new Date(),
                lines: {
                    create: [
                        {
                            lineNumber: 1,
                            side: 'CREDIT',
                            glAccountId: gl.id,
                            description: `Sales — ${categoryCode}`,
                        },
                    ],
                },
            },
        })
        console.log(`Created ${ruleCode} → ${glCode}`)
    }
    console.log('Done.')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => p.$disconnect())