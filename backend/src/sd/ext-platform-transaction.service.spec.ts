import { BadRequestException, ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'

const Decimal = Prisma.Decimal
import { FicoTaxCalculationService } from '../fico/fico-tax-calculation.service'
import { ExtPlatformTransactionService } from './ext-platform-transaction.service'
import type { PrismaService } from '../prisma/prisma.service'
import type { MaterialResolutionService } from './material-resolution.service'
import { SD_MM_ERROR, SdMmIntegrationException } from './sd-integration.errors'
import type { ProductService } from './product.service'
import type { CommercialAvailabilityService } from './commercial-availability.service'
import type { GoodsIssueService } from '../mm/stock-ops/goods-issue.service'

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
    { id: 'v-vat-def', productId: 'p-vat', variantName: 'Default', sku: 'VAT-1', materialId: 'm-vat', barcode: null },
    { id: 'v-red', productId: 'p-var', variantName: 'Red / M', sku: 'SHIRT-RED-M', materialId: 'm-vat', barcode: '4800001' },
]
/** Primary MM barcodes per material (m-none has none). */
const mmBarcodes = [
    { materialId: 'm-vat', barcodeValue: 'MM-VAT' },
    { materialId: 'm-ex', barcodeValue: 'MM-EX' },
]
const assignments: Record<string, string> = { 'p-ex': 'm-ex', 'p-none': 'm-none' }

/** Available quantity per SKU (MM ATP via the storefront batch); absent = plenty. */
let stockBySku: Record<string, number> = {}
/** Barcode the storefront availability reports per SKU; absent = none. */
const stockBarcodeBySku: Record<string, string> = { 'SHIRT': '4800001', 'VAT-1': 'MM-VAT' }

