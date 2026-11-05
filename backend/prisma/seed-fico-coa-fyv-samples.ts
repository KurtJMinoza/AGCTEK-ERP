/**
 * Sample (non-production) FICO master data: the AGCTEK_COA chart of accounts and
 * the AGCTEK_FY / APR_MAR_FY fiscal year variants.
 *
 * Create-only and idempotent: existing records are never updated, so a second
 * run changes nothing. Nothing is assigned to a company — AGCTEK Corporation
 * keeps posting on PH_MM_STARTER / PH_CALENDAR until accounting approves a
 * change through company settings.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { isCodeInRange } from '../src/fico/fico-coa-rules'

const prisma = new PrismaClient()

const SEED_ACTOR = 'seed-fico-coa-fyv-samples'

type GroupDef = {
    code: string
    name: string
    category: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
    rangeFrom: string
    rangeTo: string
}

type AccountDef = {
    code: string
    name: string
    group: string
    description?: string
    /** Only set where it differs from the account type's natural side (contra accounts). */
    normalBalance?: 'DEBIT' | 'CREDIT'
    isPostingAccount?: boolean
    allowManualPosting?: boolean
    reconciliationType?: 'AP' | 'AR' | 'BANK'
}

const GROUPS: GroupDef[] = [
    { code: 'ASSET', name: 'Assets', category: 'ASSET', rangeFrom: '1000', rangeTo: '1999' },
    { code: 'LIAB', name: 'Liabilities', category: 'LIABILITY', rangeFrom: '2000', rangeTo: '2999' },
    { code: 'EQUITY', name: 'Equity', category: 'EQUITY', rangeFrom: '3000', rangeTo: '3999' },
    { code: 'REV', name: 'Revenue', category: 'REVENUE', rangeFrom: '4000', rangeTo: '4999' },
    { code: 'COGS', name: 'Cost of Goods Sold', category: 'EXPENSE', rangeFrom: '5000', rangeTo: '5999' },
    { code: 'OPEX', name: 'Operating Expenses', category: 'EXPENSE', rangeFrom: '6000', rangeTo: '6999' },
    { code: 'OTHER_INC', name: 'Other Income', category: 'REVENUE', rangeFrom: '7000', rangeTo: '7099' },
    { code: 'OTHER_EXP', name: 'Other Expenses', category: 'EXPENSE', rangeFrom: '7100', rangeTo: '7199' },
]

const ACCOUNTS: AccountDef[] = [
    { code: '1000', name: 'Cash on Hand', group: 'ASSET' },
    { code: '1010', name: 'Cash in Bank', group: 'ASSET', description: 'Cash deposited in company bank accounts' },
    { code: '1020', name: 'Petty Cash Fund', group: 'ASSET' },
    {
        code: '1100',
        name: 'Accounts Receivable',
        group: 'ASSET',
        reconciliationType: 'AR',
        allowManualPosting: false,
        description: 'Reconciliation account — posted from the receivables sub-ledger only',
    },
    { code: '1110', name: 'Employee Receivables', group: 'ASSET' },
    { code: '1200', name: 'Merchandise Inventory', group: 'ASSET' },
    { code: '1300', name: 'Prepaid Expenses', group: 'ASSET' },
    { code: '1500', name: 'Office Equipment', group: 'ASSET' },
    {
        code: '1510',
        name: 'Accumulated Depreciation',
        group: 'ASSET',
        normalBalance: 'CREDIT',
        description: 'Contra-asset to Office Equipment',
    },
    {
        code: '2000',
        name: 'Accounts Payable',
        group: 'LIAB',
        reconciliationType: 'AP',
        allowManualPosting: false,
        description: 'Reconciliation account — posted from the payables sub-ledger only',
    },
    { code: '2010', name: 'Accrued Expenses Payable', group: 'LIAB' },
    { code: '2020', name: 'Salaries Payable', group: 'LIAB' },
    { code: '2030', name: 'Taxes Payable', group: 'LIAB' },
    { code: '2100', name: 'Loans Payable', group: 'LIAB' },
    { code: '3000', name: "Owner's Capital / Share Capital", group: 'EQUITY' },
    { code: '3100', name: 'Retained Earnings', group: 'EQUITY' },
    {
        code: '3200',
        name: 'Current Year Earnings',
        group: 'EQUITY',
        isPostingAccount: false,
        description: 'Derived from the period result; never posted directly',
    },
    { code: '4000', name: 'Sales Revenue', group: 'REV' },
    { code: '4010', name: 'Service Revenue', group: 'REV' },
    {
        code: '4020',
        name: 'Sales Returns and Allowances',
        group: 'REV',
        normalBalance: 'DEBIT',
        description: 'Contra-revenue',
    },
    {
        code: '4030',
        name: 'Sales Discounts',
        group: 'REV',
        normalBalance: 'DEBIT',
        description: 'Contra-revenue',
    },
    { code: '5000', name: 'Cost of Goods Sold', group: 'COGS' },
    { code: '5010', name: 'Purchase Cost Adjustments', group: 'COGS' },
    { code: '5020', name: 'Inventory Write-offs', group: 'COGS' },
    { code: '6000', name: 'Salaries and Wages Expense', group: 'OPEX' },
    { code: '6010', name: 'Rent Expense', group: 'OPEX' },
    { code: '6020', name: 'Electricity and Water Expense', group: 'OPEX' },
    { code: '6030', name: 'Internet and Communication Expense', group: 'OPEX' },
    { code: '6040', name: 'Office Supplies Expense', group: 'OPEX' },
    { code: '6050', name: 'Transportation Expense', group: 'OPEX' },
    { code: '6060', name: 'Depreciation Expense', group: 'OPEX' },
    { code: '6070', name: 'Marketing and Advertising Expense', group: 'OPEX' },
    { code: '6080', name: 'Software and Subscription Expense', group: 'OPEX' },
    { code: '6090', name: 'Miscellaneous Expense', group: 'OPEX' },
    { code: '7000', name: 'Interest Income', group: 'OTHER_INC' },
    { code: '7010', name: 'Other Income', group: 'OTHER_INC' },
    { code: '7100', name: 'Interest Expense', group: 'OTHER_EXP' },
    { code: '7110', name: 'Other Expenses', group: 'OTHER_EXP' },
]

