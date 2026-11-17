/**
 * Idempotent seed for centralized G/L account determination (Phase 1 — MM + SD).
 *
 * - Reuses the company chart of accounts; never creates a second chart.
 * - Reuses existing accounts by code and only inserts the ones that are missing.
 * - Never fabricates approvals: every seeded rule is a DRAFT and must go through
 *   submit → approve → activate before it can resolve.
 *
 * Run: `npm run prisma:seed-account-determination` (from backend/).
 */
import { PrismaClient } from '@prisma/client'

const SEED_ACTOR = 'seed-account-determination'

type GroupDef = {
    code: string
    name: string
    category: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
}

type AccountDef = {
    code: string
    name: string
    group: string
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
    normal: 'DEBIT' | 'CREDIT'
}

type RuleDef = {
    code: string
    name: string
    sourceModule: 'MM' | 'SD'
    transactionType: string
    lines: Array<{ side: 'DEBIT' | 'CREDIT'; account: string; description?: string }>
}

/** Groups that must exist so the additional accounts have a home. */
const GROUP_DEFS: GroupDef[] = [
    { code: '1000', name: 'Cash and Cash Equivalents', category: 'ASSET' },
    { code: '1100', name: 'Receivables', category: 'ASSET' },
    { code: '1200', name: 'Inventory', category: 'ASSET' },
    { code: '2100', name: 'Payables', category: 'LIABILITY' },
    { code: '2200', name: 'Tax Payables', category: 'LIABILITY' },
    { code: '4000', name: 'Revenue', category: 'REVENUE' },
    { code: '5100', name: 'Cost of Sales', category: 'EXPENSE' },
    { code: '5200', name: 'Inventory Adjustments', category: 'EXPENSE' },
]

/**
 * Existing starter-chart accounts are reused by code. Only the codes below can
 * be inserted, and only when they are absent.
 */
const ACCOUNT_DEFS: AccountDef[] = [
    { code: '110300', name: 'Cash in Bank', group: '1000', type: 'ASSET', normal: 'DEBIT' },
    { code: '110200', name: 'Accounts Receivable', group: '1100', type: 'ASSET', normal: 'DEBIT' },
    { code: '120100', name: 'Merchandise Inventory', group: '1200', type: 'ASSET', normal: 'DEBIT' },
    { code: '210100', name: 'Accounts Payable', group: '2100', type: 'LIABILITY', normal: 'CREDIT' },
    { code: '210200', name: 'GR/IR Clearing', group: '2100', type: 'LIABILITY', normal: 'CREDIT' },
    { code: '220100', name: 'Output VAT Payable', group: '2200', type: 'LIABILITY', normal: 'CREDIT' },
    { code: '410100', name: 'Sales Revenue', group: '4000', type: 'REVENUE', normal: 'CREDIT' },
    { code: '410200', name: 'Sales Returns', group: '4000', type: 'REVENUE', normal: 'DEBIT' },
    { code: '410300', name: 'Sales Discounts', group: '4000', type: 'REVENUE', normal: 'DEBIT' },
    { code: '510100', name: 'Cost of Goods Sold', group: '5100', type: 'EXPENSE', normal: 'DEBIT' },
    { code: '510200', name: 'Inventory Write-offs', group: '5200', type: 'EXPENSE', normal: 'DEBIT' },
    { code: '520100', name: 'Inventory Shrinkage', group: '5200', type: 'EXPENSE', normal: 'DEBIT' },
]

