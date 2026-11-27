/**
 * Idempotent FICO document-type seed.
 *
 * - Upserts global `fi_document_types` (journal FK / manual-entry flag).
 * - Upserts company-scoped `fico_document_types` + number ranges for AGCTEK
 *   (Document Types UI at /modules/fico/document-types).
 *
 * Run: `npm run prisma:seed-fico-document-types` (from backend/).
 */
import { PrismaClient } from '@prisma/client'

const SEED_ACTOR = 'seed-fico-document-types'
const COMPANY_CODE = 'AGCTEK'

type FiSeed = {
    id: string
    code: string
    name: string
    category: string
    prefix: string
    allowsManualEntry: boolean
    allowsReversal: boolean
    isSystem: boolean
    padding?: number
}

type CompanyTypeSeed = {
    code: string
    name: string
    description: string
    documentCategory:
        | 'GENERAL_JOURNAL'
        | 'VENDOR_INVOICE'
        | 'VENDOR_CREDIT'
        | 'VENDOR_PAYMENT'
        | 'CUSTOMER_INVOICE'
        | 'CUSTOMER_CREDIT'
        | 'CUSTOMER_RECEIPT'
        | 'INVENTORY_ACCOUNTING'
        | 'OTHER'
    rangeCode: string
    rangeName: string
    prefix: string
    allowedAccountTypes: string[]
    allowsManualEntry: boolean
}

/** Global FI master — stable ids preserve existing journal FKs. */
const FI_TYPES: FiSeed[] = [
    {
        id: 'fico_dt_ab',
        code: 'AB',
        name: 'General Document',
        category: 'GENERAL',
        prefix: 'AB',
        allowsManualEntry: true,
        allowsReversal: true,
        isSystem: true,
        padding: 6,
    },
    {
        id: 'fico_dt_sa',
        code: 'SA',
        name: 'G/L Account Document',
        category: 'GENERAL',
        prefix: 'SA',
        allowsManualEntry: true,
        allowsReversal: true,
        isSystem: true,
        padding: 6,
    },
    {
        id: 'fico_dt_kr',
        code: 'KR',
        name: 'Vendor Invoice',
        category: 'AP',
        prefix: 'KR',
        allowsManualEntry: false,
        allowsReversal: true,
        isSystem: true,
        padding: 6,
    },
    {
        id: 'fico_dt_kz',
        code: 'KZ',
        name: 'Vendor Payment',
        category: 'AP',
        prefix: 'KZ',
        allowsManualEntry: false,
        allowsReversal: true,
        isSystem: true,
        padding: 6,
    },
    {
        id: 'fico_dt_kg',
        code: 'KG',
        name: 'Vendor Credit Memo',
        category: 'AP',
        prefix: 'KG',
        allowsManualEntry: false,
        allowsReversal: true,
        isSystem: true,
        padding: 6,
    },
    {
        id: 'fico_dt_kn',
        code: 'KN',
        name: 'Vendor Net Invoice / Credit',
        category: 'AP',
        prefix: 'KN',
        allowsManualEntry: false,
        allowsReversal: true,
        isSystem: true,
        padding: 6,
    },
    {
        id: 'fico_dt_dr',
        code: 'DR',
        name: 'Customer Invoice',
        category: 'AR',
        prefix: 'DR',
        allowsManualEntry: false,
        allowsReversal: true,
        isSystem: true,
        padding: 6,
    },
    {
        id: 'fico_dt_dz',
        code: 'DZ',
        name: 'Customer Payment',
        category: 'AR',
        prefix: 'DZ',
        allowsManualEntry: true,
        allowsReversal: true,
        isSystem: true,
        padding: 6,
    },
    {
        id: 'fico_dt_dg',
        code: 'DG',
        name: 'Customer Credit Memo',
        category: 'AR',
        prefix: 'DG',
        allowsManualEntry: false,
        allowsReversal: true,
        isSystem: true,
        padding: 6,
    },
    {
        id: 'fico_dt_rv',
        code: 'RV',
        name: 'Billing Document (SD)',
        category: 'AR',
        prefix: 'RV',
        allowsManualEntry: false,
        allowsReversal: true,
        isSystem: true,
        padding: 6,
    },
    {
        id: 'fico_dt_co',
        code: 'CO',
        name: 'Controlling Posting',
        category: 'CO',
        prefix: 'CO',
        allowsManualEntry: false,
        allowsReversal: true,
        isSystem: true,
        padding: 6,
    },
    {
        id: 'fico_dt_mm_gr',
        code: 'MM_GR',
        name: 'MM Goods Receipt',
        category: 'MM',
        prefix: 'MGR',
        allowsManualEntry: false,
        allowsReversal: true,
        isSystem: true,
        padding: 6,
    },
    {
        id: 'fico_dt_mm_gi',
        code: 'MM_GI',
        name: 'MM Goods Issue',
        category: 'MM',
        prefix: 'MGI',
        allowsManualEntry: false,
        allowsReversal: true,
        isSystem: true,
        padding: 6,
    },
    {
        id: 'fico_dt_mm_adj',
        code: 'MM_ADJUSTMENT',
        name: 'MM Inventory Adjustment',
        category: 'MM',
        prefix: 'MADJ',
        allowsManualEntry: false,
        allowsReversal: true,
        isSystem: true,
        padding: 6,
    },
]