const FISCAL_VARIANTS = [
    {
        code: 'AGCTEK_FY',
        name: 'AGCTEK Calendar Fiscal Year',
        description: 'Sample — January 1 to December 31, 12 monthly periods, no special periods.',
        startMonth: 1,
        startDay: 1,
        normalPeriodCount: 12,
        specialPeriodCount: 0,
        yearAssignment: 'YEAR_START',
    },
    {
        code: 'APR_MAR_FY',
        name: 'April to March Fiscal Year',
        description:
            'Sample — April 1 to March 31, 12 monthly periods; labelled by the year it ends (FY 2028 = Apr 2027 – Mar 2028).',
        startMonth: 4,
        startDay: 1,
        normalPeriodCount: 12,
        specialPeriodCount: 0,
        yearAssignment: 'YEAR_END',
    },
]

function naturalBalance(category: GroupDef['category']) {
    return category === 'ASSET' || category === 'EXPENSE' ? 'DEBIT' : 'CREDIT'
}

function assertSampleIsConsistent() {
    const groupByCode = new Map(GROUPS.map((group) => [group.code, group]))
    const codes = new Set<string>()
    for (const account of ACCOUNTS) {
        const group = groupByCode.get(account.group)
        if (!group) throw new Error(`Account ${account.code}: unknown group ${account.group}`)
        if (!isCodeInRange(account.code, group)) {
            throw new Error(
                `Account ${account.code} is outside ${group.code} ${group.rangeFrom}–${group.rangeTo}`,
            )
        }
        if (codes.has(account.code)) throw new Error(`Duplicate sample account ${account.code}`)
        codes.add(account.code)
    }
}

