import { Test, TestingModule } from '@nestjs/testing'
import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common'
import { ProductVariantService } from './product-variant.service'
import { PrismaService } from '../prisma/prisma.service'
import { ProductOptionVariantsService } from './product-option-variants.service'
import { ProductMaterialLinkService } from './product-material-link.service'
import { CommercialAvailabilityService } from './commercial-availability.service'
import { InventoryAvailabilityService } from '../mm/inventory/inventory-availability.service'

/**
 * Add / Edit a child Product Variant.
 *
 * Contract:
 *  - a variant is a child of an EXISTING parent product (never a new one)
 *  - a variant links an EXISTING Material Master item (never creates one)
 *  - the material must exist, belong to the same company, be active, be
 *    sellable, have a Stock Keeping Unit and not back another active variant
 *  - a duplicate combination is a conflict
 *  - a double submit (same idempotency key) creates exactly one variant
 */

const mockPrisma = {
    sdProduct: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
    },
    sdProductVariant: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
    },
    sdProductVariantOptionValue: { create: jest.fn(), deleteMany: jest.fn() },
    sdProductOption: { findMany: jest.fn() },
    mmMaterial: { findFirst: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
}

const mockOptionVariants = {
    getForProduct: jest.fn(),
}

const mockMaterialLink = {
    assertLinkable: jest.fn(),
    assertNotLinked: jest.fn(),
    markManuallyLinked: jest.fn(),
    resolveVariantSku: jest.fn(),
    resolveVariantBarcode: jest.fn(),
}

const mockAvailability = {
    getCompanyMaterialLedger: jest.fn(),
}

const mockInventoryAtp = {
    getPickableMaterialTotalsBatch: jest.fn(),
}

const material = {
    id: 'mat-1',
    materialCode: 'MAT-000101',
    materialName: 'Classic Cotton Shirt - Black / Medium',
    sku: 'SHIRT-BLK-M',
    status: 'ACTIVE',
    sellable: true,
    companyId: 'c-1',
    baseUomId: 'uom-1',
    deletedAt: null,
}

const parent = {
    id: 'product-1',
    sku: 'RET-PRD-000001',
    name: 'Classic Cotton Shirt',
    materialAssignments: [{ companyId: 'c-1' }],
    options: [
        {
            id: 'opt-1',
            name: 'Color',
            sortOrder: 0,
            values: [
                { id: 'val-1', value: 'Black', sortOrder: 0 },
                { id: 'val-2', value: 'White', sortOrder: 1 },
            ],
        },
        {
            id: 'opt-2',
            name: 'Size',
            sortOrder: 1,
            values: [
                { id: 'val-3', value: 'Medium', sortOrder: 0 },
                { id: 'val-4', value: 'Large', sortOrder: 1 },
            ],
        },
    ],
    variants: [] as Array<{
        id: string
        isActive: boolean
        isDefault: boolean
        companyId: string | null
        sortOrder: number
    }>,
}