const COMPANY_TYPES: CompanyTypeSeed[] = [
    {
        code: 'AB',
        name: 'General Document',
        description:
            'Cross-account-type postings (G/L, vendor, customer, bank, asset, inventory)',
        documentCategory: 'GENERAL_JOURNAL',
        rangeCode: 'AB',
        rangeName: 'General Documents',
        prefix: 'AB',
        allowedAccountTypes: [
            'GL_ACCOUNT',
            'VENDOR',
            'CUSTOMER',
            'BANK',
            'ASSET',
            'INVENTORY',
        ],
        allowsManualEntry: true,
    },
    {
        code: 'SA',
        name: 'G/L Account Document',
        description: 'Manual general-ledger journals',
        documentCategory: 'GENERAL_JOURNAL',
        rangeCode: 'JE',
        rangeName: 'Journal Entries',
        prefix: 'SA',
        allowedAccountTypes: ['GL_ACCOUNT'],
        allowsManualEntry: true,
    },
    {
        code: 'KR',
        name: 'Vendor Invoice',
        description: 'AP vendor invoices (automatic / reserved)',
        documentCategory: 'VENDOR_INVOICE',
        rangeCode: 'KR',
        rangeName: 'Vendor Invoices',
        prefix: 'KR',
        allowedAccountTypes: ['VENDOR', 'GL_ACCOUNT'],
        allowsManualEntry: false,
    },
    {
        code: 'KZ',
        name: 'Vendor Payment',
        description: 'AP vendor payments (automatic / reserved)',
        documentCategory: 'VENDOR_PAYMENT',
        rangeCode: 'KZ',
        rangeName: 'Vendor Payments',
        prefix: 'KZ',
        allowedAccountTypes: ['VENDOR', 'GL_ACCOUNT', 'BANK'],
        allowsManualEntry: false,
    },
    {
        code: 'KG',
        name: 'Vendor Credit Memo',
        description: 'AP vendor credit memos (automatic / reserved)',
        documentCategory: 'VENDOR_CREDIT',
        rangeCode: 'KG',
        rangeName: 'Vendor Credit Memos',
        prefix: 'KG',
        allowedAccountTypes: ['VENDOR', 'GL_ACCOUNT'],
        allowsManualEntry: false,
    },
    {
        code: 'KN',
        name: 'Vendor Net Invoice / Credit',
        description:
            'AP vendor net invoice and credit memo (automatic / reserved)',
        documentCategory: 'VENDOR_INVOICE',
        rangeCode: 'KN',
        rangeName: 'Vendor Net Documents',
        prefix: 'KN',
        allowedAccountTypes: ['VENDOR', 'GL_ACCOUNT'],
        allowsManualEntry: false,
    },
    {
        code: 'DR',
        name: 'Customer Invoice',
        description: 'AR customer invoices (automatic / reserved)',
        documentCategory: 'CUSTOMER_INVOICE',
        rangeCode: 'DR',
        rangeName: 'Customer Invoices',
        prefix: 'DR',
        allowedAccountTypes: ['CUSTOMER', 'GL_ACCOUNT'],
        allowsManualEntry: false,
    },
    {
        code: 'DZ',
        name: 'Customer Payment',
        description: 'AR customer payments / receipts',
        documentCategory: 'CUSTOMER_RECEIPT',
        rangeCode: 'DZ',
        rangeName: 'Customer Payments',
        prefix: 'DZ',
        allowedAccountTypes: ['CUSTOMER', 'GL_ACCOUNT', 'BANK'],
        allowsManualEntry: true,
    },
    {
        code: 'DG',
        name: 'Customer Credit Memo',
        description: 'AR customer credit memos (automatic / reserved)',
        documentCategory: 'CUSTOMER_CREDIT',
        rangeCode: 'DG',
        rangeName: 'Customer Credit Memos',
        prefix: 'DG',
        allowedAccountTypes: ['CUSTOMER', 'GL_ACCOUNT'],
        allowsManualEntry: false,
    },
    {
        code: 'RV',
        name: 'Billing Document (SD)',
        description:
            'SD billing / revenue documents (automatic / reserved; SAP RV)',
        documentCategory: 'CUSTOMER_INVOICE',
        rangeCode: 'RV',
        rangeName: 'Billing Documents',
        prefix: 'RV',
        allowedAccountTypes: ['CUSTOMER', 'GL_ACCOUNT'],
        allowsManualEntry: false,
    },
    {
        code: 'CO',
        name: 'Controlling Posting',
        description:
            'Reserved for future Controlling (CO) postings — not used in Phase 1',
        documentCategory: 'OTHER',
        rangeCode: 'CO',
        rangeName: 'Controlling Postings',
        prefix: 'CO',
        allowedAccountTypes: ['GL_ACCOUNT'],
        allowsManualEntry: false,
    },
    {
        code: 'MM_GR',
        name: 'MM Goods Receipt',
        description: 'Automatic MM goods receipt postings',
        documentCategory: 'INVENTORY_ACCOUNTING',
        rangeCode: 'MGR',
        rangeName: 'MM Goods Receipt',
        prefix: 'MGR',
        allowedAccountTypes: ['INVENTORY', 'GL_ACCOUNT'],
        allowsManualEntry: false,
    },
    {
        code: 'MM_GI',
        name: 'MM Goods Issue',
        description: 'Automatic MM goods issue postings',
        documentCategory: 'INVENTORY_ACCOUNTING',
        rangeCode: 'MGI',
        rangeName: 'MM Goods Issue',
        prefix: 'MGI',
        allowedAccountTypes: ['INVENTORY', 'GL_ACCOUNT'],
        allowsManualEntry: false,
    },
    {
        code: 'MM_ADJUSTMENT',
        name: 'MM Inventory Adjustment',
        description: 'Automatic MM inventory adjustments',
        documentCategory: 'INVENTORY_ACCOUNTING',
        rangeCode: 'MADJ',
        rangeName: 'MM Inventory Adjustment',
        prefix: 'MADJ',
        allowedAccountTypes: ['INVENTORY', 'GL_ACCOUNT'],
        allowsManualEntry: false,
    },
]

