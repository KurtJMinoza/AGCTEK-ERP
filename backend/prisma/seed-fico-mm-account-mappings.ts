/**
 * Idempotent seed for Phase 1 MM→FICO automatic account determination
 * (`fico_transaction_keys` + `fico_mm_account_mappings`).
 *
 * This is what `FicoAccountDeterminationService` resolves at journal time
 * (GR_IR, GI_COGS, GI_EXPENSE, SALES_RETURN, shrinkage, increase adj) —
 * distinct from the draft determination *rules* catalogue in
 * `seed-account-determination.ts`.
 *
 * Run: `npm run prisma:seed-fico-mm-account-mappings` (from backend/).
 *
 * Reseed AGCTEK after pulling: `cd backend && npm run prisma:seed-fico-mm-account-mappings`
 * Targets G/L codes on the company's assigned chart (AGCTEK-COA today:
 * 1200 Inventory, 5000 COGS, 2100 GR/IR, 5200 Shrinkage, 6000 OpEx).
 */
import { PrismaClient } from '@prisma/client'

const SEED_ACTOR = 'seed-fico-mm-account-mappings'
const COMPANY_CODE = 'AGCTEK'

type KeyDef = {
    id: string
    code: string
    name: string
    inventorySide: 'DEBIT_INVENTORY' | 'CREDIT_INVENTORY' | 'NONE'
    sortOrder: number
}

type MappingDef = {
    id: string
    transactionKeyCode: string
    /** Debit G/L account code on the company chart. */
    debitAccountCode: string
    /** Credit G/L account code on the company chart. */
    creditAccountCode: string
}

const TRANSACTION_KEYS: KeyDef[] = [
    {
        id: 'cm_fkey_gr_ir',
        code: 'GR_IR',
        name: 'Goods Receipt GR/IR',
        inventorySide: 'DEBIT_INVENTORY',
        sortOrder: 10,
    },
    {
        id: 'cm_fkey_gi_cogs',
        code: 'GI_COGS',
        name: 'Goods Issue COGS',
        inventorySide: 'CREDIT_INVENTORY',
        sortOrder: 20,
    },
    {
        id: 'cm_fkey_gi_expense',
        code: 'GI_EXPENSE',
        name: 'Goods Issue Expense',
        inventorySide: 'CREDIT_INVENTORY',
        sortOrder: 30,
    },
    {
        id: 'cm_fkey_sales_return',
        code: 'SALES_RETURN',
        name: 'Customer Sales Return Restock',
        inventorySide: 'DEBIT_INVENTORY',
        sortOrder: 35,
    },
    {
        // Commercial leg (Phase 2). Multi-line VAT/cash split is resolved in
        // FicoSalesReturnRefundService; this key documents the primary pair.
        id: 'cm_fkey_sales_return_refund',
        code: 'SALES_RETURN_REFUND',
        name: 'Customer Sales Return Refund',
        inventorySide: 'NONE',
        sortOrder: 36,
    },
    {
        id: 'cm_fkey_inventory_shrinkage',
        code: 'INVENTORY_SHRINKAGE',
        name: 'Inventory Shrinkage',
        inventorySide: 'CREDIT_INVENTORY',
        sortOrder: 40,
    },
    {
        id: 'cm_fkey_inventory_increase_adj',
        code: 'INVENTORY_INCREASE_ADJ',
        name: 'Inventory Increase Adjustment',
        inventorySide: 'DEBIT_INVENTORY',
        sortOrder: 50,
    },
]

/**
 * Default AGCTEK chart codes (starter COA):
 * 1200 Inventory · 2100 GR/IR · 5000 COGS · 5200 Shrinkage · 6000 Operating Expense
 */
const MAPPINGS: MappingDef[] = [
    {
        id: 'cm_map_gr_ir_agctek',
        transactionKeyCode: 'GR_IR',
        debitAccountCode: '1200',
        creditAccountCode: '2100',
    },
    {
        id: 'cm_map_gi_cogs_agctek',
        transactionKeyCode: 'GI_COGS',
        debitAccountCode: '5000',
        creditAccountCode: '1200',
    },
    {
        id: 'cm_map_gi_expense_agctek',
        transactionKeyCode: 'GI_EXPENSE',
        debitAccountCode: '6000',
        creditAccountCode: '1200',
    },
    {
        // Mirror of GI_COGS for restock: Dr Inventory / Cr COGS (valuation cost).
        id: 'cm_map_sales_return_agctek',
        transactionKeyCode: 'SALES_RETURN',
        debitAccountCode: '1200',
        creditAccountCode: '5000',
    },
    {
        // Primary commercial pair (Dr Revenue / Cr Cash). VAT is posted as an
        // extra debit by FicoSalesReturnRefundService when taxAmount > 0.
        id: 'cm_map_sales_return_refund_agctek',
        transactionKeyCode: 'SALES_RETURN_REFUND',
        debitAccountCode: '4000',
        creditAccountCode: '1000',
    },
    {
        id: 'cm_map_inventory_shrinkage_agctek',
        transactionKeyCode: 'INVENTORY_SHRINKAGE',
        debitAccountCode: '5200',
        creditAccountCode: '1200',
    },
    {
        id: 'cm_map_inventory_increase_adj_agctek',
        transactionKeyCode: 'INVENTORY_INCREASE_ADJ',
        debitAccountCode: '1200',
        creditAccountCode: '2100',
    },
]