/** MM catalogue — one draft per transaction type. */
const MM_RULES: RuleDef[] = [
    {
        code: 'MM-001',
        name: 'Goods Receipt',
        sourceModule: 'MM',
        transactionType: 'GOODS_RECEIPT',
        lines: [
            { side: 'DEBIT', account: '120100', description: 'Inventory received' },
            { side: 'CREDIT', account: '210200', description: 'GR/IR clearing' },
        ],
    },
    {
        code: 'MM-002',
        name: 'Supplier Invoice',
        sourceModule: 'MM',
        transactionType: 'SUPPLIER_INVOICE',
        lines: [
            { side: 'DEBIT', account: '210200', description: 'GR/IR cleared' },
            { side: 'CREDIT', account: '210100', description: 'Supplier liability' },
        ],
    },
    {
        code: 'MM-003',
        name: 'Inventory Consumption',
        sourceModule: 'MM',
        transactionType: 'INVENTORY_CONSUMPTION',
        lines: [
            { side: 'DEBIT', account: '510100', description: 'Material consumed' },
            { side: 'CREDIT', account: '120100', description: 'Inventory issued' },
        ],
    },
    {
        code: 'MM-004',
        name: 'Inventory Write-off',
        sourceModule: 'MM',
        transactionType: 'INVENTORY_WRITE_OFF',
        lines: [
            { side: 'DEBIT', account: '510200', description: 'Inventory written off' },
            { side: 'CREDIT', account: '120100', description: 'Inventory removed' },
        ],
    },
    {
        code: 'MM-005',
        name: 'Supplier Return',
        sourceModule: 'MM',
        transactionType: 'SUPPLIER_RETURN',
        lines: [
            { side: 'DEBIT', account: '210200', description: 'GR/IR reversed' },
            { side: 'CREDIT', account: '120100', description: 'Inventory returned' },
        ],
    },
]

/** SD catalogue — billing demonstrates multiple credit lines. */
const SD_RULES: RuleDef[] = [
    {
        code: 'SD-001',
        name: 'Customer Billing',
        sourceModule: 'SD',
        transactionType: 'CUSTOMER_BILLING',
        lines: [
            { side: 'DEBIT', account: '110200', description: 'Customer receivable' },
            { side: 'CREDIT', account: '410100', description: 'Sales revenue' },
            { side: 'CREDIT', account: '220100', description: 'Output VAT' },
        ],
    },
    {
        code: 'SD-002',
        name: 'Cost of Goods Sold',
        sourceModule: 'SD',
        transactionType: 'COGS',
        lines: [
            { side: 'DEBIT', account: '510100', description: 'Cost of goods sold' },
            { side: 'CREDIT', account: '120100', description: 'Inventory reduction' },
        ],
    },
    {
        code: 'SD-003',
        name: 'Customer Payment',
        sourceModule: 'SD',
        transactionType: 'CUSTOMER_PAYMENT',
        lines: [
            { side: 'DEBIT', account: '110300', description: 'Cash received' },
            { side: 'CREDIT', account: '110200', description: 'Receivable cleared' },
        ],
    },
    {
        code: 'SD-004',
        name: 'Sales Return',
        sourceModule: 'SD',
        transactionType: 'SALES_RETURN',
        lines: [
            { side: 'DEBIT', account: '410200', description: 'Sales returned' },
            { side: 'CREDIT', account: '110200', description: 'Receivable credited' },
        ],
    },
    {
        code: 'SD-005',
        name: 'Sales Discount',
        sourceModule: 'SD',
        transactionType: 'SALES_DISCOUNT',
        lines: [
            { side: 'DEBIT', account: '410300', description: 'Discount granted' },
            { side: 'CREDIT', account: '110200', description: 'Receivable reduced' },
        ],
    },
]

