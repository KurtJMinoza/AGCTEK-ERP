/**
 * Seed SD account determination rules for POS revenue posting.
 * Steps 1-2 already ran successfully. This script only does step 3.
 * Rules go through DRAFT → PENDING_APPROVAL → APPROVED → ACTIVE.
 */
const { NestFactory } = require('@nestjs/core')
const { AppModule } = require('./dist/app.module')
const { PrismaService } = require('./dist/prisma/prisma.service')
const { FicoAccountDeterminationRulesService } = require('./dist/fico/fico-account-determination-rules.service')

const AGCTEK_CODE = 'AGCTEK'
const COA_CODE = 'AGCTEK_COA'
const ACTOR = 'seed-fico-setup'

const SD_RULES = [
    {
        code: 'SD-POS-REVENUE',
        name: 'POS Sales Revenue',
        type: 'SALES_REVENUE',
        lines: [{ side: 'CREDIT', accountCode: '4000', desc: 'Sales Revenue' }],
    },
    {
        code: 'SD-POS-OUTPUT-VAT',
        name: 'POS Output VAT',
        type: 'OUTPUT_TAX',
        lines: [{ side: 'CREDIT', accountCode: '2040', desc: 'Output VAT Payable' }],
    },
    {
        code: 'SD-POS-CASH',
        name: 'POS Cash Tender',
        type: 'CUSTOMER_PAYMENT',
        keyCode: 'CASH',
        lines: [{ side: 'DEBIT', accountCode: '1000', desc: 'Cash on Hand' }],
    },
    {
        code: 'SD-POS-GCASH',
        name: 'POS GCash Tender',
        type: 'CUSTOMER_PAYMENT',
        keyCode: 'GCASH',
        lines: [{ side: 'DEBIT', accountCode: '1160', desc: 'GCash Clearing' }],
    },
    {
        code: 'SD-POS-BANK',
        name: 'POS Bank Transfer Tender',
        type: 'CUSTOMER_PAYMENT',
        keyCode: 'BANK_TRANSFER',
        lines: [{ side: 'DEBIT', accountCode: '1180', desc: 'Bank Transfer Clearing' }],
    },
    {
        code: 'SD-POS-CARD',
        name: 'POS Card Tender',
        type: 'CUSTOMER_PAYMENT',
        keyCode: 'CARD',
        lines: [{ side: 'DEBIT', accountCode: '1170', desc: 'Card Clearing' }],
    },
    {
        code: 'SD-POS-CHEQUE',
        name: 'POS Cheque Tender',
        type: 'CUSTOMER_PAYMENT',
        keyCode: 'CHEQUE',
        lines: [{ side: 'DEBIT', accountCode: '1190', desc: 'Cheque Clearing' }],
    },
    {
        code: 'SD-POS-SALARY',
        name: 'POS Salary Deduction',
        type: 'CUSTOMER_PAYMENT',
        keyCode: 'SALARY_LOAN',
        lines: [{ side: 'DEBIT', accountCode: '1110', desc: 'Employee Receivables' }],
    },
]

async function main() {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] })
    const prisma = app.get(PrismaService)
    const rules = app.get(FicoAccountDeterminationRulesService)

    try {
        const company = await prisma.company.findUnique({ where: { code: AGCTEK_CODE } })
        if (!company) throw new Error('AGCTEK not found')
        const coa = await prisma.ficoChartOfAccounts.findUnique({ where: { code: COA_CODE } })
        if (!coa) throw new Error('AGCTEK_COA not found')
        const glByCode = new Map(
            (await prisma.ficoGlAccount.findMany({
                where: { chartOfAccountsId: coa.id },
                select: { id: true, accountCode: true },
            })).map(a => [a.accountCode, a.id]),
        )

        const user = { id: ACTOR, role: 'super_admin' }

        for (const def of SD_RULES) {
            const existing = await prisma.ficoAccountDeterminationRule.findFirst({
                where: { companyId: company.id, determinationCode: def.code },
            })
            if (existing) {
                console.log(`${def.code}: already exists (${existing.status})`)
                if (existing.status === 'ACTIVE') continue
                // Walk it through the lifecycle
                if (existing.status === 'DRAFT') {
                    await rules.submit(existing.id, user)
                    console.log(`  → PENDING_APPROVAL`)
                }
                const refreshed = await prisma.ficoAccountDeterminationRule.findUnique({ where: { id: existing.id } })
                if (refreshed.status === 'PENDING_APPROVAL') {
                    await rules.approve(existing.id, { reason: 'Seed setup' }, user)
                    console.log(`  → APPROVED`)
                }
                const refreshed2 = await prisma.ficoAccountDeterminationRule.findUnique({ where: { id: existing.id } })
                if (refreshed2.status === 'APPROVED' || refreshed2.status === 'INACTIVE') {
                    await rules.activate(existing.id, user)
                    console.log(`  → ACTIVE`)
                }
                continue
            }

            const lineInputs = def.lines.map(l => {
                const glId = glByCode.get(l.accountCode)
                if (!glId) throw new Error(`G/L ${l.accountCode} not found for ${def.code}`)
                return { side: l.side, glAccountId: glId, description: l.desc }
            })

            const created = await rules.create({
                determinationCode: def.code,
                name: def.name,
                companyId: company.id,
                sourceModule: 'SD',
                transactionType: def.type,
                transactionKeyCode: def.keyCode ?? null,
                priority: 100,
                lines: lineInputs,
            }, user)
            console.log(`${def.code}: CREATED as DRAFT`)

            // DRAFT → PENDING_APPROVAL → APPROVED → ACTIVE
            await rules.submit(created.id, user)
            console.log(`  → PENDING_APPROVAL`)
            await rules.approve(created.id, { reason: 'Seed setup' }, user)
            console.log(`  → APPROVED`)
            await rules.activate(created.id, user)
            console.log(`  → ACTIVE`)
        }

        console.log('\nAll SD rules are ACTIVE. POS revenue posting is ready.')
    } finally {
        await app.close()
    }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
