/**
 * Upsert SD SALES_REVENUE + MM GI_COGS rules from AWIC merchandising category map.
 *
 *   node scripts/seed-awic-merchandising-account-rules.cjs
 */
const { PrismaClient } = require('@prisma/client')
const { AWIC_MERCHANDISING_GL } = require('../dist/fico/fico-merchandising-account-map')

const ACTOR = 'seed-awic-merchandising-account-rules'
const p = new PrismaClient()

async function ensureCompanyGl(companyId, glAccountId, code) {
    await p.ficoCompanyGlAccount.upsert({
        where: { companyId_glAccountId: { companyId, glAccountId } },
        create: {
            companyId,
            glAccountId,
            postingEnabled: true,
            createdBy: ACTOR,
            updatedBy: ACTOR,
        },
        update: { postingEnabled: true, updatedBy: ACTOR },
    })
    console.log(`  company GL posting: ${code}`)
}

async function upsertRule({
    companyId,
    ruleCode,
    name,
    sourceModule,
    transactionType,
    transactionKeyCode,
    materialGroupCode,
    lines,
}) {
    const existing = await p.ficoAccountDeterminationRule.findUnique({
        where: { determinationCode: ruleCode },
        include: { lines: true },
    })
  const base = {
        companyId,
        sourceModule,
        transactionType,
        transactionKeyCode,
        materialGroupCode,
        priority: 20,
        status: 'ACTIVE',
        effectiveFrom: new Date('2020-01-01'),
        updatedBy: ACTOR,
    }
    if (!existing) {
        await p.ficoAccountDeterminationRule.create({
            data: {
                determinationCode: ruleCode,
                name,
                ...base,
                createdBy: ACTOR,
                approvedBy: ACTOR,
                approvedAt: new Date(),
                activatedBy: ACTOR,
                activatedAt: new Date(),
                lines: { create: lines },
            },
        })
        console.log(`Created ${ruleCode}`)
        return
    }
    await p.ficoAccountDeterminationLine.deleteMany({
        where: { ruleId: existing.id },
    })
    await p.ficoAccountDeterminationRule.update({
        where: { id: existing.id },
        data: {
            name,
            ...base,
            lines: { create: lines },
        },
    })
    console.log(`Updated ${ruleCode}`)
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

    for (const [categoryCode, triplet] of Object.entries(AWIC_MERCHANDISING_GL)) {
        const rev = await p.ficoGlAccount.findFirst({
            where: {
                chartOfAccountsId: settings.chartOfAccountsId,
                accountCode: triplet.revenue,
            },
        })
        const cogs = await p.ficoGlAccount.findFirst({
            where: {
                chartOfAccountsId: settings.chartOfAccountsId,
                accountCode: triplet.cogs,
            },
        })
        const inv = await p.ficoGlAccount.findFirst({
            where: {
                chartOfAccountsId: settings.chartOfAccountsId,
                accountCode: triplet.inventory,
            },
        })
        if (!rev?.id || !cogs?.id || !inv?.id) {
            console.log(`Skip ${categoryCode}: missing GL in COA`)
            continue
        }
        console.log(`Category ${categoryCode} → ${triplet.revenue}/${triplet.cogs}/${triplet.inventory}`)
        for (const gl of [rev, cogs, inv]) {
            await ensureCompanyGl(company.id, gl.id, gl.accountCode)
        }

        await upsertRule({
            companyId: company.id,
            ruleCode: `AWIC-SALES-${categoryCode}`,
            name: `AWIC sales revenue — ${categoryCode}`,
            sourceModule: 'SD',
            transactionType: 'SALES_REVENUE',
            transactionKeyCode: 'SALES_REVENUE',
            materialGroupCode: categoryCode,
            lines: [
                {
                    lineNumber: 1,
                    side: 'CREDIT',
                    glAccountId: rev.id,
                    description: `Sales — ${categoryCode}`,
                },
            ],
        })

        await upsertRule({
            companyId: company.id,
            ruleCode: `AWIC-GI-${categoryCode}`,
            name: `AWIC goods issue COGS — ${categoryCode}`,
            sourceModule: 'MM',
            transactionType: 'INVENTORY_CONSUMPTION',
            transactionKeyCode: 'GI_COGS',
            materialGroupCode: categoryCode,
            lines: [
                {
                    lineNumber: 1,
                    side: 'DEBIT',
                    glAccountId: cogs.id,
                    description: `COGS — ${categoryCode}`,
                },
                {
                    lineNumber: 2,
                    side: 'CREDIT',
                    glAccountId: inv.id,
                    description: `Inventory — ${categoryCode}`,
                },
            ],
        })
    }
    console.log('Done.')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => p.$disconnect())