export async function seedAccountDetermination(prisma: PrismaClient) {
    const company = await prisma.company.findFirst({ orderBy: { createdAt: 'asc' } })
    if (!company) {
        return { skipped: true, reason: 'No company exists yet.' }
    }
    const settings = await prisma.ficoCompanyAccountingSettings.findUnique({
        where: { companyId: company.id },
        select: { chartOfAccountsId: true },
    })
    const chart =
        (settings?.chartOfAccountsId
            ? await prisma.ficoChartOfAccounts.findUnique({
                  where: { id: settings.chartOfAccountsId },
                  select: { id: true, code: true },
              })
            : null) ??
        (await prisma.ficoChartOfAccounts.findFirst({
            where: { code: 'PH_MM_STARTER' },
            select: { id: true, code: true },
        }))
    if (!chart) {
        return { skipped: true, reason: 'No chart of accounts available for the company.' }
    }

    const groupIds = new Map<string, string>()
    for (const def of GROUP_DEFS) {
        const existing = await prisma.ficoGlAccountGroup.findFirst({
            where: { chartOfAccountsId: chart.id, code: def.code },
            select: { id: true },
        })
        const group =
            existing ??
            (await prisma.ficoGlAccountGroup.create({
                data: {
                    chartOfAccountsId: chart.id,
                    code: def.code,
                    name: def.name,
                    category: def.category,
                    status: 'ACTIVE',
                    createdBy: SEED_ACTOR,
                    updatedBy: SEED_ACTOR,
                },
                select: { id: true },
            }))
        groupIds.set(def.code, group.id)
    }

    const accountIds = new Map<string, string>()
    const enabledForPosting: string[] = []
    for (const def of ACCOUNT_DEFS) {
        const groupId = groupIds.get(def.group)
        if (!groupId) throw new Error(`Missing seeded account group ${def.group}`)
        const existing = await prisma.ficoGlAccount.findUnique({
            where: {
                chartOfAccountsId_accountCode: {
                    chartOfAccountsId: chart.id,
                    accountCode: def.code,
                },
            },
            select: { id: true },
        })
        const account =
            existing ??
            (await prisma.ficoGlAccount.create({
                data: {
                    chartOfAccountsId: chart.id,
                    accountGroupId: groupId,
                    accountCode: def.code,
                    accountName: def.name,
                    accountType: def.type,
                    normalBalance: def.normal,
                    isPostingAccount: true,
                    allowManualPosting: true,
                    allowAutomaticPosting: true,
                    status: 'ACTIVE',
                    createdBy: SEED_ACTOR,
                    updatedBy: SEED_ACTOR,
                },
                select: { id: true },
            }))
        accountIds.set(def.code, account.id)

        const assignment = await prisma.ficoCompanyGlAccount.findFirst({
            where: { companyId: company.id, glAccountId: account.id },
            select: { id: true, postingEnabled: true },
        })
        if (!assignment) {
            await prisma.ficoCompanyGlAccount.create({
                data: {
                    companyId: company.id,
                    glAccountId: account.id,
                    postingEnabled: true,
                    createdBy: SEED_ACTOR,
                    updatedBy: SEED_ACTOR,
                },
            })
        } else if (!assignment.postingEnabled) {
            // These accounts are the prerequisites of the seeded rules; a rule
            // pointing at a disabled account could never be activated.
            await prisma.ficoCompanyGlAccount.update({
                where: { id: assignment.id },
                data: { postingEnabled: true, updatedBy: SEED_ACTOR },
            })
            enabledForPosting.push(def.code)
        }
    }

    const created: string[] = []
    const updated: string[] = []
    const preserved: string[] = []

    for (const def of [...MM_RULES, ...SD_RULES]) {
        const lines = def.lines.map((line, index) => {
            const glAccountId = accountIds.get(line.account)
            if (!glAccountId) {
                throw new Error(`Missing seeded account ${line.account} for ${def.code}`)
            }
            return {
                lineNumber: index + 1,
                side: line.side,
                glAccountId,
                description: line.description ?? null,
            }
        })

        const existing = await prisma.ficoAccountDeterminationRule.findUnique({
            where: { determinationCode: def.code },
            select: { id: true, status: true },
        })
        if (existing && existing.status !== 'DRAFT') {
            // Never overwrite a rule that has entered the approval lifecycle.
            preserved.push(def.code)
            continue
        }
        if (existing) {
            await prisma.$transaction(async (tx) => {
                await tx.ficoAccountDeterminationLine.deleteMany({
                    where: { ruleId: existing.id },
                })
                await tx.ficoAccountDeterminationRule.update({
                    where: { id: existing.id },
                    data: {
                        name: def.name,
                        sourceModule: def.sourceModule,
                        transactionType: def.transactionType,
                        status: 'DRAFT',
                        updatedBy: SEED_ACTOR,
                        lines: { create: lines },
                    },
                })
            })
            updated.push(def.code)
            continue
        }
        await prisma.ficoAccountDeterminationRule.create({
            data: {
                determinationCode: def.code,
                name: def.name,
                description: 'Seeded Phase 1 draft — submit, approve and activate to resolve.',
                companyId: company.id,
                sourceModule: def.sourceModule,
                transactionType: def.transactionType,
                priority: 100,
                status: 'DRAFT',
                createdBy: SEED_ACTOR,
                updatedBy: SEED_ACTOR,
                lines: { create: lines },
            },
        })
        created.push(def.code)
    }

    return {
        skipped: false,
        companyId: company.id,
        chart: chart.code,
        created,
        updated,
        preserved,
        enabledForPosting,
    }
}

async function main() {
    const prisma = new PrismaClient()
    try {
        const result = await seedAccountDetermination(prisma)
        console.log('Account determination seed:', JSON.stringify(result, null, 2))
    } finally {
        await prisma.$disconnect()
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error)
        process.exit(1)
    })
}