export async function seedFicoDocumentTypes(
    prisma: PrismaClient,
    companyCode = COMPANY_CODE,
) {
    console.log(`[${SEED_ACTOR}] upserting global fi_document_types…`)
    for (const row of FI_TYPES) {
        const existing = await prisma.fiDocumentType.findUnique({
            where: { code: row.code },
        })
        if (existing) {
            await prisma.fiDocumentType.update({
                where: { code: row.code },
                data: {
                    name: row.name,
                    category: row.category,
                    prefix: row.prefix,
                    padding: row.padding ?? existing.padding,
                    allowsManualEntry: row.allowsManualEntry,
                    allowsReversal: row.allowsReversal,
                    isSystem: row.isSystem,
                    isActive: true,
                    numberRangeFrom: existing.numberRangeFrom || 1,
                    numberRangeTo: existing.numberRangeTo || 999999999,
                },
            })
            console.log(`  fi  update ${row.code}`)
        } else {
            await prisma.fiDocumentType.create({
                data: {
                    id: row.id,
                    code: row.code,
                    name: row.name,
                    category: row.category,
                    prefix: row.prefix,
                    padding: row.padding ?? 6,
                    numberRangeFrom: 1,
                    numberRangeTo: 999999999,
                    nextNumber: 1,
                    allowsManualEntry: row.allowsManualEntry,
                    allowsReversal: row.allowsReversal,
                    isSystem: row.isSystem,
                    isActive: true,
                },
            })
            console.log(`  fi  create ${row.code}`)
        }
    }

    const company = await prisma.company.findFirst({
        where: { code: companyCode },
        select: { id: true, code: true, name: true },
    })
    if (!company) {
        console.warn(
            `[${SEED_ACTOR}] company ${companyCode} not found — skipped company-scoped types`,
        )
        return { companyId: null as string | null, companyTypes: 0, fiTypes: FI_TYPES.length }
    }

    console.log(
        `[${SEED_ACTOR}] seeding company types for ${company.code} (${company.id})…`,
    )

    const rangeIds = new Map<string, string>()
    for (const row of COMPANY_TYPES) {
        const range = await prisma.ficoNumberRange.upsert({
            where: {
                companyId_rangeCode: {
                    companyId: company.id,
                    rangeCode: row.rangeCode,
                },
            },
            create: {
                companyId: company.id,
                rangeCode: row.rangeCode,
                rangeName: row.rangeName,
                description: `Seeded range for ${row.code}`,
                documentCategory: row.documentCategory,
                assignmentType: 'INTERNAL',
                numberingMethod: 'INTERNAL',
                prefix: row.prefix,
                suffix: '',
                startNumber: 1,
                endNumber: 999999999,
                currentNumber: 1,
                paddingLength: 6,
                resetFrequency: 'NEVER',
                allowManualAssignment: row.allowsManualEntry,
                allowExternalAssignment: false,
                allowGaps: false,
                status: 'ACTIVE',
                remarks: `seeded by ${SEED_ACTOR}`,
                createdBy: SEED_ACTOR,
                updatedBy: SEED_ACTOR,
            },
            update: {
                rangeName: row.rangeName,
                documentCategory: row.documentCategory,
                prefix: row.prefix,
                endNumber: 999999999,
                paddingLength: 6,
                status: 'ACTIVE',
                allowManualAssignment: row.allowsManualEntry,
                updatedBy: SEED_ACTOR,
            },
        })
        rangeIds.set(row.rangeCode, range.id)
    }

    let companyTypes = 0
    for (const row of COMPANY_TYPES) {
        const numberRangeId = rangeIds.get(row.rangeCode) ?? null
        const remarks = row.allowsManualEntry
            ? 'allowsManualEntry=true; seeded'
            : 'allowsManualEntry=false; seeded'
        await prisma.ficoDocumentType.upsert({
            where: {
                companyId_code: { companyId: company.id, code: row.code },
            },
            create: {
                companyId: company.id,
                code: row.code,
                name: row.name,
                description: row.description,
                documentCategory: row.documentCategory,
                numberRangeId,
                numberAssignment: 'INTERNAL',
                externalNumberAllowed: false,
                numberRangeRequired: Boolean(numberRangeId),
                allowedAccountTypes: row.allowedAccountTypes,
                debitPostingAllowed: true,
                creditPostingAllowed: true,
                negativePostingAllowed: false,
                reversalAllowed: true,
                originalDocumentReferenceRequired: false,
                reversalReasonRequired: false,
                referenceRequired: false,
                headerTextRequired: false,
                lineTextRequired: false,
                status: 'ACTIVE',
                remarks,
                createdBy: SEED_ACTOR,
                updatedBy: SEED_ACTOR,
            },
            update: {
                name: row.name,
                description: row.description,
                documentCategory: row.documentCategory,
                numberRangeId,
                numberRangeRequired: Boolean(numberRangeId),
                allowedAccountTypes: row.allowedAccountTypes,
                reversalAllowed: true,
                status: 'ACTIVE',
                remarks,
                updatedBy: SEED_ACTOR,
            },
        })
        companyTypes += 1
        console.log(`  co  upsert ${row.code}`)
    }

    console.log(
        `[${SEED_ACTOR}] done — fi=${FI_TYPES.length} company=${companyTypes}`,
    )
    return { companyId: company.id, companyTypes, fiTypes: FI_TYPES.length }
}

async function main() {
    const prisma = new PrismaClient()
    try {
        await seedFicoDocumentTypes(prisma)
    } finally {
        await prisma.$disconnect()
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err)
        process.exit(1)
    })
}
