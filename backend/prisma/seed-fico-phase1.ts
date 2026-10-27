/* eslint-disable no-console */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const FICO_RESOURCES = [
    'fico.overview',
    'fico.company-settings',
    'fico.chart-of-accounts',
    'fico.gl-accounts',
    'fico.periods',
    'fico.period-reopen',
    'fico.period-unlock',
    'fico.account-determination',
    'fico.journal-entries',
    'fico.journal-reversal',
    'fico.reports',
    'fico.audit',
    'fico.configuration',
]

async function main() {
    const company = await prisma.company.findFirst({
        where: { code: 'AGCTEK' },
    })
    if (!company) throw new Error('AGCTEK company not found')

    const fiscalVariant = await prisma.ficoFiscalYearVariant.upsert({
        where: { code: 'PH_CALENDAR' },
        create: {
            code: 'PH_CALENDAR',
            name: 'Philippines Calendar Year',
            description:
                'January 1 to December 31, 12 normal periods and up to 4 year-end special periods.',
            startMonth: 1,
            startDay: 1,
            normalPeriodCount: 12,
            specialPeriodCount: 4,
            calendarYearBased: true,
            status: 'ACTIVE',
            createdBy: 'seed-fico-phase1',
            updatedBy: 'seed-fico-phase1',
        },
        update: {},
    })

    const postingVariant = await prisma.ficoPostingPeriodVariant.upsert({
        where: { code: 'PH_STANDARD' },
        create: {
            code: 'PH_STANDARD',
            name: 'Philippines Standard Posting Periods',
            description:
                'Normal monthly periods with controlled year-end special periods.',
            allowSpecialPeriods: true,
            closeChecklist: {
                requireReopenApproval: false,
                items: [
                    'All unposted source documents reviewed',
                    'GR/IR clearing reviewed (balances alone do not block closing)',
                    'Trial balance reviewed',
                ],
            },
            status: 'ACTIVE',
            createdBy: 'seed-fico-phase1',
            updatedBy: 'seed-fico-phase1',
        },
        update: {},
    })

    const transactionKeyDefs = [
        {
            code: 'GR_IR',
            name: 'Goods Receipt / Inventory Increase',
            description:
                'Debit inventory and credit GR/IR clearing when goods are received.',
            requiresValuationClass: true,
            inventorySide: 'DEBIT_INVENTORY',
            sortOrder: 10,
        },
        {
            code: 'GI_COGS',
            name: 'Goods Issue / Cost of Goods Sold',
            description:
                'Debit cost of goods sold and credit inventory at controlled goods issue.',
            requiresValuationClass: true,
            inventorySide: 'CREDIT_INVENTORY',
            sortOrder: 20,
        },
        {
            code: 'GI_EXPENSE',
            name: 'Goods Issue / Operating Expense',
            description:
                'Debit operating expense and credit inventory for non-sales issues.',
            requiresValuationClass: true,
            inventorySide: 'CREDIT_INVENTORY',
            sortOrder: 30,
        },
        {
            code: 'SUPPLIER_INVOICE',
            name: 'Supplier Invoice / GR-IR Clearing',
            description:
                'Debit GR/IR clearing and credit accounts payable for a supplier invoice.',
            requiresValuationClass: false,
            inventorySide: 'NONE',
            sortOrder: 40,
        },
        {
            code: 'SUPPLIER_INVOICE_VAT',
            name: 'Supplier Invoice / Input VAT',
            description: 'Optional input VAT debit against accounts payable.',
            requiresValuationClass: false,
            inventorySide: 'NONE',
            sortOrder: 50,
        },
        {
            code: 'INVENTORY_SHRINKAGE',
            name: 'Inventory Shortage / Shrinkage',
            description: 'Debit shrinkage expense and credit inventory.',
            requiresValuationClass: true,
            inventorySide: 'CREDIT_INVENTORY',
            sortOrder: 60,
        },
        {
            code: 'INVENTORY_INCREASE_ADJ',
            name: 'Inventory Increase Adjustment',
            description:
                'Debit inventory and credit a separate approved adjustment offset.',
            requiresValuationClass: true,
            inventorySide: 'DEBIT_INVENTORY',
            sortOrder: 70,
        },
        {
            code: 'PRICE_VARIANCE',
            name: 'Purchase Price Variance',
            description: 'Optional purchase price variance account pair.',
            requiresValuationClass: false,
            inventorySide: 'NONE',
            sortOrder: 80,
        },
        {
            code: 'LANDED_COST',
            name: 'Landed Cost Capitalization',
            description: 'Optional landed-cost capitalization into inventory.',
            requiresValuationClass: true,
            inventorySide: 'DEBIT_INVENTORY',
            sortOrder: 90,
        },
    ]

    for (const key of transactionKeyDefs) {
        await prisma.ficoTransactionKey.upsert({
            where: { code: key.code },
            create: {
                ...key,
                status: 'ACTIVE',
            },
            update: {},
        })
    }

    const valuationClass = await prisma.mmValuationClass.upsert({
        where: { code: 'TRADING' },
        create: { code: 'TRADING', name: 'Trading Goods' },
        update: {},
    })
    await prisma.mmValuationClass.upsert({
        where: { code: 'RAW_MATERIAL' },
        create: { code: 'RAW_MATERIAL', name: 'Raw Materials' },
        update: {},
    })
    await prisma.mmValuationClass.upsert({
        where: { code: 'FINISHED_GOOD' },
        create: { code: 'FINISHED_GOOD', name: 'Finished Goods' },
        update: {},
    })

    const coa = await prisma.ficoChartOfAccounts.upsert({
        where: { code: 'PH_MM_STARTER' },
        create: {
            code: 'PH_MM_STARTER',
            name: 'Philippines MM Starter Chart of Accounts',
            description:
                'Reviewable Phase 1 starter chart of accounts for inventory, GR/IR, COGS, and adjustments.',
            countryCode: 'PH',
            status: 'ACTIVE',
            createdBy: 'seed-fico-phase1',
            updatedBy: 'seed-fico-phase1',
        },
        update: {},
    })

    const groupDefs = [
        ['1000', 'Assets', 'ASSET', null, 10],
        ['1200', 'Inventory', 'ASSET', '1000', 20],
        ['1300', 'Tax Receivables', 'ASSET', '1000', 30],
        ['2000', 'Liabilities', 'LIABILITY', null, 40],
        ['2100', 'Payables and Clearing', 'LIABILITY', '2000', 50],
        ['3000', 'Equity', 'EQUITY', null, 60],
        ['4000', 'Revenue', 'REVENUE', null, 70],
        ['5000', 'Expenses', 'EXPENSE', null, 80],
        ['5100', 'Cost of Goods Sold', 'EXPENSE', '5000', 90],
        ['5200', 'Inventory Adjustments', 'EXPENSE', '5000', 100],
    ] as const
    const groups = new Map<string, string>()
    for (const [code, name, category, parentCode, sortOrder] of groupDefs) {
        const parentGroupId = parentCode ? groups.get(parentCode) ?? null : null
        const group = await prisma.ficoGlAccountGroup.upsert({
            where: {
                chartOfAccountsId_code: {
                    chartOfAccountsId: coa.id,
                    code,
                },
            },
            create: {
                chartOfAccountsId: coa.id,
                parentGroupId,
                code,
                name,
                category,
                sortOrder,
                status: 'ACTIVE',
                createdBy: 'seed-fico-phase1',
                updatedBy: 'seed-fico-phase1',
            },
            update: {},
        })
        groups.set(code, group.id)
    }

    const accountDefs = [
        {
            code: '110100',
            name: 'Cash and Cash Equivalents',
            group: '1000',
            type: 'ASSET',
            normal: 'DEBIT',
        },
        {
            code: '120100',
            name: 'Merchandise Inventory',
            group: '1200',
            type: 'ASSET',
            normal: 'DEBIT',
        },
        {
            code: '130100',
            name: 'Input VAT',
            group: '1300',
            type: 'ASSET',
            normal: 'DEBIT',
        },
        {
            code: '210100',
            name: 'Accounts Payable',
            group: '2100',
            type: 'LIABILITY',
            normal: 'CREDIT',
            reconciliation: true,
            reconciliationType: 'AP',
            openItem: true,
        },
        {
            code: '210200',
            name: 'GR/IR Clearing',
            group: '2100',
            type: 'LIABILITY',
            normal: 'CREDIT',
            reconciliation: true,
            reconciliationType: 'GRIR',
            openItem: true,
        },
        {
            code: '310100',
            name: 'Retained Earnings',
            group: '3000',
            type: 'EQUITY',
            normal: 'CREDIT',
        },
        {
            code: '310200',
            name: 'Inventory Adjustment Offset',
            group: '3000',
            type: 'EQUITY',
            normal: 'CREDIT',
        },
        {
            code: '410100',
            name: 'Sales Revenue',
            group: '4000',
            type: 'REVENUE',
            normal: 'CREDIT',
        },
        {
            code: '510100',
            name: 'Cost of Goods Sold',
            group: '5100',
            type: 'EXPENSE',
            normal: 'DEBIT',
        },
        {
            code: '510400',
            name: 'Operating Expense',
            group: '5000',
            type: 'EXPENSE',
            normal: 'DEBIT',
        },
        {
            code: '510500',
            name: 'Purchase Price Variance',
            group: '5000',
            type: 'EXPENSE',
            normal: 'DEBIT',
        },
        {
            code: '520100',
            name: 'Inventory Shrinkage',
            group: '5200',
            type: 'EXPENSE',
            normal: 'DEBIT',
        },
    ] as const

    const accounts = new Map<string, string>()
    for (const def of accountDefs) {
        const groupId = groups.get(def.group)
        if (!groupId) throw new Error(`Missing account group ${def.group}`)
        const account = await prisma.ficoGlAccount.upsert({
            where: {
                chartOfAccountsId_accountCode: {
                    chartOfAccountsId: coa.id,
                    accountCode: def.code,
                },
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
                isReconciliationAccount: 'reconciliation' in def ? def.reconciliation : false,
                reconciliationType:
                    'reconciliationType' in def ? def.reconciliationType : null,
                openItemManagement: 'openItem' in def ? def.openItem : false,
                status: 'ACTIVE',
                createdBy: 'seed-fico-phase1',
                updatedBy: 'seed-fico-phase1',
            },
            update: {},
        })
        accounts.set(def.code, account.id)
    }

    let settings = await prisma.ficoCompanyAccountingSettings.findUnique({
        where: { companyId: company.id },
    })
    if (!settings) {
        settings = await prisma.ficoCompanyAccountingSettings.create({
            data: {
                companyId: company.id,
                legalName: company.name,
                baseCurrency: 'PHP',
                countryCode: 'PH',
                timezone: 'Asia/Manila',
                accountingMethod: 'ACCRUAL',
                chartOfAccountsId: coa.id,
                fiscalYearVariantId: fiscalVariant.id,
                postingPeriodVariantId: postingVariant.id,
                status: 'DRAFT',
                taxCountryCode: 'PH',
                taxRegistrationNumber: company.tin || null,
                taxJurisdiction: 'Philippines',
                defaultTaxCode: null,
                documentNumberPrefix: 'JE',
                documentNumberPadding: 6,
                createdBy: 'seed-fico-phase1',
                updatedBy: 'seed-fico-phase1',
            },
        })
    } else {
        const patch: Record<string, unknown> = {}
        if (!settings.chartOfAccountsId) patch.chartOfAccountsId = coa.id
        if (!settings.fiscalYearVariantId) patch.fiscalYearVariantId = fiscalVariant.id
        if (!settings.postingPeriodVariantId) patch.postingPeriodVariantId = postingVariant.id
        if (!settings.legalName) patch.legalName = company.name
        if (!settings.taxCountryCode) patch.taxCountryCode = 'PH'
        if (Object.keys(patch).length) {
            settings = await prisma.ficoCompanyAccountingSettings.update({
                where: { companyId: company.id },
                data: { ...patch, updatedBy: 'seed-fico-phase1' },
            })
        }
    }

    let profile = settings.accountDeterminationProfileId
        ? await prisma.ficoAccountDeterminationProfile.findUnique({
              where: { id: settings.accountDeterminationProfileId },
          })
        : await prisma.ficoAccountDeterminationProfile.findFirst({
              where: { companyId: company.id, code: 'DEFAULT' },
          })
    if (!profile) {
        profile = await prisma.ficoAccountDeterminationProfile.create({
            data: {
                companyId: company.id,
                code: 'DEFAULT',
                name: `${company.name} Default Determination`,
                description:
                    'Default MM automatic account determination profile',
                isDefault: true,
                status: 'ACTIVE',
                createdBy: 'seed-fico-phase1',
                updatedBy: 'seed-fico-phase1',
            },
        })
    }
    if (!settings.accountDeterminationProfileId) {
        settings = await prisma.ficoCompanyAccountingSettings.update({
            where: { companyId: company.id },
            data: { accountDeterminationProfileId: profile.id },
        })
    }

    const mappingDefs = [
        ['GR_IR', 'TRADING', '120100', '210200'],
        ['GR_IR', null, '120100', '210200'],
        ['GI_COGS', 'TRADING', '510100', '120100'],
        ['GI_COGS', null, '510100', '120100'],
        ['GI_EXPENSE', null, '510400', '120100'],
        ['SUPPLIER_INVOICE', null, '210200', '210100'],
        ['SUPPLIER_INVOICE_VAT', null, '130100', '210100'],
        ['INVENTORY_SHRINKAGE', null, '520100', '120100'],
        ['INVENTORY_INCREASE_ADJ', null, '120100', '310200'],
        ['PRICE_VARIANCE', null, '510500', '210200'],
        ['LANDED_COST', null, '120100', '210100'],
    ] as const
    for (const [key, valuationCode, debitCode, creditCode] of mappingDefs) {
        const valuationClassId = valuationCode ? valuationClass.id : null
        const valuationScopeKey = valuationCode ?? '*'
        const debitAccountId = accounts.get(debitCode)
        const creditAccountId = accounts.get(creditCode)
        if (!debitAccountId || !creditAccountId) {
            throw new Error(`Missing mapping account for ${key}`)
        }
        const existing = await prisma.ficoMmAccountMapping.findFirst({
            where: {
                companyId: company.id,
                profileId: profile.id,
                transactionKeyCode: key,
                valuationScopeKey,
            },
        })
        if (!existing) {
            await prisma.ficoMmAccountMapping.create({
                data: {
                    companyId: company.id,
                    profileId: profile.id,
                    transactionKeyCode: key,
                    valuationClassId,
                    valuationScopeKey,
                    debitAccountId,
                    creditAccountId,
                    status: 'ACTIVE',
                    createdBy: 'seed-fico-phase1',
                    updatedBy: 'seed-fico-phase1',
                },
            })
        }
    }

    for (const accountId of accounts.values()) {
        await prisma.ficoCompanyGlAccount.upsert({
            where: {
                companyId_glAccountId: {
                    companyId: company.id,
                    glAccountId: accountId,
                },
            },
            create: {
                companyId: company.id,
                glAccountId: accountId,
                postingEnabled: true,
                manualPostingBlocked: false,
                createdBy: 'seed-fico-phase1',
                updatedBy: 'seed-fico-phase1',
            },
            update: {},
        })
    }

    await seedRoleTemplates()

    console.log(
        JSON.stringify(
            {
                seed: 'fico-phase1',
                company: company.code,
                coa: coa.code,
                fiscalVariant: fiscalVariant.code,
                postingVariant: postingVariant.code,
                settingsStatus: settings.status,
                profile: profile.code,
                accounts: accounts.size,
                valuationClasses: ['TRADING', 'RAW_MATERIAL', 'FINISHED_GOOD'],
            },
            null,
            2,
        ),
    )
}

