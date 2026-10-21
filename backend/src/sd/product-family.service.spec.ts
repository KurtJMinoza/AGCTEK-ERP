import { Test, TestingModule } from '@nestjs/testing'
import { ConflictException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { ProductFamilyService } from './product-family.service'
import { PrismaService } from '../prisma/prisma.service'
import { MaterialsService } from '../mm/materials/materials.service'

/**
 * Product-family creation contract:
 *  - one parent product, one variant per enabled combination
 *  - exactly one Material Master per variant (independently stocked)
 *  - the parent product NEVER holds stock for a VARIABLE product
 *  - simple products get one hidden default variant
 *  - adding a variant later creates only the MISSING combinations
 *  - duplicate combinations are rejected, failures roll the whole thing back
 */

const mockPrisma = {
    sdProduct: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    },
    sdProductOption: { create: jest.fn() },
    sdProductOptionValue: { create: jest.fn() },
    sdProductVariant: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
    },
    sdProductVariantOptionValue: { create: jest.fn() },
    sdProductMaterialAssignment: { create: jest.fn() },
    mmMaterial: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
    },
    mmMaterialCategory: { findUnique: jest.fn() },
    company: { findUnique: jest.fn() },
    $transaction: jest.fn(),
}

const mockMaterialsService = {
    createWithClient: jest.fn(),
}

/** The transaction client is the same mock surface as prisma. */
const tx = mockPrisma

const materialDefaults = {
    companyId: 'c-1',
    materialTypeId: 'mt-1',
    materialCategoryId: 'mc-1',
    baseUomId: 'uom-1',
}

const variableDto = {
    divisionId: 'DIV_RETAIL',
    name: 'Classic Cotton Shirt',
    price: 599,
    productConfig: 'VARIABLE' as const,
    materialDefaults,
    options: [
        {
            name: 'Color',
            values: [{ value: 'Black' }, { value: 'White' }],
        },
        {
            name: 'Size',
            values: [{ value: 'Medium' }, { value: 'Large' }],
        },
    ],
    variants: [
        { enabled: true, optionValues: ['Black', 'Medium'] },
        { enabled: true, optionValues: ['Black', 'Large'] },
        { enabled: true, optionValues: ['White', 'Medium'] },
        { enabled: true, optionValues: ['White', 'Large'] },
    ],
}

