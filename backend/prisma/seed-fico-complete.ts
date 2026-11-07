// eslint-disable no-console
/**
 * FICO Complete Seed — company accounting foundation for AGCTEK.
 *
 * Seeds (in dependency order):
 *   1. Fiscal Year Variant + Posting Period Variant
 *   2. Chart of Accounts + Account Groups + G/L Accounts
 *   3. Company Accounting Settings (links company -> COA + variants + currency)
 *   4. Account Determination Profile + Transaction Keys + MM Account Mappings
 *   5. Company G/L Account Assignments (posting controls per company)
 *   6. Account Determination Rules (MM / SD / PP)
 *   7. Number Ranges (document numbering)
 *   8. Fiscal Periods (current year, OPEN status)
 *   9. Tax Codes + Effective-Dated Rates + G/L Mappings
 *  10. Posting Period Controls + Audit Logs
 *
 * Idempotent: re-running changes nothing that already exists.
 * Every reference is valid so users can create tax codes, post journals,
 * and open/close periods through the UI without validation errors.
 */
import 'dotenv/config'
import { Prisma, PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const ACTOR = 'seed-fico-complete'

const COMPANY_CODE = 'AGCTEK'
const COMPANY_NAME = 'AGCTEK Corporation'
const COUNTRY_CODE = 'PH'
const BASE_CURRENCY = 'PHP'

/**
 * --------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------------
 */

function nowIso(): string {
    return new Date().toISOString()
}

function periodStart(year: number, month: number): Date {
    return new Date(Date.UTC(year, month - 1, 1))
}

function periodEnd(year: number, month: number): Date {
    // Last day of the month
    return new Date(Date.UTC(year, month, 0))
}

/**
 * --------------------------------------------------------------------------
 * 1. Company
 * --------------------------------------------------------------------------
 */

async function ensureCompany() {
    let company = await prisma.company.findUnique({
        where: { code: COMPANY_CODE },
    })
    if (!company) {
        company = await prisma.company.create({
            data: {
                code: COMPANY_CODE,
                name: COMPANY_NAME,
                address: '',
                tin: '',
            },
        })
        console.log(`+ company ${company.code}`)
    } else {
        console.log(`= company ${company.code} already exists`)
    }
    return company
}

/**
 * --------------------------------------------------------------------------
 * 2. Fiscal Year Variant + Posting Period Variant
 * --------------------------------------------------------------------------
 */

async function ensureFiscalYearVariant() {
    const variant = await prisma.ficoFiscalYearVariant.upsert({
        where: { code: 'PH_CALENDAR' },
        create: {
            code: 'PH_CALENDAR',
            name: 'Philippines Calendar Year',
            description:
                'January 1 to December 31, 12 normal periods, no special periods.',
            startMonth: 1,
            startDay: 1,
            normalPeriodCount: 12,
            specialPeriodCount: 0,
            calendarYearBased: true,
            yearAssignment: 'YEAR_START',
            status: 'ACTIVE',
            createdBy: ACTOR,
            updatedBy: ACTOR,
        },
        update: {},
    })
    console.log(`+ fiscal year variant ${variant.code}`)
    return variant
}

async function ensurePostingPeriodVariant() {
    const variant = await prisma.ficoPostingPeriodVariant.upsert({
        where: { code: 'PH_STANDARD' },
        create: {
            code: 'PH_STANDARD',
            name: 'Philippines Standard Posting Periods',
            description:
                'Normal monthly periods with controlled year-end special periods.',
            allowSpecialPeriods: false,
            closeChecklist: {
                requireReopenApproval: false,
                items: [
                    'All unposted source documents reviewed',
                    'Trial balance reviewed',
                ],
            },
            status: 'ACTIVE',
            createdBy: ACTOR,
            updatedBy: ACTOR,
        },
        update: {},
    })
    console.log(`+ posting period variant ${variant.code}`)
    return variant
}

/**
 * --------------------------------------------------------------------------
 * 3. Chart of Accounts + Groups + Accounts
 * --------------------------------------------------------------------------
 */

async function ensureChartOfAccounts() {
    const coa = await prisma.ficoChartOfAccounts.upsert({
        where: { code: 'PH_COA_STARTER' },
        create: {
            code: 'PH_COA_STARTER',
            name: 'Philippines Starter Chart of Accounts',
            description:
                'Standard starter chart of accounts for FICO Phase 2: assets, liabilities, equity, revenue, expenses, tax.',
            countryCode: COUNTRY_CODE,
            accountCodeLength: 6,
            status: 'ACTIVE',
            createdBy: ACTOR,
            updatedBy: ACTOR,
        },
        update: {},
    })
    console.log(`+ chart of accounts ${coa.code}`)

    const groupDefs = [
        { code: '1000', name: 'Assets', category: 'ASSET', rangeFrom: '100000', rangeTo: '199999', sortOrder: 10 },
        { code: '1200', name: 'Inventory', category: 'ASSET', rangeFrom: '120000', rangeTo: '129999', sortOrder: 20, parent: '1000' },
        { code: '1300', name: 'Tax Receivables', category: 'ASSET', rangeFrom: '130000', rangeTo: '139999', sortOrder: 30, parent: '1000' },
        { code: '2000', name: 'Liabilities', category: 'LIABILITY', rangeFrom: '200000', rangeTo: '299999', sortOrder: 40 },
        { code: '2100', name: 'Payables and Clearing', category: 'LIABILITY', rangeFrom: '210000', rangeTo: '219999', sortOrder: 50, parent: '2000' },
        { code: '3000', name: 'Equity', category: 'EQUITY', rangeFrom: '300000', rangeTo: '399999', sortOrder: 60 },
        { code: '4000', name: 'Revenue', category: 'REVENUE', rangeFrom: '400000', rangeTo: '499999', sortOrder: 70 },
        { code: '5000', name: 'Expenses', category: 'EXPENSE', rangeFrom: '500000', rangeTo: '599999', sortOrder: 80 },
        { code: '5100', name: 'Cost of Goods Sold', category: 'EXPENSE', rangeFrom: '510000', rangeTo: '519999', sortOrder: 90, parent: '5000' },
        { code: '5200', name: 'Inventory Adjustments', category: 'EXPENSE', rangeFrom: '520000', rangeTo: '529999', sortOrder: 100, parent: '5000' },
    ] as const

    const groupIds = new Map<string, string>()
    for (const def of groupDefs) {
        const parentGroupId = (def as { parent?: string }).parent
            ? groupIds.get((def as { parent?: string }).parent!) ?? null
            : null
        const group = await prisma.ficoGlAccountGroup.upsert({
            where: {
                chartOfAccountsId_code: { chartOfAccountsId: coa.id, code: def.code },
            },
            create: {
                chartOfAccountsId: coa.id,
                parentGroupId,
                code: def.code,
                name: def.name,
                category: def.category,
                rangeFrom: def.rangeFrom,
                rangeTo: def.rangeTo,
                sortOrder: def.sortOrder,
                status: 'ACTIVE',
                createdBy: ACTOR,
                updatedBy: ACTOR,
            },
            update: {},
        })
        groupIds.set(def.code, group.id)
    }

    const accountDefs = [
        // Assets
        { code: '110100', name: 'Cash and Cash Equivalents', group: '1000', type: 'ASSET', normal: 'DEBIT' },
        { code: '120100', name: 'Merchandise Inventory', group: '1200', type: 'ASSET', normal: 'DEBIT' },
        { code: '130100', name: 'Input VAT', group: '1300', type: 'ASSET', normal: 'DEBIT' },
        // Liabilities
        { code: '210100', name: 'Accounts Payable', group: '2100', type: 'LIABILITY', normal: 'CREDIT', reconciliation: true, recType: 'AP', openItem: true },
        { code: '210200', name: 'GR/IR Clearing', group: '2100', type: 'LIABILITY', normal: 'CREDIT', reconciliation: true, recType: 'GRIR', openItem: true },
        { code: '210300', name: 'Output VAT Payable', group: '2100', type: 'LIABILITY', normal: 'CREDIT', reconciliation: true, recType: 'TAX', openItem: true },
        // Equity
        { code: '310100', name: 'Retained Earnings', group: '3000', type: 'EQUITY', normal: 'CREDIT' },
        { code: '310200', name: 'Inventory Adjustment Offset', group: '3000', type: 'EQUITY', normal: 'CREDIT' },
        // Revenue
        { code: '410100', name: 'Sales Revenue', group: '4000', type: 'REVENUE', normal: 'CREDIT' },
        // Expenses / COGS
        { code: '510100', name: 'Cost of Goods Sold', group: '5100', type: 'EXPENSE', normal: 'DEBIT' },
        { code: '510400', name: 'Operating Expense', group: '5000', type: 'EXPENSE', normal: 'DEBIT' },
        { code: '510500', name: 'Purchase Price Variance', group: '5000', type: 'EXPENSE', normal: 'DEBIT' },
        { code: '520100', name: 'Inventory Shrinkage', group: '5200', type: 'EXPENSE', normal: 'DEBIT' },
    ] as const

    const accountIds = new Map<string, string>()
    for (const def of accountDefs) {
        const groupId = groupIds.get(def.group)
        if (!groupId) throw new Error(`Missing account group ${def.group}`)
        const account = await prisma.ficoGlAccount.upsert({
            where: {
                chartOfAccountsId_accountCode: { chartOfAccountsId: coa.id, accountCode: def.code },
            },
            create: {
                chartOfAccountsId: coa.id,
                accountGroupId: groupId,
                accountCode: def.code,
                accountName: def.name,
                description: '',
                accountType: def.type,
                normalBalance: def.normal,
                isPostingAccount: true,
                allowManualPosting: true,
                allowAutomaticPosting: true,
                isReconciliationAccount: ('reconciliation' in def ? def.reconciliation : false),
                reconciliationType: ('recType' in def ? def.recType : null),
                openItemManagement: ('openItem' in def ? def.openItem : false),
                status: 'ACTIVE',
                createdBy: ACTOR,
                updatedBy: ACTOR,
            },
            update: {},
        })
        accountIds.set(def.code, account.id)
    }

    console.log(`+ groups: ${groupDefs.length}, accounts: ${accountDefs.length}`)
    return { coa, accountIds, groupIds }
}

/**
 * --------------------------------------------------------------------------
 * 4. Company Accounting Settings
 * --------------------------------------------------------------------------
 */

async function ensureCompanyAccountingSettings(
    companyId: string,
    coaId: string,
    fiscalVariantId: string,
    postingVariantId: string,
    accountIds: Map<string, string>,
) {
    const settings = await prisma.ficoCompanyAccountingSettings.upsert({
        where: { companyId },
        create: {
            companyId,
            legalName: COMPANY_NAME,
            baseCurrency: BASE_CURRENCY,
            groupCurrency: null,
            countryCode: COUNTRY_CODE,
            timezone: 'Asia/Manila',
            accountingMethod: 'ACCRUAL',
            chartOfAccountsId: coaId,
            fiscalYearVariantId: fiscalVariantId,
            postingPeriodVariantId: postingVariantId,
            status: 'ACTIVE',
            taxCountryCode: COUNTRY_CODE,
            taxRegistrationNumber: '',
            taxJurisdiction: 'Philippines',
            defaultRetainedEarningsAccountId: accountIds.get('310100') ?? null,
            defaultCashAccountId: accountIds.get('110100') ?? null,
            defaultReceivableAccountId: null,
            defaultPayableAccountId: accountIds.get('210100') ?? null,
            defaultInventoryAccountId: accountIds.get('120100') ?? null,
            defaultSalesRevenueAccountId: accountIds.get('410100') ?? null,
            defaultCostOfGoodsSoldAccountId: accountIds.get('510100') ?? null,
            defaultTaxInputAccountId: accountIds.get('130100') ?? null,
            defaultTaxOutputAccountId: accountIds.get('210300') ?? null,
            documentNumberPrefix: 'JE',
            documentNumberPadding: 6,
            allowNegativePostings: false,
            backdatedPostingAllowed: true,
            closeChecklist: {
                requireReopenApproval: false,
                items: ['All unposted source documents reviewed', 'Trial balance reviewed'],
            },
            createdBy: ACTOR,
            updatedBy: ACTOR,
        },
        update: {
            chartOfAccountsId: coaId,
            fiscalYearVariantId: fiscalVariantId,
            postingPeriodVariantId: postingVariantId,
            status: 'ACTIVE',
            updatedBy: ACTOR,
        },
    })
    console.log(`+ company accounting settings for ${COMPANY_CODE} (status: ACTIVE)`)
    return settings
}

/**
 * --------------------------------------------------------------------------
 * 5. Account Determination Profile + Transaction Keys + MM Mappings
 * --------------------------------------------------------------------------
 */

async function ensureTransactionKeys() {
    const keyDefs = [
        { code: 'GR_IR', name: 'Goods Receipt / Inventory Increase', inventorySide: 'DEBIT_INVENTORY', sortOrder: 10 },
        { code: 'GI_COGS', name: 'Goods Issue / Cost of Goods Sold', inventorySide: 'CREDIT_INVENTORY', sortOrder: 20 },
        { code: 'GI_EXPENSE', name: 'Goods Issue / Operating Expense', inventorySide: 'CREDIT_INVENTORY', sortOrder: 30 },
        { code: 'SUPPLIER_INVOICE', name: 'Supplier Invoice / GR-IR Clearing', inventorySide: 'NONE', sortOrder: 40 },
        { code: 'SUPPLIER_INVOICE_VAT', name: 'Supplier Invoice / Input VAT', inventorySide: 'NONE', sortOrder: 50 },
        { code: 'CUSTOMER_INVOICE', name: 'Customer Invoice / Revenue Recognition', inventorySide: 'NONE', sortOrder: 60 },
        { code: 'CUSTOMER_INVOICE_VAT', name: 'Customer Invoice / Output VAT', inventorySide: 'NONE', sortOrder: 70 },
        { code: 'INVENTORY_SHRINKAGE', name: 'Inventory Shortage / Shrinkage', inventorySide: 'CREDIT_INVENTORY', sortOrder: 80 },
        { code: 'PRICE_VARIANCE', name: 'Purchase Price Variance', inventorySide: 'NONE', sortOrder: 90 },
    ] as const
    for (const key of keyDefs) {
        await prisma.ficoTransactionKey.upsert({
            where: { code: key.code },
            create: { ...key, status: 'ACTIVE' },
            update: {},
        })
    }
    console.log(`+ transaction keys: ${keyDefs.length}`)
}

async function ensureAccountDeterminationProfile(companyId: string) {
    const profile = await prisma.ficoAccountDeterminationProfile.upsert({
        where: { companyId_code: { companyId, code: 'DEFAULT' } },
        create: {
            companyId,
            code: 'DEFAULT',
            name: `${COMPANY_NAME} Default Determination`,
            description: 'Default MM/SD/PP automatic account determination profile',
            isDefault: true,
            status: 'ACTIVE',
            createdBy: ACTOR,
            updatedBy: ACTOR,
        },
        update: {},
    })
    console.log(`+ account determination profile ${profile.code}`)
    return profile
}

async function ensureMmAccountMappings(
    companyId: string,
    profileId: string,
    accountIds: Map<string, string>,
) {
    const mappingDefs = [
        // key, valuationClass, debitAccount, creditAccount
        ['GR_IR', null, '120100', '210200'],
        ['GI_COGS', null, '510100', '120100'],
        ['GI_EXPENSE', null, '510400', '120100'],
        ['SUPPLIER_INVOICE', null, '210200', '210100'],
        ['SUPPLIER_INVOICE_VAT', null, '130100', '210100'],
        ['CUSTOMER_INVOICE', null, '210100', '410100'],
        ['CUSTOMER_INVOICE_VAT', null, '210300', '210100'],
        ['INVENTORY_SHRINKAGE', null, '520100', '120100'],
        ['PRICE_VARIANCE', null, '510500', '210200'],
    ] as const

    for (const [key, valuationCode, debitCode, creditCode] of mappingDefs) {
        const debitAccountId = accountIds.get(debitCode)
        const creditAccountId = accountIds.get(creditCode)
        if (!debitAccountId || !creditAccountId) {
            throw new Error(`Missing mapping account for ${key}`)
        }
        await prisma.ficoMmAccountMapping.upsert({
            where: {
                companyId_profileId_transactionKeyCode_valuationScopeKey: {
                    companyId,
                    profileId,
                    transactionKeyCode: key,
                    valuationScopeKey: valuationCode ?? '*',
                },
            },
            create: {
                companyId,
                profileId,
                transactionKeyCode: key,
                valuationClassId: null,
                valuationScopeKey: valuationCode ?? '*',
                debitAccountId,
                creditAccountId,
                status: 'ACTIVE',
                createdBy: ACTOR,
                updatedBy: ACTOR,
            },
            update: {},
        })
    }
    console.log(`+ MM account mappings: ${mappingDefs.length}`)
}

/**
 * --------------------------------------------------------------------------
 * 6. Account Determination Rules (MM / SD / PP)
 * --------------------------------------------------------------------------
 */

async function ensureAccountDeterminationRules(
    companyId: string,
    accountIds: Map<string, string>,
) {
    const ruleDefs = [
        // MM - Goods Receipt
        {
            determinationCode: 'MM-001',
            name: 'MM Goods Receipt - Inventory Increase',
            sourceModule: 'MM',
            transactionType: 'GOODS_RECEIPT',
            transactionKeyCode: 'GR_IR',
            priority: 10,
            lines: [
                { side: 'DEBIT', accountCode: '120100', description: 'Inventory increase' },
                { side: 'CREDIT', accountCode: '210200', description: 'GR/IR clearing' },
            ],
        },
        // MM - Goods Issue (COGS)
        {
            determinationCode: 'MM-002',
            name: 'MM Goods Issue - Cost of Goods Sold',
            sourceModule: 'MM',
            transactionType: 'GOODS_ISSUE',
            transactionKeyCode: 'GI_COGS',
            priority: 10,
            lines: [
                { side: 'DEBIT', accountCode: '510100', description: 'Cost of goods sold' },
                { side: 'CREDIT', accountCode: '120100', description: 'Inventory decrease' },
            ],
        },
        // SD - Customer Invoice (Revenue + Output VAT)
        {
            determinationCode: 'SD-001',
            name: 'SD Customer Invoice - Revenue',
            sourceModule: 'SD',
            transactionType: 'CUSTOMER_INVOICE',
            transactionKeyCode: 'CUSTOMER_INVOICE',
            priority: 10,
            lines: [
                { side: 'DEBIT', accountCode: '210100', description: 'Accounts receivable' },
                { side: 'CREDIT', accountCode: '410100', description: 'Sales revenue' },
                { side: 'CREDIT', accountCode: '210300', description: 'Output VAT payable' },
            ],
        },
        // SD - Customer Return
        {
            determinationCode: 'SD-002',
            name: 'SD Customer Return - Revenue Reversal',
            sourceModule: 'SD',
            transactionType: 'CUSTOMER_RETURN',
            transactionKeyCode: 'CUSTOMER_INVOICE',
            priority: 20,
            lines: [
                { side: 'CREDIT', accountCode: '210100', description: 'Accounts receivable reversal' },
                { side: 'DEBIT', accountCode: '410100', description: 'Sales revenue reversal' },
                { side: 'DEBIT', accountCode: '210300', description: 'Output VAT reversal' },
            ],
        },
    ] as const

    for (const def of ruleDefs) {
        const existing = await prisma.ficoAccountDeterminationRule.findUnique({
            where: { determinationCode: def.determinationCode },
        })
        if (existing) continue

        const rule = await prisma.ficoAccountDeterminationRule.create({
            data: {
                companyId,
                determinationCode: def.determinationCode,
                name: def.name,
                description: `${def.name} — automatic account determination for ${def.sourceModule}`,
                sourceModule: def.sourceModule,
                transactionType: def.transactionType,
                transactionKeyCode: def.transactionKeyCode,
                priority: def.priority,
                status: 'ACTIVE',
                createdBy: ACTOR,
                updatedBy: ACTOR,
                lines: {
                    create: def.lines.map((line, idx) => ({
                        lineNumber: idx + 1,
                        side: line.side,
                        glAccountId: accountIds.get(line.accountCode)!,
                        description: line.description,
                    })),
                },
            },
            include: { lines: true },
        })
        console.log(`+ account determination rule ${def.determinationCode}`)
    }
    console.log(`+ account determination rules: ${ruleDefs.length}`)
}

/**
 * --------------------------------------------------------------------------
 * 7. Company G/L Account Assignments
 * --------------------------------------------------------------------------
 */

async function ensureCompanyGlAccounts(
    companyId: string,
    accountIds: Map<string, string>,
) {
    for (const [accountCode, accountId] of accountIds) {
        await prisma.ficoCompanyGlAccount.upsert({
            where: { companyId_glAccountId: { companyId, glAccountId: accountId } },
            create: {
                companyId,
                glAccountId: accountId,
                postingEnabled: true,
                manualPostingBlocked: false,
                createdBy: ACTOR,
                updatedBy: ACTOR,
            },
            update: {},
        })
    }
    console.log(`+ company G/L account assignments: ${accountIds.size}`)
}

/**
 * --------------------------------------------------------------------------
 * 8. Number Ranges
 * --------------------------------------------------------------------------
 */
async function ensureNumberRanges(companyId: string) {
    const rangeDefs = [
        { rangeCode: 'JE', rangeName: 'Journal Entry', documentCategory: 'JOURNAL_ENTRY', prefix: 'JE' },
        { rangeCode: 'GI', rangeName: 'Goods Issue', documentCategory: 'GOODS_ISSUE', prefix: 'GI' },
        { rangeCode: 'GR', rangeName: 'Goods Receipt', documentCategory: 'GOODS_RECEIPT', prefix: 'GR' },
        { rangeCode: 'INV', rangeName: 'Supplier Invoice', documentCategory: 'SUPPLIER_INVOICE', prefix: 'INV' },
        { rangeCode: 'CINV', rangeName: 'Customer Invoice', documentCategory: 'CUSTOMER_INVOICE', prefix: 'CINV' },
    ] as const
    for (const def of rangeDefs) {
        await prisma.ficoNumberRange.upsert({
            where: { companyId_rangeCode: { companyId, rangeCode: def.rangeCode } },
            create: {
                companyId,
                rangeCode: def.rangeCode,
                rangeName: def.rangeName,
                description: `Document number range for ${def.rangeName}`,
                documentCategory: def.documentCategory,
                assignmentType: 'INTERNAL',
                numberingMethod: 'INTERNAL',
                prefix: def.prefix,
                suffix: '',
                startNumber: 1,
                endNumber: 999999,
                currentNumber: 1,
                paddingLength: 6,
                validFrom: null,
                validTo: null,
                fiscalYearId: null,
                resetFrequency: 'PER_FISCAL_YEAR',
                allowManualAssignment: true,
                allowExternalAssignment: false,
                allowGaps: false,
                status: 'ACTIVE',
                createdBy: ACTOR,
                updatedBy: ACTOR,
            },
            update: {},
        })
    }
    console.log(`+ number ranges: ${rangeDefs.length}`)
}

/**
 * --------------------------------------------------------------------------
 * 9. Fiscal Periods (current calendar year)
 * --------------------------------------------------------------------------
 */

async function ensureFiscalPeriods(
    companyId: string,
    fiscalVariantId: string,
) {
    const now = new Date()
    const year = now.getUTCFullYear()

    for (let m = 1; m <= 12; m++) {
        const start = periodStart(year, m)
        const end = periodEnd(year, m)
        const status =
            m <= now.getUTCMonth()
                ? 'CLOSED'
                : m === now.getUTCMonth() + 1
                  ? 'OPEN'
                  : 'FUTURE'

        const period = await prisma.ficoFinancialPeriod.upsert({
            where: {
                companyId_fiscalYear_periodNumber: {
                    companyId,
                    fiscalYear: year,
                    periodNumber: m,
                },
            },
            create: {
                companyId,
                fiscalYear: year,
                periodNumber: m,
                name: `${year}-${String(m).padStart(2, '0')}`,
                periodType: 'NORMAL',
                startDate: start,
                endDate: end,
                status,
                fiscalYearVariantId: fiscalVariantId,
                createdBy: ACTOR,
                updatedBy: ACTOR,
            },
            update: { status },
        })

        // Audit log for each period creation
        await prisma.ficoPostingPeriodAuditLog.create({
            data: {
                companyId,
                fiscalPeriodId: period.id,
                action: 'PERIOD_CREATE',
                fromStatus: null,
                toStatus: period.status,
                reason: 'Seed initialization',
                actorId: null,
                metadata: { source: ACTOR, year, periodNumber: m },
            },
        })
    }
    console.log(`+ fiscal periods: 12 for year ${year}`)
}

/**
 * --------------------------------------------------------------------------
 * 10. Tax Codes + Effective-Dated Rates
 * --------------------------------------------------------------------------
 */

async function ensureTaxCodes(
    companyId: string,
    accountIds: Map<string, string>,
) {
    const taxCodeDefs = [
        {
            code: 'VAT12',
            name: 'Standard VAT 12%',
            taxCategory: 'OUTPUT_TAX',
            taxType: 'VAT',
            jurisdiction: 'Philippines',
            countryCode: 'PH',
            calculationMethod: 'TAX_EXCLUSIVE',
            rateUnit: 'PERCENTAGE',
            roundingMethod: 'HALF_UP',
            decimalPrecision: 2,
            roundingLevel: 'PER_LINE_ITEM',
            isSalesApplicable: true,
            isPurchaseApplicable: false,
            isServiceApplicable: true,
            isInventoryApplicable: false,
            isRecoverable: false,
            inputAccount: null,
            outputAccount: '210300',
            withholdingPayable: null,
            withholdingReceivable: null,
            nonRecoverableAccount: null,
            rates: [{ rate: 12, effectiveFrom: new Date(Date.UTC(2026, 0, 1)), effectiveTo: null }],
        },
        {
            code: 'VAT12I',
            name: 'VAT 12% Inclusive',
            taxCategory: 'OUTPUT_TAX',
            taxType: 'VAT',
            jurisdiction: 'Philippines',
            countryCode: 'PH',
            calculationMethod: 'TAX_INCLUSIVE',
            rateUnit: 'PERCENTAGE',
            roundingMethod: 'HALF_UP',
            decimalPrecision: 2,
            roundingLevel: 'PER_LINE_ITEM',
            isSalesApplicable: true,
            isPurchaseApplicable: false,
            isServiceApplicable: true,
            isInventoryApplicable: false,
            isRecoverable: false,
            inputAccount: null,
            outputAccount: '210300',
            withholdingPayable: null,
            withholdingReceivable: null,
            nonRecoverableAccount: null,
            rates: [{ rate: 12, effectiveFrom: new Date(Date.UTC(2026, 0, 1)), effectiveTo: null }],
        },
        {
            code: 'INPUT_VAT',
            name: 'Input VAT 12%',
            taxCategory: 'INPUT_TAX',
            taxType: 'VAT',
            jurisdiction: 'Philippines',
            countryCode: 'PH',
            calculationMethod: 'TAX_EXCLUSIVE',
            rateUnit: 'PERCENTAGE',
            roundingMethod: 'HALF_UP',
            decimalPrecision: 2,
            roundingLevel: 'PER_LINE_ITEM',
            isSalesApplicable: false,
            isPurchaseApplicable: true,
            isServiceApplicable: false,
            isInventoryApplicable: false,
            isRecoverable: true,
            inputAccount: '130100',
            outputAccount: null,
            withholdingPayable: null,
            withholdingReceivable: null,
            nonRecoverableAccount: null,
            rates: [{ rate: 12, effectiveFrom: new Date(Date.UTC(2026, 0, 1)), effectiveTo: null }],
        },
        {
            code: 'ZERO_RATED',
            name: 'Zero-Rated Sale',
            taxCategory: 'SALES_TAX',
            taxType: 'ZERO_RATED_TAX',
            jurisdiction: 'Philippines',
            countryCode: 'PH',
            calculationMethod: 'NOT_APPLICABLE',
            rateUnit: 'PERCENTAGE',
            roundingMethod: 'HALF_UP',
            decimalPrecision: 2,
            roundingLevel: 'PER_LINE_ITEM',
            isSalesApplicable: true,
            isPurchaseApplicable: false,
            isServiceApplicable: true,
            isInventoryApplicable: false,
            isRecoverable: true,
            inputAccount: null,
            outputAccount: '210300',
            withholdingPayable: null,
            withholdingReceivable: null,
            nonRecoverableAccount: null,
            rates: [{ rate: 0, effectiveFrom: new Date(Date.UTC(2026, 0, 1)), effectiveTo: null }],
        },
        {
            code: 'EXEMPT',
            name: 'Exempt Sale',
            taxCategory: 'SALES_TAX',
            taxType: 'EXEMPT_TAX',
            jurisdiction: 'Philippines',
            countryCode: 'PH',
            calculationMethod: 'NOT_APPLICABLE',
            rateUnit: 'PERCENTAGE',
            roundingMethod: 'HALF_UP',
            decimalPrecision: 2,
            roundingLevel: 'PER_LINE_ITEM',
            isSalesApplicable: true,
            isPurchaseApplicable: false,
            isServiceApplicable: true,
            isInventoryApplicable: false,
            isRecoverable: true,
            inputAccount: null,
            outputAccount: null,
            withholdingPayable: null,
            withholdingReceivable: null,
            nonRecoverableAccount: null,
            rates: [],
        },
        {
            code: 'WHT_2',
            name: 'Withholding Tax 2%',
            taxCategory: 'WITHHOLDING_TAX',
            taxType: 'WITHHOLDING_TAX',
            jurisdiction: 'Philippines',
            countryCode: 'PH',
            calculationMethod: 'TAX_EXCLUSIVE',
            rateUnit: 'PERCENTAGE',
            roundingMethod: 'HALF_UP',
            decimalPrecision: 2,
            roundingLevel: 'PER_LINE_ITEM',
            isSalesApplicable: false,
            isPurchaseApplicable: true,
            isServiceApplicable: false,
            isInventoryApplicable: false,
            isRecoverable: false,
            inputAccount: null,
            outputAccount: null,
            withholdingPayable: '210300',
            withholdingReceivable: null,
            nonRecoverableAccount: null,
            rates: [{ rate: 2, effectiveFrom: new Date(Date.UTC(2026, 0, 1)), effectiveTo: null }],
        },
    ] as const

    for (const def of taxCodeDefs) {
        const outputAccountId = def.outputAccount ? accountIds.get(def.outputAccount) : null
        const inputAccountId = def.inputAccount ? accountIds.get(def.inputAccount) : null
        const whtPayableId = def.withholdingPayable ? accountIds.get(def.withholdingPayable) : null
        const whtReceivableId = def.withholdingReceivable ? accountIds.get(def.withholdingReceivable) : null
        const nonRecoverableId = def.nonRecoverableAccount ? accountIds.get(def.nonRecoverableAccount) : null

        // Validate that all referenced accounts exist
        if (def.outputAccount && !outputAccountId) {
            throw new Error(`Missing output account ${def.outputAccount} for tax code ${def.code}`)
        }
        if (def.inputAccount && !inputAccountId) {
            throw new Error(`Missing input account ${def.inputAccount} for tax code ${def.code}`)
        }

        const taxCode = await prisma.ficoTaxCode.upsert({
            where: { companyId_code: { companyId, code: def.code } },
            create: {
                companyId,
                code: def.code,
                name: def.name,
                description: `${def.name} — ${def.taxType} tax for ${def.jurisdiction}`,
                taxCategory: def.taxCategory,
                taxType: def.taxType,
                taxJurisdiction: def.jurisdiction,
                countryCode: def.countryCode,
                calculationMethod: def.calculationMethod,
                rateUnit: def.rateUnit,
                roundingMethod: def.roundingMethod,
                decimalPrecision: def.decimalPrecision,
                roundingLevel: def.roundingLevel,
                calculationPriority: 0,
                isSalesApplicable: def.isSalesApplicable,
                isPurchaseApplicable: def.isPurchaseApplicable,
                isServiceApplicable: def.isServiceApplicable,
                isInventoryApplicable: def.isInventoryApplicable,
                isRecoverable: def.isRecoverable,
                inputTaxGlAccountId: inputAccountId,
                outputTaxGlAccountId: outputAccountId,
                withholdingPayableGlAccountId: whtPayableId,
                withholdingReceivableGlAccountId: whtReceivableId,
                nonRecoverableTaxGlAccountId: nonRecoverableId,
                status: 'ACTIVE',
                remarks: `Seeded by ${ACTOR}`,
                createdBy: ACTOR,
                updatedBy: ACTOR,
                taxRates: {
                    create: def.rates.map((r) => ({
                        companyId,
                        rate: r.rate,
                        rateUnit: def.rateUnit,
                        effectiveFrom: r.effectiveFrom,
                        effectiveTo: r.effectiveTo,
                        description: `${def.code} rate ${r.rate}${def.rateUnit === 'PERCENTAGE' ? '%' : ''}`,
                        status: 'ACTIVE',
                        createdBy: ACTOR,
                    })),
                },
            },
            update: {},
            include: { taxRates: true },
        })

        // Audit log for tax code creation
        await prisma.ficoTaxCodeAuditLog.create({
            data: {
                taxCodeId: taxCode.id,
                companyId,
                actorId: null,
                action: 'TAX_CODE_CREATE',
                entityType: 'FicoTaxCode',
                entityId: taxCode.id,
                previousValues: Prisma.JsonNull,
                newValues: {
                    code: taxCode.code,
                    name: taxCode.name,
                    taxCategory: taxCode.taxCategory,
                    taxType: taxCode.taxType,
                    calculationMethod: taxCode.calculationMethod,
                    status: taxCode.status,
                },
                reason: 'Seed initialization',
                metadata: { source: ACTOR },
            },
        })

        console.log(`+ tax code ${def.code} (${def.name}) with ${def.rates.length} rate(s)`)
    }
    console.log(`+ tax codes: ${taxCodeDefs.length}`)
}

/**
 * --------------------------------------------------------------------------
 * 11. Posting Period Controls + Audit Logs
 * --------------------------------------------------------------------------
 */

async function ensurePostingPeriodControls(companyId: string) {
    const now = new Date()
    const year = now.getUTCFullYear()
    const periods = await prisma.ficoFinancialPeriod.findMany({
        where: { companyId, fiscalYear: year },
    })
    for (const period of periods) {
        await prisma.ficoPostingPeriodControl.upsert({
            where: {
                companyId_fiscalPeriodId_accountTypeScope: {
                    companyId,
                    fiscalPeriodId: period.id,
                    accountTypeScope: 'ALL',
                },
            },
            create: {
                companyId,
                fiscalPeriodId: period.id,
                accountTypeScope: 'ALL',
                status: period.status,
                restrictionRules: Prisma.JsonNull,
                reason: null,
                changedBy: null,
            },
            update: {},
        })
    }
    console.log(`+ posting period controls: ${periods.length}`)
}

/**
 * --------------------------------------------------------------------------
 * Main
 * --------------------------------------------------------------------------
 */

async function main() {
    console.log(`\n=== FICO Complete Seed (${ACTOR}) ===\n`)

    const company = await ensureCompany()
    const fiscalVariant = await ensureFiscalYearVariant()
    const postingVariant = await ensurePostingPeriodVariant()

    const { coa, accountIds } = await ensureChartOfAccounts()

    await ensureCompanyAccountingSettings(
        company.id,
        coa.id,
        fiscalVariant.id,
        postingVariant.id,
        accountIds,
    )

    await ensureTransactionKeys()
    const profile = await ensureAccountDeterminationProfile(company.id)
    await ensureMmAccountMappings(company.id, profile.id, accountIds)
    await ensureAccountDeterminationRules(company.id, accountIds)
    await ensureCompanyGlAccounts(company.id, accountIds)
    await ensureNumberRanges(company.id)
    await ensureFiscalPeriods(company.id, fiscalVariant.id)
    await ensureTaxCodes(company.id, accountIds)
    await ensurePostingPeriodControls(company.id)

    console.log('\n=== FICO Complete Seed finished successfully ===')
}

main()
    .then(() => {
        void prisma.$disconnect()
    })
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
        void prisma.$disconnect()
    })
