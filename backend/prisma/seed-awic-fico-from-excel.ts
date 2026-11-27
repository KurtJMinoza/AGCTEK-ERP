/**
 * Seed AWIC-only FICO foundation from the AWIC 2026 Excel workbook:
 *  - Chart of Accounts + G/L accounts (LIST sheet)
 *  - Company accounting settings + fiscal periods
 *  - Tax codes inferred from Excel tax accounts / BIR postings
 *
 *   cd backend && npm run prisma:seed-awic-fico
 *
 * Idempotent. Does not touch other companies' FICO data.
 */
import { createHash } from 'crypto'
import { existsSync } from 'fs'
import path from 'path'
import { Prisma, PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'

const ACTOR = 'seed-awic-fico-excel'
const COMPANY_CODE = 'AWIC'
const CHART_CODE = 'AWIC-COA-2026'
const FYV_CODE = 'AWIC_CAL'
const EXCEL_CANDIDATES = [
    path.resolve('C:/Users/erp/Downloads/AWIC 2026 .xlsx'),
    path.resolve(process.cwd(), '../AWIC 2026 .xlsx'),
    path.resolve(process.cwd(), 'AWIC 2026 .xlsx'),
]

/** Section headers in the Excel LIST — non-posting control accounts. */
const NON_POSTING_CODES = new Set([
    '1000',
    '1100',
    '1200',
    '1300',
    '1400',
    '1500',
    '2000',
    '2100',
    '4000',
    '5000',
    '6000',
    '6100',
    '6200',
    '6300',
])

/** Defaults aligned to the Excel posting pattern (most-used operational accounts). */
const DEFAULT_ACCOUNTS = {
    cash: '1003', // CASH IN BANK-EWB PESO
    receivable: '1101',
    payable: '2001',
    inventory: '1304', // FOOD SUPPLEMENTS (primary AWIC merchandising)
    sales: '4004',
    cogs: '5004',
    retainedEarnings: '3001',
    taxOutput: '2114', // VAT PAYABLE
    taxWhtPayable: '2112',
    percentageTaxExpense: '6203',
} as const

type ExcelAccount = {
    code: string
    title: string
    excelType: string
}

type MappedAccount = ExcelAccount & {
    accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
    normalBalance: 'DEBIT' | 'CREDIT'
    groupCode: string
    groupName: string
    isPostingAccount: boolean
}

function resolveExcelPath(): string {
    const fromEnv = process.env.AWIC_FICO_XLSX?.trim()
    if (fromEnv && existsSync(fromEnv)) return fromEnv
    for (const candidate of EXCEL_CANDIDATES) {
        if (existsSync(candidate)) return candidate
    }
    throw new Error(
        `AWIC Excel not found. Set AWIC_FICO_XLSX or place the file at: ${EXCEL_CANDIDATES[0]}`,
    )
}

function mapExcelType(
    excelType: string,
    title: string,
): Pick<MappedAccount, 'accountType' | 'normalBalance' | 'groupCode' | 'groupName'> {
    const type = excelType.toUpperCase().trim()
    const name = title.toUpperCase()
    if (type === 'ASSETS') {
        return {
            accountType: 'ASSET',
            normalBalance: 'DEBIT',
            groupCode: '1-ASSET',
            groupName: 'Assets',
        }
    }
    if (type === 'LIABILITIES') {
        return {
            accountType: 'LIABILITY',
            normalBalance: 'CREDIT',
            groupCode: '2-LIABILITY',
            groupName: 'Liabilities',
        }
    }
    if (type === 'EQUITY') {
        return {
            accountType: 'EQUITY',
            normalBalance: 'CREDIT',
            groupCode: '3-EQUITY',
            groupName: 'Equity',
        }
    }
    if (type === 'INCOME') {
        return {
            accountType: 'REVENUE',
            normalBalance: 'CREDIT',
            groupCode: '4-REVENUE',
            groupName: 'Income',
        }
    }
    if (type === 'COST OF SALES') {
        return {
            accountType: 'EXPENSE',
            normalBalance: 'DEBIT',
            groupCode: '5-COS',
            groupName: 'Cost of Sales',
        }
    }
    if (type === 'EXPENSE') {
        return {
            accountType: 'EXPENSE',
            normalBalance: 'DEBIT',
            groupCode: '6-OPEX',
            groupName: 'Operating Expenses',
        }
    }
    // OTHER — Excel mixes other income and other expense
    if (
        name.includes('INCOME') ||
        name.includes('INTEREST') ||
        name.includes('GAIN') ||
        name.includes('REBATE')
    ) {
        return {
            accountType: 'REVENUE',
            normalBalance: 'CREDIT',
            groupCode: '7-OTHER-INC',
            groupName: 'Other Income',
        }
    }
    return {
        accountType: 'EXPENSE',
        normalBalance: 'DEBIT',
        groupCode: '7-OTHER-EXP',
        groupName: 'Other Expenses',
    }
}

function readChartFromExcel(filePath: string): MappedAccount[] {
    const workbook = XLSX.readFile(filePath)
    const sheet = workbook.Sheets.LIST
    if (!sheet) throw new Error('Excel sheet LIST not found')
    const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
    }) as unknown[][]

    const byCode = new Map<string, MappedAccount>()
    for (let i = 2; i < rows.length; i += 1) {
        const row = rows[i] ?? []
        const rawCode = row[1]
        const title = String(row[2] ?? '').trim()
        const excelType = String(row[3] ?? '').trim()
        if (rawCode === '' || rawCode == null || !title || !excelType) continue
        const code = String(rawCode).trim()
        if (!code) continue
        const mapped = mapExcelType(excelType, title)
        byCode.set(code, {
            code,
            title,
            excelType,
            ...mapped,
            isPostingAccount: !NON_POSTING_CODES.has(code),
        })
    }
    return [...byCode.values()].sort((a, b) =>
        a.code.localeCompare(b.code, undefined, { numeric: true }),
    )
}