describe('ProductFamilyService', () => {
    let service: ProductFamilyService
    let optionSeq: number
    let valueSeq: number
    let variantSeq: number
    let materialSeq: number

    beforeEach(async () => {
        jest.clearAllMocks()
        optionSeq = 0
        valueSeq = 0
        variantSeq = 0
        materialSeq = 0

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProductFamilyService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: MaterialsService, useValue: mockMaterialsService },
            ],
        }).compile()
        service = module.get(ProductFamilyService)

        mockPrisma.$transaction.mockImplementation(
            (fn: (client: unknown) => Promise<unknown>) => fn(tx),
        )
        mockPrisma.company.findUnique.mockResolvedValue({ id: 'c-1' })
        mockPrisma.mmMaterialCategory.findUnique.mockResolvedValue({
            name: 'Apparel',
        })
        mockPrisma.sdProduct.findMany.mockResolvedValue([])
        mockPrisma.sdProduct.update.mockImplementation(async (args: any) => ({
            ...args.data,
        }))
        mockPrisma.sdProduct.create.mockImplementation(async (args: any) => ({
            id: 'product-1',
            sku: args.data.sku,
            name: args.data.name,
            price: new Decimal(args.data.price),
            ...args.data,
        }))

        tx.sdProductOption.create.mockImplementation(async (args: any) => ({
            id: `opt-${++optionSeq}`,
            name: args.data.name,
        }))
        tx.sdProductOptionValue.create.mockImplementation(async (args: any) => ({
            id: `val-${++valueSeq}`,
            optionId: args.data.optionId,
            value: args.data.value,
        }))
        tx.sdProductVariant.create.mockImplementation(async (args: any) => ({
            id: `variant-${++variantSeq}`,
            ...args.data,
        }))
        tx.sdProductVariant.update.mockImplementation(async (args: any) => ({
            id: args.where.id,
            ...args.data,
        }))
        tx.sdProductVariantOptionValue.create.mockImplementation(
            async (args: any) => ({ id: 'link-1', ...args.data }),
        )
        tx.sdProductMaterialAssignment.create.mockImplementation(
            async (args: any) => ({ id: 'assign-1', ...args.data }),
        )
        tx.mmMaterial.update.mockImplementation(async (args: any) => ({
            id: args.where.id,
            ...args.data,
        }))
        mockMaterialsService.createWithClient.mockImplementation(
            async (dto: any) => ({ id: `mat-${++materialSeq}`, ...dto }),
        )
    })

    /** The service loads the created product at the end of the transaction. */
    const mockLoadedProduct = (overrides: Record<string, unknown> = {}) => {
        mockPrisma.sdProduct.findUniqueOrThrow.mockResolvedValue({
            id: 'product-1',
            sku: 'RET-PRD-000001',
            name: 'Classic Cotton Shirt',
            price: new Decimal(599),
            options: [],
            variants: [],
            ...overrides,
        })
    }

    describe('createProductFamily', () => {
        it('creates one parent, one variant per combination and one material per variant', async () => {
            mockLoadedProduct()
            await service.createProductFamily(variableDto)

            expect(tx.sdProduct.create).toHaveBeenCalledTimes(1)
            expect(tx.sdProductVariant.create).toHaveBeenCalledTimes(4)
            expect(mockMaterialsService.createWithClient).toHaveBeenCalledTimes(4)

            // Every variant owns a distinct material.
            const materials = mockMaterialsService.createWithClient.mock.calls.map(
                (call) => call[0],
            )
            expect(
                new Set(materials.map((m: any) => m.id ?? m.sku)).size,
            ).toBe(4)
            expect(
                materials.every((m: any) => m.catalogSource === 'AUTO_CREATED'),
            ).toBe(true)
            // Material name carries the parent name and the variant name.
            expect(materials[0].materialName).toBe(
                'Classic Cotton Shirt — Black / Medium',
            )
        })

        it('never creates a parent-level material assignment for a VARIABLE product', async () => {
            mockLoadedProduct()
            await service.createProductFamily(variableDto)

            expect(
                tx.sdProductMaterialAssignment.create,
            ).not.toHaveBeenCalled()
        })

        it('links each variant to its own material', async () => {
            mockLoadedProduct()
            await service.createProductFamily(variableDto)

            const variantUpdates = tx.sdProductVariant.update.mock.calls.map(
                (call) => call[0],
            )
            expect(variantUpdates).toHaveLength(4)
            const materialIds = variantUpdates.map(
                (args: any) => args.data.materialId,
            )
            expect(new Set(materialIds).size).toBe(4)
            expect(materialIds.every(Boolean)).toBe(true)
        })

        it('creates one hidden default variant for a SIMPLE product', async () => {
            mockLoadedProduct()
            await service.createProductFamily({
                divisionId: 'DIV_RETAIL',
                name: 'Kirkland Fish Oil',
                price: 299,
                productConfig: 'SIMPLE',
                materialDefaults,
            })

            expect(tx.sdProductVariant.create).toHaveBeenCalledTimes(1)
            const variantArgs = tx.sdProductVariant.create.mock.calls[0][0]
            expect(variantArgs.data.combinationKey).toBe('__default__')
            expect(variantArgs.data.isHidden).toBe(true)
            expect(variantArgs.data.isDefault).toBe(true)
            // A simple product keeps exactly one (unambiguous) parent link.
            expect(
                tx.sdProductMaterialAssignment.create,
            ).toHaveBeenCalledTimes(1)
            expect(mockMaterialsService.createWithClient).toHaveBeenCalledTimes(1)
        })

        it('sets the default variant on the parent', async () => {
            mockLoadedProduct()
            await service.createProductFamily(variableDto)

            const productUpdates = tx.sdProduct.update.mock.calls.map(
                (call) => call[0],
            )
            expect(
                productUpdates.some(
                    (args: any) => args.data.defaultVariantId === 'variant-1',
                ),
            ).toBe(true)
        })

        it('rejects duplicate combinations inside one request', async () => {
            mockLoadedProduct()
            await expect(
                service.createProductFamily({
                    ...variableDto,
                    variants: [
                        { enabled: true, optionValues: ['Black', 'Medium'] },
                        { enabled: true, optionValues: ['Black', 'Medium'] },
                    ],
                }),
            ).rejects.toThrow(ConflictException)
        })

        it('rejects a duplicate SKU inside one request', async () => {
            mockLoadedProduct()
            await expect(
                service.createProductFamily({
                    ...variableDto,
                    variants: [
                        {
                            enabled: true,
                            sku: 'SHIRT-BLK-M',
                            optionValues: ['Black', 'Medium'],
                        },
                        {
                            enabled: true,
                            sku: 'SHIRT-BLK-M',
                            optionValues: ['Black', 'Large'],
                        },
                    ],
                }),
            ).rejects.toThrow(ConflictException)
        })

        it('rolls the whole transaction back when a material cannot be created', async () => {
            mockLoadedProduct()
            mockMaterialsService.createWithClient.mockRejectedValueOnce(
                new Error('MM material creation failed'),
            )

            await expect(
                service.createProductFamily(variableDto),
            ).rejects.toThrow('MM material creation failed')
        })

        it('links an existing material instead of creating one', async () => {
            mockLoadedProduct()
            tx.mmMaterial.findUnique.mockResolvedValue({
                id: 'mat-existing',
                companyId: 'c-1',
                materialTypeId: 'mt-1',
                materialCategoryId: 'mc-1',
                baseUomId: 'uom-1',
            })

            await service.createProductFamily({
                ...variableDto,
                variants: [
                    {
                        enabled: true,
                        optionValues: ['Black', 'Medium'],
                        existingMaterialId: 'mat-existing',
                    },
                ],
            })

            expect(mockMaterialsService.createWithClient).not.toHaveBeenCalled()
            expect(tx.mmMaterial.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'mat-existing' },
                    data: expect.objectContaining({
                        catalogVariantId: 'variant-1',
                        catalogSource: 'MANUALLY_LINKED',
                    }),
                }),
            )
        })

        it('refuses to link a material from another company', async () => {
            mockLoadedProduct()
            tx.mmMaterial.findUnique.mockResolvedValue({
                id: 'mat-other',
                companyId: 'c-other',
            })

            await expect(
                service.createProductFamily({
                    ...variableDto,
                    variants: [
                        {
                            enabled: true,
                            optionValues: ['Black', 'Medium'],
                            existingMaterialId: 'mat-other',
                        },
                    ],
                }),
            ).rejects.toThrow(/different company/)
        })
    })

    describe('addVariants', () => {
        const existingProduct = {
            id: 'product-1',
            sku: 'RET-PRD-000001',
            name: 'Classic Cotton Shirt',
            productConfig: 'VARIABLE',
            price: new Decimal(599),
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
            variants: [
                {
                    id: 'variant-1',
                    sku: 'RET-PRD-000001-V01',
                    combinationKey: 'color:black|size:medium',
                    materialId: 'mat-1',
                    companyId: 'c-1',
                    sortOrder: 0,
                    isActive: true,
                },
                {
                    id: 'variant-2',
                    sku: 'RET-PRD-000001-V02',
                    combinationKey: 'color:black|size:large',
                    materialId: 'mat-2',
                    companyId: 'c-1',
                    sortOrder: 1,
                    isActive: true,
                },
                {
                    id: 'variant-3',
                    sku: 'RET-PRD-000001-V03',
                    combinationKey: 'color:white|size:medium',
                    materialId: 'mat-3',
                    companyId: 'c-1',
                    sortOrder: 2,
                    isActive: true,
                },
                {
                    id: 'variant-4',
                    sku: 'RET-PRD-000001-V04',
                    combinationKey: 'color:white|size:large',
                    materialId: 'mat-4',
                    companyId: 'c-1',
                    sortOrder: 3,
                    isActive: true,
                },
            ],
            materialAssignments: [],
        }

        beforeEach(() => {
            mockPrisma.sdProduct.findUnique.mockResolvedValue(existingProduct)
            // Reloaded product inside the transaction — the new option value is
            // already part of the option groups.
            mockLoadedProduct({
                ...existingProduct,
                options: existingProduct.options.map((option) => ({
                    ...option,
                    values: [
                        ...option.values,
                        ...(option.name === 'Size'
                            ? [{ id: 'val-5', value: 'Extra Large', sortOrder: 2 }]
                            : []),
                    ],
                })),
            })
            tx.mmMaterial.findUnique.mockResolvedValue({
                id: 'mat-1',
                companyId: 'c-1',
                materialTypeId: 'mt-1',
                materialCategoryId: 'mc-1',
                baseUomId: 'uom-1',
                defaultWarehouseId: 'wh-1',
            })
        })

        it('creates only the missing combinations and their materials', async () => {
            await service.addVariants(
                'product-1',
                [{ optionName: 'Size', values: ['Extra Large'] }],
                [
                    { enabled: true, optionValues: ['Black', 'Extra Large'] },
                    { enabled: true, optionValues: ['White', 'Extra Large'] },
                ],
            )

            // No second parent product.
            expect(tx.sdProduct.create).not.toHaveBeenCalled()
            expect(tx.sdProductVariant.create).toHaveBeenCalledTimes(2)
            expect(mockMaterialsService.createWithClient).toHaveBeenCalledTimes(2)
            // Still no parent-level assignment for the VARIABLE product.
            expect(
                tx.sdProductMaterialAssignment.create,
            ).not.toHaveBeenCalled()
        })

        it('never recreates an existing combination', async () => {
            await service.addVariants(
                'product-1',
                [],
                [{ enabled: true, optionValues: ['Black', 'Medium'] }],
            )

            expect(tx.sdProductVariant.create).not.toHaveBeenCalled()
            expect(mockMaterialsService.createWithClient).not.toHaveBeenCalled()
        })

        it('rejects a combination that repeats inside one request', async () => {
            await expect(
                service.addVariants(
                    'product-1',
                    [{ optionName: 'Size', values: ['Extra Large'] }],
                    [
                        { enabled: true, optionValues: ['Black', 'Extra Large'] },
                        { enabled: true, optionValues: ['Black', 'Extra Large'] },
                    ],
                ),
            ).rejects.toThrow(ConflictException)
        })

        it('rejects an option value that does not exist on the product', async () => {
            await expect(
                service.addVariants(
                    'product-1',
                    [],
                    [{ enabled: true, optionValues: ['Black', 'Ginormous'] }],
                ),
            ).rejects.toThrow(/not an available value/)
        })

        it('refuses to add variants to a SIMPLE product', async () => {
            mockPrisma.sdProduct.findUnique.mockResolvedValue({
                ...existingProduct,
                productConfig: 'SIMPLE',
            })
            await expect(
                service.addVariants('product-1', [], [
                    { enabled: true, optionValues: ['Black', 'Medium'] },
                ]),
            ).rejects.toThrow(/simple product/)
        })
    })
})