function makeService(findUnique: jest.Mock = jest.fn().mockResolvedValue(null)) {
    const byIds = <T extends { id: string }>(rows: T[]) =>
        jest.fn(({ where }) => Promise.resolve(rows.filter((r) => where.id.in.includes(r.id))))
    const prisma = {
        // Not batch-managed: line batch/lot tracking resolves to nothing in these tests.
        mmMaterial: { findMany: byIds(materials), findFirst: jest.fn().mockResolvedValue({ batchManaged: false }) },
        sdProduct: { findMany: byIds(products) },
        sdProductVariant: {
            findMany: byIds(variants),
            findFirst: jest.fn().mockResolvedValue(null),
        },
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
                        return {
                            sku,
                            availableQuantity: qty,
                            state: qty > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
                            // ProductService attaches the variant / primary MM barcode.
                            barcode: stockBarcodeBySku[sku] ?? null,
                        }
                    }),
                ),
        ),
        primaryMaterialBarcodes: jest.fn((ids: string[]) =>
            Promise.resolve(
                new Map(mmBarcodes.filter((b) => ids.includes(b.materialId)).map((b) => [b.materialId, b.barcodeValue])),
            ),
        ),
    }
    return new ExtPlatformTransactionService(
        prisma as unknown as PrismaService,
        new FicoTaxCalculationService(),
        materialResolution as unknown as MaterialResolutionService,
        productService as unknown as ProductService,
        {} as CommercialAvailabilityService,
        {} as GoodsIssueService,
        { recordAndDispatch: jest.fn(), reverseExtPlatformRevenueJournal: jest.fn() } as never,
        {
            resolveExtPlatformPolicy: jest.fn().mockResolvedValue({
                policy: 'FOLLOW_MATERIAL',
                requireMaterialTax: true,
            }),
            resolvePosPolicy: jest.fn(),
        } as never,
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
            taxUnconfiguredSales: 30,
            nonTaxableSales: 0,
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

describe('ExtPlatformTransactionService barcode', () => {
    type Resolver = {
        resolveLines: (l: unknown[], c: string, d: string, s: boolean) => Promise<Array<{ barcode: string | null }>>
    }

    it('saves the sold variant barcode, else the primary MM barcode, else nothing', async () => {
        const service = makeService() as unknown as Resolver
        const saved = await service.resolveLines(
            [
                { productId: 'p-var', variantId: 'v-red', quantity: 1, unitPrice: 560 },
                { productId: 'p-vat', quantity: 1, unitPrice: 100 },
                { productId: 'p-ex', quantity: 1, unitPrice: 100 },
                { productId: 'p-none', quantity: 1, unitPrice: 100 },
            ],
            'co-1',
            '2026-11-14',
            false,
        )
        expect(saved.map((l) => l.barcode)).toEqual(['4800001', 'MM-VAT', 'MM-EX', null])
    })

    it('shows the same barcode while entering the sale (stock lookup)', async () => {
        const rows = await makeService().stockFor([
            { productId: 'p-var', variantId: 'v-red' },
            { productId: 'p-vat' },
            { productId: 'p-none' },
        ])
        expect(rows.map((r) => r.barcode)).toEqual(['4800001', 'MM-VAT', null])
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

describe('ExtPlatformTransactionService stock movement on approval', () => {
    const baseTx = {
        id: 'tx-1',
        transactionNumber: 'EPT-000001',
        companyId: 'co-1',
        branchId: null,
        status: 'CONFIRMED',
        isCompanyInventory: true,
        approvedBy: null,
        approvedAt: null,
    }

    function makeStatusService(opts: {
        tx?: Partial<typeof baseTx>
        available?: number
        claimCount?: number
        postedIssues?: Array<{ id: string; status: string }>
    } = {}) {
        const tx = {
            ...baseTx,
            ...opts.tx,
            grandTotal: new Decimal(7300),
            taxTotal: new Decimal(0),
            platformFees: new Decimal(0),
            currency: 'PHP',
            salesSourceId: 'ss-1',
            salesSource: { code: 'SHOPEE' },
            transactionDate: new Date('2026-11-14'),
        }
        const persistedLine = {
            lineNumber: 1,
            materialId: 'm-1',
            productId: 'p-1',
            quantity: new Decimal(2),
            unitPrice: new Decimal(100),
            discount: new Decimal(0),
            productName: 'Necklace',
            materialCode: 'MAT-000028',
            materialName: 'Necklace',
            sku: 'SKU',
            uomId: 'uom-pcs',
            taxClassification: 'VATABLE',
            taxCodeId: 'tc-vat',
            barcode: null,
            variantId: null,
            variantName: null,
            description: null,
            batchNumber: null,
            lotNumber: null,
            expiryDate: null,
        }
        const sdAccounting = {
            recordAndDispatch: jest.fn().mockResolvedValue(undefined),
            reverseExtPlatformRevenueJournal: jest.fn().mockResolvedValue(undefined),
        }
        const prisma = {
            sdExtPlatformTransaction: {
                findUnique: jest.fn().mockImplementation((args: { include?: { lines?: unknown } }) => {
                    if (args?.include?.lines) {
                        return Promise.resolve({ ...tx, lines: [persistedLine] })
                    }
                    return Promise.resolve(tx)
                }),
                updateMany: jest.fn().mockResolvedValue({ count: opts.claimCount ?? 1 }),
                update: jest.fn().mockResolvedValue(tx),
            },
            sdExtPlatformTransactionLine: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        lineNumber: 1,
                        materialId: 'm-1',
                        quantity: 2,
                        productName: 'Necklace',
                        materialCode: 'MAT-000028',
                        taxClassification: 'VATABLE',
                        taxCodeId: 'tc-vat',
                    },
                ]),
                deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            mmGoodsIssue: { findMany: jest.fn().mockResolvedValue(opts.postedIssues ?? []) },
            mmGoodsIssueLine: { deleteMany: jest.fn() },
            warehouse: { findMany: jest.fn().mockResolvedValue([]) },
            mmMaterial: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: 'm-1',
                        materialCode: 'MAT-000028',
                        materialName: 'Necklace',
                        sku: 'SKU',
                        baseUomId: 'uom-pcs',
                        salesUom: null,
                        taxClassification: 'VATABLE',
                        taxCodeId: 'tc-vat',
                        priceTaxTreatment: 'VAT_INCLUSIVE',
                        taxCode: vatCode,
                    },
                ]),
                findFirst: jest
                    .fn()
                    .mockResolvedValue({ batchManaged: false, defaultExpiryDate: null }),
                findUnique: jest.fn().mockResolvedValue({ baseUomId: 'uom-pcs' }),
            },
            sdProductVariant: { findFirst: jest.fn().mockResolvedValue(null) },
            mmBatch: { findFirst: jest.fn().mockResolvedValue(null) },
            mmInventoryBalance: {
                findMany: jest.fn().mockResolvedValue([
                    { warehouseId: 'wh-1', storageBinId: 'bin-1', quantity: (opts.available ?? 5) + 1, reservedQuantity: 1 },
                ]),
            },
        }
        const goodsIssue = {
            create: jest.fn().mockResolvedValue({ id: 'gi-1' }),
            verifySupervisor: jest.fn().mockResolvedValue({}),
            post: jest.fn().mockResolvedValue({ id: 'gi-1', status: 'POSTED' }),
            reverse: jest.fn().mockResolvedValue({}),
        }
        const prismaWithTx = prisma as unknown as {
            $transaction: jest.Mock
        }
        prismaWithTx.$transaction = jest
            .fn()
            .mockImplementation(async (fn: (db: typeof prisma) => unknown) => fn(prisma))
        const service = new ExtPlatformTransactionService(
            prisma as unknown as PrismaService,
            new FicoTaxCalculationService(),
            {} as MaterialResolutionService,
            {
                primaryMaterialBarcodes: jest.fn().mockResolvedValue(new Map()),
            } as unknown as ProductService,
            {} as CommercialAvailabilityService,
            goodsIssue as unknown as GoodsIssueService,
            sdAccounting as never,
            {
                resolveExtPlatformPolicy: jest.fn().mockResolvedValue({
                    policy: 'FOLLOW_MATERIAL',
                    requireMaterialTax: true,
                }),
                resolvePosPolicy: jest.fn(),
            } as never,
        )
        return { service, prisma, goodsIssue, sdAccounting }
    }

    it('posts an MM goods issue from available stock when a company-owned sale is approved', async () => {
        const { service, goodsIssue, sdAccounting } = makeStatusService()
        await service.updateStatus('tx-1', { status: 'APPROVED' }, 'user-1')

        expect(goodsIssue.create).toHaveBeenCalledWith(
            expect.objectContaining({
                companyId: 'co-1',
                warehouseId: 'wh-1',
                issuePurpose: 'SALES',
                sourceDocumentType: 'EXT_PLATFORM_SALE',
                sourceDocumentId: 'tx-1',
                lines: [{ materialId: 'm-1', quantity: 2, uomId: 'uom-pcs', storageBinId: 'bin-1' }],
            }),
        )
        expect(goodsIssue.verifySupervisor).toHaveBeenCalledWith('gi-1', expect.objectContaining({ sourceDocumentReference: 'EPT-000001' }))
        expect(goodsIssue.post).toHaveBeenCalledWith('gi-1')
        expect(sdAccounting.recordAndDispatch).toHaveBeenCalledWith(
            expect.objectContaining({
                eventType: 'ExtPlatformSaleApproved',
                documentId: 'tx-1',
            }),
        )
    })

    it('refuses the approval and restores the status when available stock is short', async () => {
        const { service, prisma, goodsIssue } = makeStatusService({ available: 1 })
        await expect(service.updateStatus('tx-1', { status: 'APPROVED' }, 'user-1')).rejects.toThrow(
            'Not enough available stock for Necklace: 1 short',
        )
        expect(goodsIssue.create).not.toHaveBeenCalled()
        expect(prisma.sdExtPlatformTransaction.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: 'CONFIRMED' }) }),
        )
    })

    it('moves no stock for a third-party sale', async () => {
        const { service, goodsIssue } = makeStatusService({ tx: { isCompanyInventory: false } })
        await service.updateStatus('tx-1', { status: 'APPROVED' }, 'user-1')
        expect(goodsIssue.create).not.toHaveBeenCalled()
    })

    it('voiding an approved sale reverses its goods issue and keeps the reason', async () => {
        const { service, prisma, goodsIssue, sdAccounting } = makeStatusService({
            tx: { status: 'APPROVED' },
            postedIssues: [{ id: 'gi-9', status: 'POSTED' }],
        })
        await service.voidTransaction('tx-1', { reason: ' Wrong item ' }, 'user-1')
        expect(prisma.sdExtPlatformTransaction.updateMany).toHaveBeenCalledWith({
            where: { id: 'tx-1', status: 'APPROVED' },
            data: expect.objectContaining({
                status: 'CANCELLED',
                voidedBy: 'user-1',
                voidReason: 'Wrong item',
                voidedAt: expect.any(Date),
            }),
        })
        expect(goodsIssue.reverse).toHaveBeenCalledWith('gi-9', 'user-1')
        expect(sdAccounting.reverseExtPlatformRevenueJournal).toHaveBeenCalled()
    })

    it('voiding a confirmed sale moves no stock', async () => {
        const { service, goodsIssue } = makeStatusService({ tx: { status: 'CONFIRMED' } })
        await service.voidTransaction('tx-1', { reason: 'Duplicate' }, 'user-1')
        expect(goodsIssue.reverse).not.toHaveBeenCalled()
    })

    it('requires a reason and refuses drafts', async () => {
        const { service } = makeStatusService({ tx: { status: 'APPROVED' } })
        await expect(service.voidTransaction('tx-1', { reason: '   ' })).rejects.toThrow('Enter why the sale is voided.')
        const draft = makeStatusService({ tx: { status: 'DRAFT' } })
        await expect(draft.service.voidTransaction('tx-1', { reason: 'x' })).rejects.toThrow('Only confirmed or approved sales')
    })

    it('is idempotent for an already voided sale', async () => {
        const { service, prisma, goodsIssue } = makeStatusService({ tx: { status: 'CANCELLED' } })
        await service.voidTransaction('tx-1', { reason: 'again' }, 'user-1')
        expect(prisma.sdExtPlatformTransaction.updateMany).not.toHaveBeenCalled()
        expect(goodsIssue.reverse).not.toHaveBeenCalled()
    })

    it('rejects a second simultaneous void', async () => {
        const { service, goodsIssue } = makeStatusService({ tx: { status: 'APPROVED' }, claimCount: 0 })
        await expect(service.voidTransaction('tx-1', { reason: 'x' })).rejects.toBeInstanceOf(ConflictException)
        expect(goodsIssue.reverse).not.toHaveBeenCalled()
    })

    it('restores the sale when the stock reversal fails', async () => {
        const { service, prisma, goodsIssue } = makeStatusService({
            tx: { status: 'APPROVED' },
            postedIssues: [{ id: 'gi-9', status: 'POSTED' }],
        })
        goodsIssue.reverse.mockRejectedValueOnce(new Error('reverse failed'))
        await expect(service.voidTransaction('tx-1', { reason: 'x' }, 'user-1')).rejects.toThrow('reverse failed')
        expect(prisma.sdExtPlatformTransaction.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { status: 'APPROVED', voidedAt: null, voidedBy: null, voidReason: null },
            }),
        )
    })

    it('rejects a second simultaneous approval instead of issuing stock twice', async () => {
        const { service, goodsIssue } = makeStatusService({ claimCount: 0 })
        await expect(service.updateStatus('tx-1', { status: 'APPROVED' }, 'user-1')).rejects.toBeInstanceOf(ConflictException)
        expect(goodsIssue.create).not.toHaveBeenCalled()
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
