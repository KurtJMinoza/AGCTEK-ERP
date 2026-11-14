import { BadRequestException, ConflictException } from '@nestjs/common'
import { FicoTaxCalculationService } from '../fico/fico-tax-calculation.service'
import { ExtPlatformTransactionService } from './ext-platform-transaction.service'
import type { PrismaService } from '../prisma/prisma.service'
import type { MaterialResolutionService } from './material-resolution.service'
import { SD_MM_ERROR, SdMmIntegrationException } from './sd-integration.errors'
import type { ProductService } from './product.service'
import type { CommercialAvailabilityService } from './commercial-availability.service'

const vatCode = {
    id: 'tc-vat',
    companyId: 'co-1',
    code: 'OV12',
    taxType: 'VAT',
    status: 'ACTIVE',
    calculationMethod: 'TAX_INCLUSIVE',
    roundingMethod: 'HALF_UP',
    roundingLevel: 'PER_LINE_ITEM',
    decimalPrecision: 2,
    isRecoverable: true,
    taxRates: [
        { rate: 10, rateUnit: 'PERCENTAGE', effectiveFrom: '2020-01-01', effectiveTo: '2025-12-31', status: 'ACTIVE' },
        { rate: 12, rateUnit: 'PERCENTAGE', effectiveFrom: '2026-01-01', effectiveTo: null, status: 'ACTIVE' },
    ],
}

const exemptCode = {
    id: 'tc-ex',
    companyId: 'co-1',
    code: 'EX',
    taxType: 'EXEMPT_TAX',
    status: 'ACTIVE',
    calculationMethod: 'NOT_APPLICABLE',
    taxRates: [{ rate: 0, rateUnit: 'PERCENTAGE', effectiveFrom: '2020-01-01', effectiveTo: null, status: 'ACTIVE' }],
}

const materials = [
    { id: 'm-vat', materialCode: 'MAT-1', materialName: 'Vatable', sku: 'S1', baseUomId: 'u1', salesUom: null, taxClassification: 'VATABLE', taxCodeId: 'tc-vat', priceTaxTreatment: 'VAT_INCLUSIVE', taxCode: vatCode },
    { id: 'm-ex', materialCode: 'MAT-2', materialName: 'Exempt', sku: 'S2', baseUomId: 'u1', salesUom: null, taxClassification: 'VAT_EXEMPT', taxCodeId: 'tc-ex', priceTaxTreatment: 'VAT_INCLUSIVE', taxCode: exemptCode },
    { id: 'm-none', materialCode: 'MAT-3', materialName: 'No tax', sku: 'S3', baseUomId: 'u1', salesUom: null, taxClassification: null, taxCodeId: null, priceTaxTreatment: null, taxCode: null },
]

// Catalog: p-vat links through its default variant, p-ex / p-none through an
// assignment, p-var needs a variant, p-unlinked has no material at all.
const products = [
    { id: 'p-vat', sku: 'VAT-1', name: 'Vatable item', divisionId: 'DIV_RETAIL', status: 'ACTIVE', productConfig: 'SIMPLE', defaultVariantId: 'v-vat-def' },
    { id: 'p-ex', sku: 'EX-1', name: 'Exempt item', divisionId: 'DIV_RETAIL', status: 'ACTIVE', productConfig: 'SIMPLE', defaultVariantId: null },
    { id: 'p-none', sku: 'NT-1', name: 'Untaxed item', divisionId: 'DIV_RETAIL', status: 'ACTIVE', productConfig: 'SIMPLE', defaultVariantId: null },
    { id: 'p-var', sku: 'SHIRT', name: 'Shirt', divisionId: 'DIV_RETAIL', status: 'ACTIVE', productConfig: 'VARIABLE', defaultVariantId: null },
    { id: 'p-unlinked', sku: 'UNL', name: 'Unlinked item', divisionId: 'DIV_RETAIL', status: 'ACTIVE', productConfig: 'SIMPLE', defaultVariantId: null },
]
const variants = [
    { id: 'v-vat-def', productId: 'p-vat', variantName: 'Default', sku: 'VAT-1', materialId: 'm-vat' },
    { id: 'v-red', productId: 'p-var', variantName: 'Red / M', sku: 'SHIRT-RED-M', materialId: 'm-vat' },
]
const assignments: Record<string, string> = { 'p-ex': 'm-ex', 'p-none': 'm-none' }

/** Available quantity per SKU (MM ATP via the storefront batch); absent = plenty. */
let stockBySku: Record<string, number> = {}