export async function seedFicoMmAccountMappings(prisma: PrismaClient) {
    const company = await prisma.company.findFirst({
        where: { code: COMPANY_CODE },
        select: { id: true, code: true },
    })
    if (!company) {
        return { skipped: true, reason: `Company ${COMPANY_CODE} not found.` }
    }

    const settings = await prisma.ficoCompanyAccountingSettings.findUnique({
        where: { companyId: company.id },
        select: {
            chartOfAccountsId: true,
            accountDeterminationProfileId: true,
            status: true,
        },
    })
    if (!settings?.chartOfAccountsId || !settings.accountDeterminationProfileId) {
        return {
            skipped: true,
            reason: 'Company accounting settings missing chart or account-determination profile.',
        }
    }

    const keysUpserted: string[] = []
    for (const key of TRANSACTION_KEYS) {
        await prisma.ficoTransactionKey.upsert({
            where: { code: key.code },
            create: {
                id: key.id,
                code: key.code,
                name: key.name,
                inventorySide: key.inventorySide,
                requiresValuationClass: false,
                sortOrder: key.sortOrder,
                status: 'ACTIVE',
            },
            update: {
                name: key.name,
                inventorySide: key.inventorySide,
                sortOrder: key.sortOrder,
                status: 'ACTIVE',
            },
        })
        keysUpserted.push(key.code)
    }

    const accounts = await prisma.ficoGlAccount.findMany({
        where: {
            chartOfAccountsId: settings.chartOfAccountsId,
            accountCode: {
                in: [...new Set(MAPPINGS.flatMap((m) => [m.debitAccountCode, m.creditAccountCode]))],
            },
            status: 'ACTIVE',
        },
        select: { id: true, accountCode: true },
    })
    const accountByCode = new Map(accounts.map((a) => [a.accountCode, a.id]))

    const mappingsUpserted: string[] = []
    const missingAccounts: string[] = []

    for (const mapping of MAPPINGS) {
        const debitAccountId = accountByCode.get(mapping.debitAccountCode)
        const creditAccountId = accountByCode.get(mapping.creditAccountCode)
        if (!debitAccountId || !creditAccountId) {
            missingAccounts.push(
                `${mapping.transactionKeyCode} (need ${mapping.debitAccountCode}/${mapping.creditAccountCode})`,
            )
            continue
        }

        // Prefer stable seed id; if a prior demo created the same key/scope under
        // another id, update that row in place so the unique (company, profile,
        // key, scope) constraint is satisfied.
        const existing = await prisma.ficoMmAccountMapping.findFirst({
            where: {
                companyId: company.id,
                profileId: settings.accountDeterminationProfileId,
                transactionKeyCode: mapping.transactionKeyCode,
                valuationScopeKey: '*',
            },
            select: { id: true },
        })

        if (existing) {
            await prisma.ficoMmAccountMapping.update({
                where: { id: existing.id },
                data: {
                    debitAccountId,
                    creditAccountId,
                    status: 'ACTIVE',
                    updatedBy: SEED_ACTOR,
                },
            })
        } else {
            await prisma.ficoMmAccountMapping.create({
                data: {
                    id: mapping.id,
                    companyId: company.id,
                    profileId: settings.accountDeterminationProfileId,
                    transactionKeyCode: mapping.transactionKeyCode,
                    valuationClassId: null,
                    valuationScopeKey: '*',
                    debitAccountId,
                    creditAccountId,
                    status: 'ACTIVE',
                    createdBy: SEED_ACTOR,
                    updatedBy: SEED_ACTOR,
                },
            })
        }
        mappingsUpserted.push(mapping.transactionKeyCode)
    }

    return {
        skipped: false,
        companyId: company.id,
        companyCode: company.code,
        keysUpserted,
        mappingsUpserted,
        missingAccounts,
    }
}

async function main() {
    const prisma = new PrismaClient()
    try {
        const result = await seedFicoMmAccountMappings(prisma)
        console.log('FICO MM account mappings seed:', JSON.stringify(result, null, 2))
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