async function seedChartOfAccounts() {
    let chart = await prisma.ficoChartOfAccounts.findUnique({
        where: { code: 'AGCTEK_COA' },
    })
    if (!chart) {
        chart = await prisma.ficoChartOfAccounts.create({
            data: {
                code: 'AGCTEK_COA',
                name: 'AGCTEK Operating Chart of Accounts',
                description:
                    'Sample — standard 4-digit financial account structure for AGCTEK Corporation. Pending accounting review; not assigned to a company.',
                countryCode: 'PH',
                accountCodeLength: 4,
                status: 'ACTIVE',
                createdBy: SEED_ACTOR,
                updatedBy: SEED_ACTOR,
            },
        })
        await prisma.ficoAccountingAuditLog.create({
            data: {
                action: 'CHART_CREATE',
                entityType: 'FicoChartOfAccounts',
                entityId: chart.id,
                newValues: { code: chart.code, accountCodeLength: 4 },
                metadata: { source: SEED_ACTOR },
            },
        })
        console.log('  + chart AGCTEK_COA')
    } else {
        console.log('  = chart AGCTEK_COA already exists (left unchanged)')
    }

    const groupIds = new Map<string, { id: string; category: GroupDef['category'] }>()
    let groupsCreated = 0
    for (const [index, def] of GROUPS.entries()) {
        const existing = await prisma.ficoGlAccountGroup.findUnique({
            where: { chartOfAccountsId_code: { chartOfAccountsId: chart.id, code: def.code } },
        })
        const group =
            existing ??
            (await prisma.ficoGlAccountGroup.create({
                data: {
                    chartOfAccountsId: chart.id,
                    code: def.code,
                    name: def.name,
                    category: def.category,
                    rangeFrom: def.rangeFrom,
                    rangeTo: def.rangeTo,
                    sortOrder: (index + 1) * 10,
                    status: 'ACTIVE',
                    createdBy: SEED_ACTOR,
                    updatedBy: SEED_ACTOR,
                },
            }))
        if (!existing) groupsCreated += 1
        groupIds.set(def.code, {
            id: group.id,
            category: group.category as GroupDef['category'],
        })
    }

    let accountsCreated = 0
    for (const def of ACCOUNTS) {
        const group = groupIds.get(def.group)!
        const existing = await prisma.ficoGlAccount.findUnique({
            where: {
                chartOfAccountsId_accountCode: {
                    chartOfAccountsId: chart.id,
                    accountCode: def.code,
                },
            },
            select: { id: true },
        })
        if (existing) continue
        const isPostingAccount = def.isPostingAccount ?? true
        await prisma.ficoGlAccount.create({
            data: {
                chartOfAccountsId: chart.id,
                accountGroupId: group.id,
                accountCode: def.code,
                accountName: def.name,
                description: def.description ?? '',
                accountType: group.category,
                normalBalance: def.normalBalance ?? naturalBalance(group.category),
                isPostingAccount,
                allowManualPosting: isPostingAccount ? def.allowManualPosting ?? true : false,
                allowAutomaticPosting: isPostingAccount,
                isReconciliationAccount: Boolean(def.reconciliationType),
                reconciliationType: def.reconciliationType ?? null,
                status: 'ACTIVE',
                createdBy: SEED_ACTOR,
                updatedBy: SEED_ACTOR,
            },
        })
        accountsCreated += 1
    }

    if (groupsCreated || accountsCreated) {
        await prisma.ficoAccountingAuditLog.create({
            data: {
                action: 'GL_ACCOUNT_IMPORT',
                entityType: 'FicoChartOfAccounts',
                entityId: chart.id,
                newValues: { groupsCreated, accountsCreated },
                metadata: { source: SEED_ACTOR },
            },
        })
    }
    console.log(
        `  groups: ${groupsCreated} created, ${GROUPS.length - groupsCreated} existing`,
    )
    console.log(
        `  accounts: ${accountsCreated} created, ${ACCOUNTS.length - accountsCreated} existing`,
    )
}

async function seedFiscalVariants() {
    for (const def of FISCAL_VARIANTS) {
        const existing = await prisma.ficoFiscalYearVariant.findUnique({
            where: { code: def.code },
            select: { id: true },
        })
        if (existing) {
            console.log(`  = variant ${def.code} already exists (left unchanged)`)
            continue
        }
        const created = await prisma.ficoFiscalYearVariant.create({
            data: {
                ...def,
                calendarYearBased: def.startMonth === 1 && def.startDay === 1,
                status: 'ACTIVE',
                createdBy: SEED_ACTOR,
                updatedBy: SEED_ACTOR,
            },
        })
        await prisma.ficoAccountingAuditLog.create({
            data: {
                action: 'FISCAL_VARIANT_CREATE',
                entityType: 'FicoFiscalYearVariant',
                entityId: created.id,
                newValues: def,
                metadata: { source: SEED_ACTOR },
            },
        })
        console.log(`  + variant ${def.code}`)
    }
}

async function main() {
    assertSampleIsConsistent()
    console.log('FICO sample chart of accounts')
    await seedChartOfAccounts()
    console.log('FICO sample fiscal year variants')
    await seedFiscalVariants()
}

main()
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