function makeService(findUnique: jest.Mock = jest.fn().mockResolvedValue(null)) {
    const byIds = <T extends { id: string }>(rows: T[]) =>
        jest.fn(({ where }) => Promise.resolve(rows.filter((r) => where.id.in.includes(r.id))))
    const prisma = {
        mmMaterial: { findMany: byIds(materials) },
        sdProduct: { findMany: byIds(products) },
        sdProductVariant: { findMany: byIds(variants) },
        sdExtPlatformTransaction: { findUnique },
    }
    const materialResolution = {
        resolveMaterialForProduct: jest.fn(({ productId }: { productId: string }) => {
            const materialId = assignments[productId]
            if (!materialId) {
                return Promise.reject(
                    new SdMmIntegrationException(SD_MM_ERROR.PRODUCT_MATERIAL_MAPPING_MISSING, 'missing'),
                )
            }
            return Promise.resolve({ materialId })
        }),
    }
    const productService = {
        getStorefrontAvailabilityBatch: jest.fn(
            (_division: string, items: Array<{ sku: string }>) =>
                Promise.resolve(
                    items.map(({ sku }) => {
                        const qty = stockBySku[sku] ?? 999
                        return { sku, availableQuantity: qty, state: qty > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK' }
                    }),
                ),
        ),
    }
    return new ExtPlatformTransactionService(
        prisma as unknown as PrismaService,
        new FicoTaxCalculationService(),
        materialResolution as unknown as MaterialResolutionService,
        productService as unknown as ProductService,
        {} as CommercialAvailabilityService,
    )
}

beforeEach(() => {
    stockBySku = {}
})

describe('ExtPlatformTransactionService.preview', () => {
    it('splits VATable, exempt and non-taxable lines using MM tax setup and FICO rates', async () => {
        const result = await makeService().preview({
            companyId: 'co-1',
            transactionDate: '2026-11-14',
            platformFees: 50,
            lines: [
                { productId: 'p-vat', quantity: 1, unitPrice: 1200, discount: 80 },
                { productId: 'p-ex', quantity: 2, unitPrice: 100 },
                { productId: 'p-none', quantity: 1, unitPrice: 30 },
            ],
        })

        expect(result.lines[0]).toMatchObject({
            taxCode: 'OV12',
            taxRate: 12,
            taxAmount: 120,
            netAmount: 1000,
            grossAmount: 1120,
            taxableAmount: 1000,
        })
        expect(result.lines[1]).toMatchObject({ taxAmount: 0, exemptAmount: 200, grossAmount: 200 })
        expect(result.lines[2]).toMatchObject({ taxCode: null, taxAmount: 0, grossAmount: 30 })
        expect(result.totals).toEqual({
            grossSales: 1430,
            discount: 80,
            taxableSales: 1000,
            vatAmount: 120,
            exemptSales: 200,
            zeroRatedSales: 0,
            nonTaxableSales: 30,
            netAmount: 1230,
            grandTotal: 1350,
            platformFees: 50,
            netSettlement: 1300,
        })
    })

    it('applies the FICO rate effective on the transaction date', async () => {
        const result = await makeService().preview({
            companyId: 'co-1',
            transactionDate: '2025-06-01',
            lines: [{ productId: 'p-vat', quantity: 1, unitPrice: 1100 }],
        })
        expect(result.lines[0]).toMatchObject({ taxRate: 10, taxAmount: 100, netAmount: 1000 })
    })

    it('rejects a discount larger than the line amount', async () => {
        await expect(
            makeService().preview({
                companyId: 'co-1',
                transactionDate: '2026-11-14',
                lines: [{ productId: 'p-vat', quantity: 1, unitPrice: 50, discount: 60 }],
            }),
        ).rejects.toBeInstanceOf(BadRequestException)
    })
})

describe('ExtPlatformTransactionService catalog → material link', () => {
    const lines = [
        { productId: 'p-var', variantId: 'v-red', quantity: 1, unitPrice: 560 },
        { productId: 'p-unlinked', quantity: 1, unitPrice: 100 },
        { productId: 'p-var', quantity: 1, unitPrice: 560 },
    ]

    it('uses the sold variant material and flags unlinked rows without failing the preview', async () => {
        const result = await makeService().preview({ companyId: 'co-1', transactionDate: '2026-11-14', lines })

        expect(result.lines[0]).toMatchObject({ lineNumber: 1, materialCode: 'MAT-1', taxAmount: 60 })
        expect(result.lines[1]).toEqual({
            lineNumber: 2,
            error: 'Unlinked item has no MM material assigned. Link it in Product Catalog first.',
        })
        expect(result.lines[2]).toEqual({ lineNumber: 3, error: 'Select a variant for Shirt.' })
        expect(result.totals.grandTotal).toBe(560)
    })

    it('refuses to save a line whose product has no MM material', async () => {
        const service = makeService() as unknown as {
            resolveLines: (l: typeof lines, c: string, d: string, s: boolean) => Promise<unknown>
        }
        await expect(service.resolveLines(lines, 'co-1', '2026-11-14', true)).rejects.toThrow(
            'Unlinked item has no MM material assigned',
        )
    })

    it('snapshots the catalog product on the saved line', async () => {
        const service = makeService() as unknown as {
            resolveLines: (l: typeof lines, c: string, d: string, s: boolean) => Promise<Array<Record<string, unknown>>>
        }
        const [saved] = await service.resolveLines([lines[0]], 'co-1', '2026-11-14', true)
        expect(saved).toMatchObject({
            productId: 'p-var',
            variantId: 'v-red',
            productName: 'Shirt',
            variantName: 'Red / M',
            sku: 'SHIRT-RED-M',
            materialId: 'm-vat',
            description: 'Shirt — Red / M',
        })
    })
})

describe('ExtPlatformTransactionService stock check', () => {
    const base = { companyId: 'co-1', transactionDate: '2026-11-14' }

    it('flags an out-of-stock company-owned line and keeps the others', async () => {
        stockBySku = { 'VAT-1': 0 }
        const result = await makeService().preview({
            ...base,
            lines: [
                { productId: 'p-vat', quantity: 1, unitPrice: 100 },
                { productId: 'p-ex', quantity: 1, unitPrice: 100 },
            ],
        })
        expect(result.lines[0]).toEqual({
            lineNumber: 1,
            error: "Vatable item is out of stock. Choose third-party stock if someone else's inventory was sold.",
        })
        expect(result.lines[1]).toMatchObject({ grossAmount: 100 })
        expect(result.totals.grandTotal).toBe(100)
    })

    it('sums the same item across lines against availability', async () => {
        stockBySku = { 'EX-1': 3 }
        const result = await makeService().preview({
            ...base,
            lines: [
                { productId: 'p-ex', quantity: 2, unitPrice: 100 },
                { productId: 'p-ex', quantity: 2, unitPrice: 100 },
            ],
        })
        expect(result.lines.map((l) => l.error)).toEqual([
            'Only 3 of Exempt item in stock (4 entered).',
            'Only 3 of Exempt item in stock (4 entered).',
        ])
    })

    it('does not limit third-party stock sales', async () => {
        stockBySku = { 'VAT-1': 0 }
        const result = await makeService().preview({
            ...base,
            isCompanyInventory: false,
            lines: [{ productId: 'p-vat', quantity: 5, unitPrice: 112 }],
        })
        expect(result.lines[0]).toMatchObject({ grossAmount: 560 })
    })

    it('refuses to save a company-owned sale above availability', async () => {
        stockBySku = { 'VAT-1': 1 }
        const service = makeService() as unknown as {
            resolveLines: (l: unknown[], c: string, d: string, s: boolean) => Promise<unknown>
        }
        const lines = [{ productId: 'p-vat', quantity: 2, unitPrice: 100 }]
        await expect(service.resolveLines(lines, 'co-1', '2026-11-14', true)).rejects.toThrow(
            'Only 1 of Vatable item in stock (2 entered).',
        )
        await expect(service.resolveLines(lines, 'co-1', '2026-11-14', false)).resolves.toHaveLength(1)
    })
})

describe('ExtPlatformTransactionService duplicate external reference', () => {
    it('blocks reusing another transaction reference but allows the same record on edit', async () => {
        const findUnique = jest.fn().mockResolvedValue({ id: 'tx-1', transactionNumber: 'EPT-000001' })
        const service = makeService(findUnique) as unknown as {
            assertUniqueRef: (s: string, c: string, r: string, ex?: string) => Promise<void>
        }
        await expect(service.assertUniqueRef('ss_lazada', 'co-1', 'LZ-1')).rejects.toBeInstanceOf(ConflictException)
        await expect(service.assertUniqueRef('ss_lazada', 'co-1', 'LZ-1', 'tx-1')).resolves.toBeUndefined()
    })
})
