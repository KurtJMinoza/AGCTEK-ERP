import { Test, TestingModule } from '@nestjs/testing'
import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { ProductFamilyService } from './product-family.service'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Product-family creation contract:
 *  - one parent product, one variant per enabled combination
 *  - every variant links an EXISTING MM material
 *  - the Product Catalog NEVER creates a material, a material SKU, an
 *    opening stock row or a stock balance
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
        findFirst: jest.fn(),
        findMany: jest.fn(),
    },
    sdProductVariantOptionValue: { create: jest.fn() },
    sdProductMaterialAssignment: { create: jest.fn() },
    mmMaterial: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    mmMaterialCategory: { findUnique: jest.fn() },
    company: { findUnique: jest.fn() },
    $transaction: jest.fn(),
}

const tx = mockPrisma

const materialDefaults = {
    companyId: 'c-1',
    materialTypeId: 'mt-1',
    materialCategoryId: 'mc-1',
    baseUomId: 'uom-1',
}

const linkableMaterial = {
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

describe('ProductFamilyService', () => {
    let service: ProductFamilyService
    let optionSeq: number
    let valueSeq: number
    let variantSeq: number

    beforeEach(async () => {
        jest.clearAllMocks()
        optionSeq = 0
        valueSeq = 0
        variantSeq = 0

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProductFamilyService,
                { provide: PrismaService, useValue: mockPrisma },
            ],
        }).compile()
        service = module.get(ProductFamilyService)

        mockPrisma.$transaction.mockImplementation(
            (fn: (client: unknown) => Promise<unknown>) => fn(tx),
        )
        mockPrisma.sdProduct.findMany.mockResolvedValue([])
        mockPrisma.company.findUnique.mockResolvedValue({ id: 'c-1' })
        mockPrisma.mmMaterialCategory.findUnique.mockResolvedValue({
            name: 'Apparel',
        })
        mockPrisma.mmMaterial.findFirst.mockImplementation(
            async (args: any) => {
                const requested = args?.where?.id
                if (requested && requested !== linkableMaterial.id) {
                    return {
                        ...linkableMaterial,
                        id: requested,
                        materialCode: `MAT-${requested}`,
                        sku: `SKU-${requested}`,
                    }
                }
                return linkableMaterial
            },
        )
        mockPrisma.sdProductVariant.findFirst.mockResolvedValue(null)
        mockPrisma.sdProduct.update.mockImplementation(async (args: any) => ({
            ...args.data,
        }))
        mockPrisma.mmMaterial.update.mockImplementation(async (args: any) => ({
            id: args.where.id,
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
    })

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
            {
                enabled: true,
                optionValues: ['Black', 'Medium'],
                existingMaterialId: 'mat-1',
            },
            {
                enabled: true,
                optionValues: ['Black', 'Large'],
                existingMaterialId: 'mat-2',
            },
        ],
    }

    describe('createProductFamily', () => {
        it('creates one parent and one variant per combination', async () => {
            mockLoadedProduct()
            await service.createProductFamily(variableDto)

            expect(tx.sdProduct.create).toHaveBeenCalledTimes(1)
            expect(tx.sdProductVariant.create).toHaveBeenCalledTimes(2)
        })

        it('never creates a Material Master record', async () => {
            mockLoadedProduct()
            await service.createProductFamily(variableDto)

            // The service has no MaterialsService dependency, and the Prisma
            // surface it uses has no material insert at all — the only
            // material write is the catalog-origin marker on an existing row.
            expect(
                (tx.mmMaterial as Record<string, unknown>).create,
            ).toBeUndefined()
            expect(tx.mmMaterial.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'mat-1' },
                    data: expect.objectContaining({
                        catalogSource: 'MANUALLY_LINKED',
                    }),
                }),
            )
        })

        it('links each variant to its existing material', async () => {
            mockLoadedProduct()
            await service.createProductFamily(variableDto)

            const updates = tx.sdProductVariant.update.mock.calls.map(
                (call) => call[0],
            )
            expect(updates).toHaveLength(2)
            expect(updates.map((args: any) => args.data.materialId)).toEqual(
                ['mat-1', 'mat-2'],
            )
        })

        it('rejects a variant without a material', async () => {
            mockLoadedProduct()
            await expect(
                service.createProductFamily({
                    ...variableDto,
                    variants: [
                        { enabled: true, optionValues: ['Black', 'Medium'] },
                    ],
                }),
            ).rejects.toThrow(BadRequestException)
        })

        it('rejects a material from another company', async () => {
            mockLoadedProduct()
            mockPrisma.mmMaterial.findFirst.mockResolvedValue({
                ...linkableMaterial,
                companyId: 'c-other',
            })
            await expect(
                service.createProductFamily(variableDto),
            ).rejects.toThrow(/another company/)
        })

        it('rejects an inactive material', async () => {
            mockLoadedProduct()
            mockPrisma.mmMaterial.findFirst.mockResolvedValue({
                ...linkableMaterial,
                status: 'DRAFT',
            })
            await expect(
                service.createProductFamily(variableDto),
            ).rejects.toThrow(/not active/)
        })

        it('rejects a material that is not sellable', async () => {
            mockLoadedProduct()
            mockPrisma.mmMaterial.findFirst.mockResolvedValue({
                ...linkableMaterial,
                sellable: false,
            })
            await expect(
                service.createProductFamily(variableDto),
            ).rejects.toThrow(/not sellable/)
        })

        it('rejects a material without a Stock Keeping Unit', async () => {
            mockLoadedProduct()
            mockPrisma.mmMaterial.findFirst.mockResolvedValue({
                ...linkableMaterial,
                sku: null,
            })
            await expect(
                service.createProductFamily(variableDto),
            ).rejects.toThrow(/Stock Keeping Unit/)
        })

        it('rejects a material that no longer exists', async () => {
            mockLoadedProduct()
            mockPrisma.mmMaterial.findFirst.mockResolvedValue(null)
            await expect(
                service.createProductFamily(variableDto),
            ).rejects.toThrow(NotFoundException)
        })

        it('rejects a material already linked to another active variant', async () => {
            mockLoadedProduct()
            mockPrisma.sdProductVariant.findFirst.mockResolvedValue({
                id: 'other-variant',
            })
            await expect(
                service.createProductFamily(variableDto),
            ).rejects.toThrow(ConflictException)
        })

        it('creates one hidden default variant for a SIMPLE product', async () => {
            mockLoadedProduct()
            await service.createProductFamily({
                divisionId: 'DIV_RETAIL',
                name: 'Kirkland Fish Oil',
                price: 299,
                productConfig: 'SIMPLE',
                materialDefaults,
                existingMaterialId: 'mat-1',
            })

            expect(tx.sdProductVariant.create).toHaveBeenCalledTimes(1)
            const args = tx.sdProductVariant.create.mock.calls[0][0]
            expect(args.data.combinationKey).toBe('__default__')
            expect(args.data.isHidden).toBe(true)
            expect(args.data.isDefault).toBe(true)
            // A simple product keeps exactly one (unambiguous) parent link.
            expect(
                tx.sdProductMaterialAssignment.create,
            ).toHaveBeenCalledTimes(1)
        })

        it('rejects a SIMPLE product without an existing material', async () => {
            mockLoadedProduct()
            await expect(
                service.createProductFamily({
                    divisionId: 'DIV_RETAIL',
                    name: 'Kirkland Fish Oil',
                    price: 299,
                    productConfig: 'SIMPLE',
                    materialDefaults,
                }),
            ).rejects.toThrow(/existing Material Master/)
        })

        it('rejects duplicate combinations inside one request', async () => {
            mockLoadedProduct()
            await expect(
                service.createProductFamily({
                    ...variableDto,
                    variants: [
                        {
                            enabled: true,
                            optionValues: ['Black', 'Medium'],
                            existingMaterialId: 'mat-1',
                        },
                        {
                            enabled: true,
                            optionValues: ['Black', 'Medium'],
                            existingMaterialId: 'mat-2',
                        },
                    ],
                }),
            ).rejects.toThrow(ConflictException)
        })

        it('sets the default variant on the parent', async () => {
            mockLoadedProduct()
            await service.createProductFamily(variableDto)

            const updates = tx.sdProduct.update.mock.calls.map(
                (call) => call[0],
            )
            expect(
                updates.some(
                    (args: any) => args.data.defaultVariantId === 'variant-1',
                ),
            ).toBe(true)
        })
    })
})
