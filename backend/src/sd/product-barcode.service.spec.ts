import { BadRequestException, ConflictException } from '@nestjs/common'
import { ProductBarcodeService } from './product-barcode.service'

const MATERIAL = {
    id: 'm1',
    materialCode: 'MAT-000001',
    sku: 'SKU-1',
    materialName: 'Kirkland Vitamin E',
    description: null,
    brand: 'Kirkland',
    status: 'ACTIVE',
    sellable: true,
    standardCost: 100,
    companyId: 'c1',
    materialCategory: { id: 'cat-1', name: 'Vitamins' },
    baseUom: { id: 'uom-1', code: 'PCS' },
}

function makePrisma(overrides: Record<string, unknown> = {}) {
    return {
        company: { findUnique: jest.fn().mockResolvedValue({ id: 'c1' }) },
        mmBarcode: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: 'bc1' }),
        },
        sdProductVariant: { findFirst: jest.fn().mockResolvedValue(null) },
        mmMaterial: {
            findFirst: jest.fn().mockResolvedValue(MATERIAL),
            findUniqueOrThrow: jest.fn(async ({ where }: any) => ({
                id: where.id,
                materialName: 'Kirkland Vitamin E',
                materialCategory: { name: 'Vitamins' },
            })),
        },
        mmMaterialCategory: {
            findFirst: jest.fn().mockResolvedValue({ id: 'cat-1', name: 'Vitamins' }),
        },
        mmUom: { findFirst: jest.fn().mockResolvedValue({ id: 'uom-1', code: 'PCS' }) },
        mmMaterialType: { findFirst: jest.fn().mockResolvedValue({ id: 'type-1' }) },
        warehouse: { findFirst: jest.fn().mockResolvedValue(null) },
        wmStorageBin: { findFirst: jest.fn().mockResolvedValue(null) },
        $transaction: jest.fn(async (fn: any) => fn({ mmBarcode: { create: jest.fn() } })),
        ...overrides,
    }
}

describe('ProductBarcodeService', () => {
    const resolver = { resolve: jest.fn() }
    const materials = { createWithClient: jest.fn(), postImportOpeningStock: jest.fn() }
    const productFamily = { createProductFamily: jest.fn() }
    const availability = { getCompanyMaterialLedger: jest.fn().mockResolvedValue(null) }

    beforeEach(() => jest.clearAllMocks())

    const build = (prisma: any) =>
        new ProductBarcodeService(
            prisma,
            resolver as any,
            materials as any,
            productFamily as any,
            availability as any,
        )

    it('reports an unknown barcode without writing anything', async () => {
        resolver.resolve.mockRejectedValue(new Error('not found'))
        const prisma = makePrisma()
        const service = build(prisma)

        const result = await service.lookup('0000000000', 'c1')

        expect(result.found).toBe(false)
        expect(result.message).toContain('Barcode not found')
        expect(prisma.mmBarcode.create).not.toHaveBeenCalled()
        expect(materials.createWithClient).not.toHaveBeenCalled()
    })

    it('loads an existing material and asks to list it when no SD listing exists', async () => {
        resolver.resolve.mockResolvedValue({ materialId: 'm1' })
        const prisma = makePrisma()
        const service = build(prisma)

        const result = await service.lookup('4801234567890', 'c1')

        expect(result.found).toBe(true)
        expect(result.action).toBe('MATERIAL_FOUND_NOT_LISTED')
        expect(result.material?.materialCode).toBe('MAT-000001')
        expect(result.listing).toBeNull()
        expect(prisma.mmBarcode.create).not.toHaveBeenCalled()
    })

    it('opens the existing listing when the material is already in the catalog', async () => {
        resolver.resolve.mockResolvedValue({ materialId: 'm1' })
        const prisma = makePrisma({
            sdProductVariant: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'v1',
                    sku: 'SKU-1-V01',
                    variantName: 'Default',
                    price: 150,
                    product: {
                        id: 'p1',
                        name: 'Kirkland Vitamin E',
                        sku: 'RET-1',
                        price: 150,
                        isActive: true,
                        status: 'ACTIVE',
                    },
                }),
            },
        })
        const service = build(prisma)

        const result = await service.lookup('4801234567890', 'c1')

        expect(result.action).toBe('OPEN_IN_CATALOG')
        expect(result.listing?.productId).toBe('p1')
        expect(productFamily.createProductFamily).not.toHaveBeenCalled()
    })

    it('quick-add creates the MM material first, then the SD listing', async () => {
        const prisma = makePrisma()
        materials.createWithClient.mockResolvedValue({
            id: 'm-new',
            materialName: 'New Item',
            materialCode: 'MAT-000099',
        })
        resolver.resolve.mockResolvedValue({ materialId: 'm-new' })
        productFamily.createProductFamily.mockResolvedValue({ id: 'p-new' })

        const service = build(prisma)
        const result = await service.quickAdd({
            barcode: '4809999999999',
            productName: 'New Item',
            category: 'Vitamins',
            uom: 'PCS',
            unitCost: 50,
            srp: 75,
            companyId: 'c1',
            divisionId: 'DIV_RETAIL',
        })

        expect(prisma.$transaction).toHaveBeenCalledTimes(1)
        expect(materials.createWithClient).toHaveBeenCalledWith(
            expect.objectContaining({
                materialName: 'New Item',
                companyId: 'c1',
                standardCost: 50,
            }),
            expect.anything(),
        )
        expect(productFamily.createProductFamily).toHaveBeenCalledWith(
            expect.objectContaining({
                existingMaterialId: 'm-new',
                price: 75,
                idempotencyKey: 'quick-add:m-new',
            }),
        )
        expect(result.createdMaterial).toBe(true)
        expect(result.createdListing).toBe(true)
    })

    it('a repeated quick-add does not create a second material', async () => {
        resolver.resolve.mockResolvedValue({ materialId: 'm1' })
        const prisma = makePrisma({
            mmBarcode: {
                findFirst: jest.fn().mockResolvedValue({ materialId: 'm1' }),
                create: jest.fn(),
            },
        })
        const service = build(prisma)

        await service.quickAdd({
            barcode: '4801234567890',
            srp: 150,
            companyId: 'c1',
        })

        expect(materials.createWithClient).not.toHaveBeenCalled()
        expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('rejects a barcode that belongs to a material without a linked listing when no SRP is given', async () => {
        resolver.resolve.mockResolvedValue({ materialId: 'm1' })
        const prisma = makePrisma({
            mmBarcode: {
                findFirst: jest.fn().mockResolvedValue({ materialId: 'm1' }),
                create: jest.fn(),
            },
        })
        const service = build(prisma)

        await expect(
            service.quickAdd({ barcode: '4801234567890', companyId: 'c1' }),
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(productFamily.createProductFamily).not.toHaveBeenCalled()
    })

    it('rejects a quick-add pointing at a material that no longer exists', async () => {
        resolver.resolve.mockResolvedValue({ materialId: 'gone' })
        const prisma = makePrisma({
            mmBarcode: {
                findFirst: jest.fn().mockResolvedValue({ materialId: 'gone' }),
                create: jest.fn(),
            },
            mmMaterial: { findFirst: jest.fn().mockResolvedValue(null) },
        })
        const service = build(prisma)

        await expect(
            service.quickAdd({
                barcode: '4801234567890',
                srp: 150,
                companyId: 'c1',
            }),
        ).rejects.toBeInstanceOf(ConflictException)
    })
})