function monthPeriod(
    year: number,
    month: number,
): { startDate: Date; endDate: Date; name: string } {
    const startDate = new Date(Date.UTC(year, month - 1, 1))
    const endDate = new Date(Date.UTC(year, month, 0))
    const name = startDate.toLocaleString('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    })
    return { startDate, endDate, name }
}

async function upsertTaxCode(
    prisma: PrismaClient,
    input: {
        companyId: string
        code: string
        name: string
        description: string
        taxCategory: string
        taxType: string
        rate: number
        isSalesApplicable: boolean
        isPurchaseApplicable: boolean
        isRecoverable: boolean
        outputTaxGlAccountId?: string | null
        withholdingPayableGlAccountId?: string | null
        nonRecoverableTaxGlAccountId?: string | null
        defaultForSettings?: boolean
    },
) {
    const existing = await prisma.ficoTaxCode.findFirst({
        where: { companyId: input.companyId, code: input.code },
    })
    const base = {
        name: input.name,
        description: input.description,
        taxCategory: input.taxCategory,
        taxType: input.taxType,
        taxJurisdiction: 'Philippines',
        countryCode: 'PH',
        calculationMethod: 'TAX_EXCLUSIVE' as const,
        rateUnit: 'PERCENTAGE' as const,
        isSalesApplicable: input.isSalesApplicable,
        isPurchaseApplicable: input.isPurchaseApplicable,
        isServiceApplicable: true,
        isInventoryApplicable: false,
        isRecoverable: input.isRecoverable,
        outputTaxGlAccountId: input.outputTaxGlAccountId ?? null,
        withholdingPayableGlAccountId:
            input.withholdingPayableGlAccountId ?? null,
        nonRecoverableTaxGlAccountId:
            input.nonRecoverableTaxGlAccountId ?? null,
        status: 'ACTIVE',
        remarks: 'Seeded from AWIC 2026 Excel tax accounts / BIR postings',
        updatedBy: ACTOR,
    }

    const taxCode = existing
        ? await prisma.ficoTaxCode.update({
              where: { id: existing.id },
              data: base,
          })
        : await prisma.ficoTaxCode.create({
              data: {
                  companyId: input.companyId,
                  code: input.code,
                  createdBy: ACTOR,
                  ...base,
              },
          })

    const rateRows = await prisma.ficoTaxRate.findMany({
        where: { taxCodeId: taxCode.id, companyId: input.companyId },
        orderBy: { effectiveFrom: 'asc' },
    })
    if (rateRows.length === 0) {
        await prisma.ficoTaxRate.create({
            data: {
                taxCodeId: taxCode.id,
                companyId: input.companyId,
                rate: new Prisma.Decimal(input.rate),
                rateUnit: 'PERCENTAGE',
                effectiveFrom: new Date(Date.UTC(2025, 0, 1)),
                description: `${input.code} rate from AWIC Excel procedure`,
                status: 'ACTIVE',
                createdBy: ACTOR,
            },
        })
    } else {
        await prisma.ficoTaxRate.update({
            where: { id: rateRows[0].id },
            data: {
                rate: new Prisma.Decimal(input.rate),
                status: 'ACTIVE',
            },
        })
    }

    return taxCode
}

async function main() {
    const excelPath = resolveExcelPath()
    const accounts = readChartFromExcel(excelPath)
    if (accounts.length === 0) {
        throw new Error('No chart accounts parsed from Excel LIST sheet')
    }

    const prisma = new PrismaClient()
    try {
        const company = await prisma.company.findFirst({
            where: { code: COMPANY_CODE },
        })
        if (!company) {
            throw new Error(`Company ${COMPANY_CODE} not found in organization master`)
        }

        const fingerprint = createHash('sha1')
            .update(accounts.map((a) => `${a.code}|${a.title}|${a.excelType}`).join('\n'))
            .digest('hex')
            .slice(0, 12)

        console.log(
            `Seeding AWIC FICO from ${excelPath} (${accounts.length} accounts, fp=${fingerprint})`,
        )

        const chart = await prisma.ficoChartOfAccounts.upsert({
            where: { code: CHART_CODE },
            create: {
                code: CHART_CODE,
                name: 'AWIC Chart of Accounts 2026',
                description:
                    'Seeded from AWIC 2026 Excel LIST sheet (company-specific chart for Amalgated World Import Corporation).',
                countryCode: 'PH',
                accountCodeLength: null,
                status: 'ACTIVE',
                createdBy: ACTOR,
                updatedBy: ACTOR,
            },
            update: {
                name: 'AWIC Chart of Accounts 2026',
                description:
                    'Seeded from AWIC 2026 Excel LIST sheet (company-specific chart for Amalgated World Import Corporation).',
                status: 'ACTIVE',
                updatedBy: ACTOR,
            },
        })

        const groupDefs = [
            ...new Map(
                accounts.map((a) => [
                    a.groupCode,
                    {
                        code: a.groupCode,
                        name: a.groupName,
                        category: a.accountType,
                    },
                ]),
            ).values(),
        ]

        const groupsByCode = new Map<string, string>()
        for (const [index, group] of groupDefs.entries()) {
            const row = await prisma.ficoGlAccountGroup.upsert({
                where: {
                    chartOfAccountsId_code: {
                        chartOfAccountsId: chart.id,
                        code: group.code,
                    },
                },
                create: {
                    chartOfAccountsId: chart.id,
                    code: group.code,
                    name: group.name,
                    category: group.category,
                    sortOrder: (index + 1) * 10,
                    status: 'ACTIVE',
                    createdBy: ACTOR,
                    updatedBy: ACTOR,
                },
                update: {
                    name: group.name,
                    category: group.category,
                    sortOrder: (index + 1) * 10,
                    status: 'ACTIVE',
                    updatedBy: ACTOR,
                },
            })
            groupsByCode.set(group.code, row.id)
        }

        const glByCode = new Map<string, { id: string; accountCode: string }>()
        for (const account of accounts) {
            const accountGroupId = groupsByCode.get(account.groupCode)
            if (!accountGroupId) {
                throw new Error(`Missing group ${account.groupCode}`)
            }
            const row = await prisma.ficoGlAccount.upsert({
                where: {
                    chartOfAccountsId_accountCode: {
                        chartOfAccountsId: chart.id,
                        accountCode: account.code,
                    },
                },
                create: {
                    chartOfAccountsId: chart.id,
                    accountGroupId,
                    accountCode: account.code,
                    accountName: account.title,
                    description: `Excel ${account.excelType}`,
                    accountType: account.accountType,
                    normalBalance: account.normalBalance,
                    isPostingAccount: account.isPostingAccount,
                    allowManualPosting: account.isPostingAccount,
                    allowAutomaticPosting: account.isPostingAccount,
                    financialStatementMapping:
                        account.accountType === 'ASSET' ||
                        account.accountType === 'LIABILITY' ||
                        account.accountType === 'EQUITY'
                            ? 'BALANCE_SHEET'
                            : 'INCOME_STATEMENT',
                    taxCategory:
                        account.code === '2114'
                            ? 'OUTPUT_VAT'
                            : account.code === '2112'
                              ? 'WITHHOLDING'
                              : account.code === '6203'
                                ? 'PERCENTAGE_TAX'
                                : null,
                    status: 'ACTIVE',
                    createdBy: ACTOR,
                    updatedBy: ACTOR,
                },
                update: {
                    accountGroupId,
                    accountName: account.title,
                    description: `Excel ${account.excelType}`,
                    accountType: account.accountType,
                    normalBalance: account.normalBalance,
                    isPostingAccount: account.isPostingAccount,
                    allowManualPosting: account.isPostingAccount,
                    allowAutomaticPosting: account.isPostingAccount,
                    status: 'ACTIVE',
                    updatedBy: ACTOR,
                },
            })
            glByCode.set(account.code, {
                id: row.id,
                accountCode: row.accountCode,
            })

            const assignment = await prisma.ficoCompanyGlAccount.findUnique({
                where: {
                    companyId_glAccountId: {
                        companyId: company.id,
                        glAccountId: row.id,
                    },
                },
            })
            if (!assignment) {
                await prisma.ficoCompanyGlAccount.create({
                    data: {
                        companyId: company.id,
                        glAccountId: row.id,
                        postingEnabled: account.isPostingAccount,
                        createdBy: ACTOR,
                        updatedBy: ACTOR,
                    },
                })
            }
        }

        const requireGl = (code: string) => {
            const row = glByCode.get(code)
            if (!row) throw new Error(`Required G/L ${code} missing after seed`)
            return row
        }

        const fyv = await prisma.ficoFiscalYearVariant.upsert({
            where: { code: FYV_CODE },
            create: {
                code: FYV_CODE,
                name: 'AWIC Calendar Year',
                description: 'January–December fiscal year for AWIC (Excel calendar).',
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
            update: {
                name: 'AWIC Calendar Year',
                status: 'ACTIVE',
                updatedBy: ACTOR,
            },
        })

        const ppv = await prisma.ficoPostingPeriodVariant.findFirst({
            where: { code: 'PH_STANDARD' },
        })
        if (!ppv) {
            throw new Error('Posting period variant PH_STANDARD not found')
        }

        const cash = requireGl(DEFAULT_ACCOUNTS.cash)
        const ar = requireGl(DEFAULT_ACCOUNTS.receivable)
        const ap = requireGl(DEFAULT_ACCOUNTS.payable)
        const inv = requireGl(DEFAULT_ACCOUNTS.inventory)
        const sales = requireGl(DEFAULT_ACCOUNTS.sales)
        const cogs = requireGl(DEFAULT_ACCOUNTS.cogs)
        const re = requireGl(DEFAULT_ACCOUNTS.retainedEarnings)
        const vatPayable = requireGl(DEFAULT_ACCOUNTS.taxOutput)
        const whtPayable = requireGl(DEFAULT_ACCOUNTS.taxWhtPayable)
        const pctTaxExpense = requireGl(DEFAULT_ACCOUNTS.percentageTaxExpense)

        // Excel sales post without VAT lines and BIR remittances use
        // PERCENTAGE TAX EXPENSE (6203) — AWIC default tax is percentage tax.
        const pt3 = await upsertTaxCode(prisma, {
            companyId: company.id,
            code: 'PT-3',
            name: 'Percentage Tax 3%',
            description:
                'AWIC Excel procedure: sales recorded tax-exclusive without VAT lines; quarterly percentage tax expensed to 6203.',
            taxCategory: 'OTHER_TAX',
            taxType: 'PERCENTAGE_TAX',
            rate: 3,
            isSalesApplicable: true,
            isPurchaseApplicable: false,
            isRecoverable: false,
            nonRecoverableTaxGlAccountId: pctTaxExpense.id,
        })

        await upsertTaxCode(prisma, {
            companyId: company.id,
            code: 'VAT-12',
            name: 'Output VAT 12%',
            description:
                'Excel VAT PAYABLE (2114). Used when a VAT-liable sale/purchase clearing is required.',
            taxCategory: 'OUTPUT_TAX',
            taxType: 'VAT',
            rate: 12,
            isSalesApplicable: true,
            isPurchaseApplicable: false,
            isRecoverable: false,
            outputTaxGlAccountId: vatPayable.id,
        })

        await upsertTaxCode(prisma, {
            companyId: company.id,
            code: 'EWT-EXP',
            name: 'Expanded Withholding Tax',
            description:
                'Excel WITHHOLDING TAX PAYABLE (2112) used for BIR expanded withholding remittances.',
            taxCategory: 'WITHHOLDING_TAX',
            taxType: 'WITHHOLDING_TAX',
            rate: 1,
            isSalesApplicable: false,
            isPurchaseApplicable: true,
            isRecoverable: false,
            withholdingPayableGlAccountId: whtPayable.id,
        })

        const settingsData = {
            legalName: company.name,
            baseCurrency: 'PHP',
            countryCode: 'PH',
            timezone: 'Asia/Manila',
            accountingMethod: 'ACCRUAL',
            chartOfAccountsId: chart.id,
            fiscalYearVariantId: fyv.id,
            postingPeriodVariantId: ppv.id,
            taxCountryCode: 'PH',
            taxRegistrationNumber: company.tin || null,
            taxJurisdiction: 'Philippines',
            defaultTaxCode: pt3.code,
            defaultRetainedEarningsAccountId: re.id,
            defaultCashAccountId: cash.id,
            defaultReceivableAccountId: ar.id,
            defaultPayableAccountId: ap.id,
            defaultInventoryAccountId: inv.id,
            defaultSalesRevenueAccountId: sales.id,
            defaultCostOfGoodsSoldAccountId: cogs.id,
            defaultTaxInputAccountId: null,
            defaultTaxOutputAccountId: vatPayable.id,
            documentNumberPrefix: 'JE',
            documentNumberPadding: 6,
            postingPrecision: 2,
            reconciliationPolicy: 'BLOCK_MANUAL',
            allowNegativePostings: false,
            backdatedPostingAllowed: true,
            closeChecklist: {
                items: [
                    'All unposted source documents reviewed',
                    'Percentage tax / BIR remittances reviewed',
                    'Trial balance reviewed and balanced',
                ],
            },
            updatedBy: ACTOR,
        }

        const existingSettings =
            await prisma.ficoCompanyAccountingSettings.findUnique({
                where: { companyId: company.id },
            })

        const settings = existingSettings
            ? await prisma.ficoCompanyAccountingSettings.update({
                  where: { companyId: company.id },
                  data: {
                      ...settingsData,
                      status: 'ACTIVE',
                      activatedAt: existingSettings.activatedAt ?? new Date(),
                      activatedBy: existingSettings.activatedBy ?? ACTOR,
                      deactivatedAt: null,
                      deactivatedBy: null,
                  },
              })
            : await prisma.ficoCompanyAccountingSettings.create({
                  data: {
                      companyId: company.id,
                      ...settingsData,
                      status: 'ACTIVE',
                      activatedAt: new Date(),
                      activatedBy: ACTOR,
                      createdBy: ACTOR,
                  },
              })

        for (const year of [2025, 2026]) {
            for (let periodNumber = 1; periodNumber <= 12; periodNumber += 1) {
                const { startDate, endDate, name } = monthPeriod(year, periodNumber)
                const existingPeriod = await prisma.ficoFinancialPeriod.findUnique({
                    where: {
                        companyId_fiscalYear_periodNumber: {
                            companyId: company.id,
                            fiscalYear: year,
                            periodNumber,
                        },
                    },
                })
                if (existingPeriod) {
                    await prisma.ficoFinancialPeriod.update({
                        where: { id: existingPeriod.id },
                        data: {
                            name,
                            startDate,
                            endDate,
                            fiscalYearVariantId: fyv.id,
                            periodType: 'NORMAL',
                            status:
                                year === 2026 && periodNumber === new Date().getUTCMonth() + 1
                                    ? 'OPEN'
                                    : existingPeriod.status === 'LOCKED'
                                      ? 'LOCKED'
                                      : year < 2026
                                        ? 'CLOSED'
                                        : existingPeriod.status === 'FUTURE'
                                          ? periodNumber <= new Date().getUTCMonth() + 1
                                              ? 'OPEN'
                                              : 'FUTURE'
                                          : existingPeriod.status,
                            updatedBy: ACTOR,
                        },
                    })
                    continue
                }
                const nowMonth = new Date().getUTCMonth() + 1
                const nowYear = new Date().getUTCFullYear()
                let status = 'FUTURE'
                if (year < nowYear) status = 'CLOSED'
                else if (year === nowYear && periodNumber < nowMonth) status = 'CLOSED'
                else if (year === nowYear && periodNumber === nowMonth) status = 'OPEN'

                await prisma.ficoFinancialPeriod.create({
                    data: {
                        companyId: company.id,
                        fiscalYear: year,
                        periodNumber,
                        name,
                        periodType: 'NORMAL',
                        startDate,
                        endDate,
                        status,
                        fiscalYearVariantId: fyv.id,
                        createdBy: ACTOR,
                        updatedBy: ACTOR,
                    },
                })
            }
        }

        const summary = {
            company: { id: company.id, code: company.code, name: company.name },
            chart: { id: chart.id, code: chart.code, accounts: accounts.length },
            settings: {
                id: settings.id,
                status: settings.status,
                defaultTaxCode: settings.defaultTaxCode,
            },
            defaults: DEFAULT_ACCOUNTS,
            taxCodes: ['PT-3', 'VAT-12', 'EWT-EXP'],
            fiscalYears: [2025, 2026],
        }
        console.log(JSON.stringify(summary, null, 2))
        console.log('AWIC FICO seed completed.')
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