async function seedRoleTemplates() {
    const resources = await prisma.permissionResource.findMany({
        where: { code: { in: FICO_RESOURCES } },
        select: { id: true, code: true },
    })
    if (!resources.length) {
        console.warn(
            'FICO permission resources are not seeded yet. Start the API once, then rerun this seed to create role templates.',
        )
        return
    }
    const byCode = new Map(resources.map((r) => [r.code, r.id]))
    const full = {
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
    }
    const read = { canRead: true, canCreate: false, canUpdate: false, canDelete: false }
    const readWrite = { canRead: true, canCreate: true, canUpdate: true, canDelete: false }
    const templates: Array<{
        code: string
        name: string
        description: string
        grants: Record<string, typeof full>
    }> = [
        {
            code: 'finance_administrator',
            name: 'Finance Administrator',
            description:
                'Full finance configuration, posting, period control, reversal, and audit access.',
            grants: Object.fromEntries(
                FICO_RESOURCES.filter((c) => byCode.has(c)).map((c) => [c, full]),
            ),
        },
        {
            code: 'accountant',
            name: 'Accountant',
            description:
                'Configure masters, post and reverse journals, and manage periods; no audit administration.',
            grants: Object.fromEntries(
                [
                    'fico.overview',
                    'fico.company-settings',
                    'fico.chart-of-accounts',
                    'fico.gl-accounts',
                    'fico.periods',
                    'fico.account-determination',
                    'fico.journal-entries',
                    'fico.journal-reversal',
                    'fico.reports',
                    'fico.audit',
                ]
                    .filter((c) => byCode.has(c))
                    .map((c) => [c, c === 'fico.audit' ? read : readWrite]),
            ),
        },
        {
            code: 'auditor',
            name: 'Auditor',
            description: 'Read-only access to configuration, journals, periods, and audit trail.',
            grants: Object.fromEntries(
                FICO_RESOURCES.filter((c) => byCode.has(c)).map((c) => [c, read]),
            ),
        },
        {
            code: 'warehouse_user',
            name: 'Warehouse User',
            description:
                'Warehouse operations role. Finance menus remain unavailable unless explicitly granted.',
            grants: {},
        },
    ]
    for (const template of templates) {
        const row = await prisma.roleTemplate.upsert({
            where: { code: template.code },
            create: {
                code: template.code,
                name: template.name,
                description: template.description,
            },
            update: { name: template.name, description: template.description },
        })
        for (const [resourceCode, flags] of Object.entries(template.grants)) {
            const resourceId = byCode.get(resourceCode)
            if (!resourceId) continue
            await prisma.roleTemplatePermission.upsert({
                where: {
                    templateId_resourceId: {
                        templateId: row.id,
                        resourceId,
                    },
                },
                create: {
                    templateId: row.id,
                    resourceId,
                    ...flags,
                },
                update: flags,
            })
        }
    }
    console.log(`Seeded ${templates.length} finance role templates.`)
}

main()
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