describe('ProductVariantService', () => {
    let service: ProductVariantService

    beforeEach(async () => {
        jest.clearAllMocks()

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProductVariantService,
                { provide: PrismaService, useValue: mockPrisma },
                {
                    provide: ProductOptionVariantsService,
                    useValue: mockOptionVariants,
                },
                {
                    provide: ProductMaterialLinkService,
                    useValue: mockMaterialLink,
                },
                {
                    provide: CommercialAvailabilityService,
                    useValue: mockAvailability,
                },
                {
                    provide: InventoryAvailabilityService,
                    useValue: mockInventoryAtp,
                },
            ],
        }).compile()
        service = module.get(ProductVariantService)

        mockPrisma.$transaction.mockImplementation(
            (fn: (client: unknown) => Promise<unknown>) => fn(mockPrisma),
        )
        mockPrisma.sdProduct.findUnique.mockResolvedValue(parent)
        mockPrisma.sdProduct.findFirst.mockResolvedValue(null)
        mockPrisma.sdProductVariant.findFirst.mockResolvedValue(null)
        mockPrisma.sdProductVariant.findMany.mockResolvedValue([])
        mockPrisma.sdProductVariant.create.mockImplementation(
            async (args: any) => ({ id: 'variant-new', ...args.data }),
        )
        mockPrisma.sdProductVariant.update.mockImplementation(
            async (args: any) => ({ id: args.where.id, ...args.data }),
        )
        mockPrisma.sdProductVariant.updateMany.mockResolvedValue({ count: 0 })
        mockPrisma.sdProduct.update.mockImplementation(async (args: any) => ({
            id: args.where.id,
            ...args.data,
        }))
        mockPrisma.sdProductVariantOptionValue.create.mockImplementation(
            async (args: any) => ({ id: 'link-1', ...args.data }),
        )
        mockPrisma.sdProductVariantOptionValue.deleteMany.mockResolvedValue({
            count: 0,
        })
        mockPrisma.sdProductOption.findMany.mockResolvedValue(parent.options)
        mockOptionVariants.getForProduct.mockResolvedValue({
            options: [],
            variants: [],
        })
        mockMaterialLink.assertLinkable.mockImplementation(
            async (_tx: unknown, materialId: string) => ({
                ...material,
                id: materialId,
                materialCode: `MAT-${materialId}`,
                sku: `SKU-${materialId}`,
            }),
        )
        mockMaterialLink.assertNotLinked.mockResolvedValue(undefined)
        mockMaterialLink.markManuallyLinked.mockResolvedValue(undefined)
        mockMaterialLink.resolveVariantSku.mockResolvedValue(material.sku)
        mockMaterialLink.resolveVariantBarcode.mockResolvedValue(null)
    })

    const dto = {
        materialId: 'mat-1',
        optionValues: ['Black', 'Medium'],
    }

    // ── 1-4: the happy path ────────────────────────────────────────────────

    it('1. increases the variant count by exactly one', async () => {
        await service.addVariant('product-1', dto)

        expect(mockPrisma.sdProductVariant.create).toHaveBeenCalledTimes(1)
        expect(mockPrisma.sdProductVariant.create.mock.calls[0][0].data)
            .toMatchObject({ productId: 'product-1' })
    })

    it('2. does NOT create another parent product', async () => {
        await service.addVariant('product-1', dto)

        expect(
            (mockPrisma.sdProduct as Record<string, unknown>).create,
        ).toBeUndefined()
        expect(mockPrisma.sdProduct.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'product-1' } }),
        )
    })

    it('3. does NOT create a Material Master record', async () => {
        await service.addVariant('product-1', dto)

        // No material insert exists on the Prisma surface used here.
        expect(
            (mockPrisma.mmMaterial as Record<string, unknown>).create,
        ).toBeUndefined()
        expect(mockMaterialLink.markManuallyLinked).toHaveBeenCalled()
    })

    it('4. links the variant to the existing material', async () => {
        await service.addVariant('product-1', dto)

        expect(mockMaterialLink.assertLinkable).toHaveBeenCalledWith(
            expect.anything(),
            'mat-1',
            'c-1',
        )
        const createArgs = mockPrisma.sdProductVariant.create.mock.calls[0][0]
        expect(createArgs.data.materialId).toBe('mat-1')
    })

    it('normalizes the combination key and links the option values', async () => {
        await service.addVariant('product-1', dto)

        const createArgs = mockPrisma.sdProductVariant.create.mock.calls[0][0]
        expect(createArgs.data.combinationKey).toBe('color:black|size:medium')
        expect(
            mockPrisma.sdProductVariantOptionValue.create,
        ).toHaveBeenCalledTimes(2)
    })

    it('takes the SKU from the material Stock Keeping Unit', async () => {
        await service.addVariant('product-1', dto)

        expect(mockMaterialLink.resolveVariantSku).toHaveBeenCalled()
        const createArgs = mockPrisma.sdProductVariant.create.mock.calls[0][0]
        expect(createArgs.data.sku).toBe('SHIRT-BLK-M')
    })

    // ── 5-9: validation ─────────────────────────────────────────────────────

    it('5. rejects a missing material', async () => {
        mockMaterialLink.assertLinkable.mockRejectedValue(
            new NotFoundException(
                'Variant was not added because the selected material no longer exists.',
            ),
        )
        await expect(service.addVariant('product-1', dto)).rejects.toThrow(
            NotFoundException,
        )
        expect(mockPrisma.sdProductVariant.create).not.toHaveBeenCalled()
    })

    it('6. rejects a cross-company material', async () => {
        mockMaterialLink.assertLinkable.mockRejectedValue(
            new BadRequestException(
                'The selected material belongs to another company.',
            ),
        )
        await expect(service.addVariant('product-1', dto)).rejects.toThrow(
            /another company/,
        )
        expect(mockPrisma.sdProductVariant.create).not.toHaveBeenCalled()
    })

    it('7. rejects an inactive material', async () => {
        mockMaterialLink.assertLinkable.mockRejectedValue(
            new BadRequestException(
                'The selected material is not active. Activate it in Materials Management first.',
            ),
        )
        await expect(service.addVariant('product-1', dto)).rejects.toThrow(
            /not active/,
        )
    })

    it('8. rejects a material already linked to another active variant', async () => {
        mockMaterialLink.assertNotLinked.mockRejectedValue(
            new ConflictException(
                'This material is already linked to another variant.',
            ),
        )
        await expect(service.addVariant('product-1', dto)).rejects.toThrow(
            ConflictException,
        )
        expect(mockPrisma.sdProductVariant.create).not.toHaveBeenCalled()
    })

    it('9. rejects a duplicate combination', async () => {
        mockPrisma.sdProductVariant.findFirst.mockResolvedValue({
            id: 'variant-existing',
            sku: 'SHIRT-BLK-M',
        })
        await expect(service.addVariant('product-1', dto)).rejects.toThrow(
            /already exists/,
        )
        expect(mockPrisma.sdProductVariant.create).not.toHaveBeenCalled()
    })

    it('rejects a product that does not exist', async () => {
        mockPrisma.sdProduct.findUnique.mockResolvedValue(null)
        await expect(service.addVariant('product-1', dto)).rejects.toThrow(
            NotFoundException,
        )
    })

    it('rejects an option value that is not offered', async () => {
        mockPrisma.sdProductOption.findMany.mockResolvedValue([
            {
                id: 'opt-1',
                name: 'Color',
                values: [{ id: 'val-1', value: 'Black' }],
            },
            {
                id: 'opt-2',
                name: 'Size',
                values: [{ id: 'val-3', value: 'Medium' }],
            },
        ])
        await expect(
            service.addVariant('product-1', {
                ...dto,
                optionValues: ['Black', 'Ginormous'],
            }),
        ).rejects.toThrow(/not an available value/)
    })

    // ── 10: idempotency ────────────────────────────────────────────────────

    it('10. a double submit creates exactly one variant', async () => {
        const idempotencyKey = '8f0c0f3e-1c2b-4a5d-9e8f-0a1b2c3d4e5f'

        // First call creates the variant.
        await service.addVariant('product-1', { ...dto, idempotencyKey })
        expect(mockPrisma.sdProductVariant.create).toHaveBeenCalledTimes(1)

        // The retry finds the stored key and returns the product unchanged.
        mockPrisma.sdProductVariant.findFirst.mockResolvedValue({
            id: 'variant-new',
        })
        await service.addVariant('product-1', { ...dto, idempotencyKey })
        expect(mockPrisma.sdProductVariant.create).toHaveBeenCalledTimes(1)
    })

    // ── 12: editing never creates a material ───────────────────────────────

    it('12. editing a variant does not create a material', async () => {
        mockPrisma.sdProductVariant.findFirst.mockResolvedValue({
            id: 'variant-1',
            productId: 'product-1',
            materialId: 'mat-1',
            product: {
                id: 'product-1',
                materialAssignments: [{ companyId: 'c-1' }],
                variants: [{ companyId: 'c-1' }],
                options: parent.options,
            },
        })

        await service.updateVariant('product-1', 'variant-1', {
            variantName: 'Black / Medium (renamed)',
            price: 599,
        })

        expect(
            (mockPrisma.mmMaterial as Record<string, unknown>).create,
        ).toBeUndefined()
        expect(mockPrisma.sdProductVariant.update).toHaveBeenCalled()
    })

    it('relinks to a new material without deleting the old one', async () => {
        mockPrisma.sdProductVariant.findFirst.mockResolvedValue({
            id: 'variant-1',
            productId: 'product-1',
            materialId: 'mat-old',
            product: {
                id: 'product-1',
                materialAssignments: [{ companyId: 'c-1' }],
                variants: [{ companyId: 'c-1' }],
                options: parent.options,
            },
        })
        mockMaterialLink.resolveVariantSku.mockResolvedValue('SHIRT-BLK-L')

        await service.updateVariant('product-1', 'variant-1', {
            materialId: 'mat-new',
        })

        expect(mockMaterialLink.assertLinkable).toHaveBeenCalledWith(
            expect.anything(),
            'mat-new',
            'c-1',
        )
        const updateArgs = mockPrisma.sdProductVariant.update.mock.calls[0][0]
        expect(updateArgs.data.materialId).toBe('mat-new')
        // The old material is untouched — nothing deletes it.
        expect(
            (mockPrisma.mmMaterial as Record<string, unknown>).deleteMany,
        ).toBeUndefined()
    })

    // ── 13: a product WITHOUT options may still have several variants ──────

    describe('a product without customer-selectable options', () => {
        /** The product has no option groups, so there is no combination. */
        const optionlessParent = {
            ...parent,
            options: [],
            variants: [
                {
                    id: 'variant-default',
                    isActive: true,
                    isDefault: true,
                    companyId: 'c-1',
                    sortOrder: 0,
                },
            ],
        }

        beforeEach(() => {
            mockPrisma.sdProduct.findUnique.mockResolvedValue(optionlessParent)
            mockPrisma.sdProductOption.findMany.mockResolvedValue([])
        })

        it('adds a second variant instead of reporting a duplicate', async () => {
            await service.addVariant('product-1', {
                materialId: 'mat-2',
                optionValues: [],
            })

            expect(mockPrisma.sdProductVariant.create).toHaveBeenCalledTimes(1)
            const createArgs = mockPrisma.sdProductVariant.create.mock.calls[0][0]
            // The variant is keyed by its material, so it cannot collide with
            // the default variant that already owns "__default__".
            expect(createArgs.data.combinationKey).toBe('material:mat-2')
        })

        it('does not run the combination clash check', async () => {
            // A clash on the combination key would be wrong here: there is no
            // combination. The material check is the one that applies.
            mockPrisma.sdProductVariant.findFirst.mockResolvedValue({
                id: 'variant-default',
                sku: 'SKU-000010',
            })

            await service.addVariant('product-1', {
                materialId: 'mat-2',
                optionValues: [],
            })

            expect(mockPrisma.sdProductVariant.create).toHaveBeenCalledTimes(1)
        })

        it('reports the material clash, not a combination clash', async () => {
            mockMaterialLink.assertNotLinked.mockRejectedValue(
                new ConflictException(
                    'This material is already linked to another variant.',
                ),
            )

            await expect(
                service.addVariant('product-1', {
                    materialId: 'mat-2',
                    optionValues: [],
                }),
            ).rejects.toThrow(/already linked to another variant/)
            expect(mockPrisma.sdProductVariant.create).not.toHaveBeenCalled()
        })

        it('re-keys the variant when its material changes', async () => {
            mockPrisma.sdProductVariant.findFirst.mockResolvedValue({
                id: 'variant-1',
                productId: 'product-1',
                materialId: 'mat-old',
                product: {
                    id: 'product-1',
                    materialAssignments: [{ companyId: 'c-1' }],
                    variants: [{ companyId: 'c-1' }],
                    options: [],
                },
            })
            mockMaterialLink.resolveVariantSku.mockResolvedValue('SKU-NEW')

            await service.updateVariant('product-1', 'variant-1', {
                materialId: 'mat-new',
            })

            const updateArgs = mockPrisma.sdProductVariant.update.mock.calls[0][0]
            expect(updateArgs.data.combinationKey).toBe('material:mat-new')
        })

        it('un-hides the SIMPLE default variant so it stays sellable', async () => {
            mockPrisma.sdProduct.findUnique.mockResolvedValue({
                ...optionlessParent,
                variants: [
                    {
                        id: 'variant-default',
                        isActive: true,
                        isDefault: true,
                        isHidden: true,
                        companyId: 'c-1',
                        sortOrder: 0,
                    },
                ],
            })

            await service.addVariant('product-1', {
                materialId: 'mat-2',
                optionValues: [],
            })

            // The hidden default becomes a normal, visible choice.
            expect(mockPrisma.sdProductVariant.update).toHaveBeenCalledWith({
                where: { id: 'variant-default' },
                data: { isHidden: false },
            })
        })

        it('takes the barcode from the material when none is given', async () => {
            mockMaterialLink.resolveVariantBarcode.mockResolvedValue(
                '4800000000101',
            )

            await service.addVariant('product-1', {
                materialId: 'mat-2',
                optionValues: [],
            })

            const createArgs = mockPrisma.sdProductVariant.create.mock.calls[0][0]
            expect(createArgs.data.barcode).toBe('4800000000101')
            expect(mockMaterialLink.resolveVariantBarcode).toHaveBeenCalledWith(
                expect.anything(),
                'mat-2',
                undefined,
            )
        })
    })
})
