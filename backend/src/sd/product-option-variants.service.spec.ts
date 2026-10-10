import { Test, TestingModule } from '@nestjs/testing'
import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { ProductOptionVariantsService } from './product-option-variants.service'
import { PrismaService } from '../prisma/prisma.service'
import { CommercialAvailabilityService } from './commercial-availability.service'
import { MaterialResolutionService } from './material-resolution.service'
import type { UpdateProductOptionsVariantsDto } from './dto/product-option-variants.dto'

const mockPrisma = {
    sdProduct: { findUnique: jest.fn() },
    sdProductOption: { findMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
    sdProductOptionValue: { create: jest.fn(), deleteMany: jest.fn() },
    sdProductVariant: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
    },
    sdProductVariantOptionValue: { create: jest.fn(), deleteMany: jest.fn() },
    mmMaterial: { findUnique: jest.fn() },
    company: { findUnique: jest.fn() },
    $transaction: jest.fn(),
}

const mockAvailability = {
    getForLinkedMaterial: jest.fn(),
}

const mockMaterialResolution = {
    resolveMaterialForProduct: jest.fn(),
}

const product = { id: 'p1' }

const dto: UpdateProductOptionsVariantsDto = {
    options: [
        {
            name: 'Color',
            isRequired: true,
            sortOrder: 0,
            values: [
                { value: 'Black', sortOrder: 0 },
                { value: 'White', sortOrder: 1 },
            ],
        },
        {
            name: 'Size',
            isRequired: true,
            sortOrder: 1,
            values: [
                { value: 'Medium', sortOrder: 0 },
                { value: 'Large', sortOrder: 1 },
            ],
        },
    ],
    variants: [
        {
            variantName: 'Black / Medium',
            sku: 'TEE-BLK-M',
            barcode: '480001',
            price: 499,
            compareAtPrice: null,
            cost: null,
            imageUrl: '',
            weight: null,
            isActive: true,
            materialId: 'mat-1',
            companyId: 'c-1',
            optionValues: ['Black', 'Medium'],
        },
        {
            variantName: 'Black / Large',
            sku: 'TEE-BLK-L',
            barcode: '480002',
            price: 499,
            compareAtPrice: null,
            cost: null,
            imageUrl: '',
            weight: null,
            isActive: true,
            materialId: 'mat-1',
            companyId: 'c-1',
            optionValues: ['Black', 'Large'],
        },
    ],
}

const tx = {
    sdProduct: { update: jest.fn() },
    sdProductVariant: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        create: jest.fn().mockImplementation((args) =>
            Promise.resolve({ id: `v-${args.data.sku}`, ...args.data }),
        ),
    },
    sdProductVariantOptionValue: { deleteMany: jest.fn(), create: jest.fn() },
    sdProductOptionValue: { deleteMany: jest.fn(), create: jest.fn() },
    sdProductOption: { deleteMany: jest.fn(), create: jest.fn() },
}

describe('ProductOptionVariantsService', () => {
    let service: ProductOptionVariantsService

    beforeEach(async () => {
        jest.clearAllMocks()
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProductOptionVariantsService,
                { provide: PrismaService, useValue: mockPrisma },
                {
                    provide: CommercialAvailabilityService,
                    useValue: mockAvailability,
                },
                {
                    provide: MaterialResolutionService,
                    useValue: mockMaterialResolution,
                },
            ],
        }).compile()

        service = module.get(ProductOptionVariantsService)
        mockPrisma.sdProduct.findUnique.mockResolvedValue(product)
        mockPrisma.$transaction.mockImplementation(
            (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
        )
        mockPrisma.sdProductVariant.findFirst.mockResolvedValue(null)
        mockPrisma.mmMaterial.findUnique.mockResolvedValue({ id: 'mat-1' })
        mockPrisma.company.findUnique.mockResolvedValue({ id: 'c-1' })

        let optionSeq = 0
        let valueSeq = 0
        tx.sdProductOption.create.mockImplementation(async (args: any) => ({
            id: `opt-${++optionSeq}`,
            name: args.data.name,
        }))
        tx.sdProductOptionValue.create.mockImplementation(
            async (args: any) => ({
                id: `val-${++valueSeq}`,
                optionId: args.data.optionId,
                value: args.data.value,
            }),
        )
        tx.sdProductVariant.create.mockImplementation(
            async (args: any) => ({ id: `v-${args.data.sku}`, ...args.data }),
        )
        tx.sdProductVariantOptionValue.create.mockImplementation(
            async (args: any) => ({
                id: `link-${args.data.variantId}-${args.data.optionValueId}`,
                ...args.data,
            }),
        )
    })

    it('getForProduct returns options and variants', async () => {
        mockPrisma.sdProductOption.findMany.mockResolvedValue([
            {
                id: 'opt-1',
                name: 'Color',
                sortOrder: 0,
                isRequired: true,
                values: [{ id: 'val-1', value: 'Black', sortOrder: 0 }],
            },
        ])
        mockPrisma.sdProductVariant.findMany.mockResolvedValue([
            {
                id: 'v-1',
                productId: 'p1',
                variantName: 'Black / Medium',
                sku: 'TEE-BLK-M',
                barcode: '480001',
                price: new Decimal('499'),
                compareAtPrice: null,
                cost: null,
                imageUrl: '',
                weight: null,
                isActive: true,
                materialId: 'mat-1',
                companyId: 'c-1',
                salesUomId: null,
                materialUomId: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                optionValues: [
                    {
                        optionValueId: 'val-1',
                        optionValue: {
                            id: 'val-1',
                            value: 'Black',
                            option: { id: 'opt-1' },
                        },
                    },
                ],
            },
        ])

        const result = await service.getForProduct('p1')
        expect(result.hasVariants).toBe(true)
        expect(result.options[0].name).toBe('Color')
        expect(result.variants[0].sku).toBe('TEE-BLK-M')
        expect(result.variants[0].optionValues[0].value).toBe('Black')
    })

    it('applies ecommerce fields: display style, default variant and sort order', async () => {
        const payload: UpdateProductOptionsVariantsDto = {
            ...dto,
            options: [
                { ...dto.options[0], displayStyle: 'SWATCH' },
                dto.options[1],
            ],
            variants: [
                { ...dto.variants[0], isDefault: true, sortOrder: 5 },
                { ...dto.variants[1], sortOrder: 9 },
            ],
        }
        await service.updateOptionsAndVariants('p1', payload)
        expect(tx.sdProductOption.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ displayStyle: 'SWATCH' }),
        })
        expect(tx.sdProductOptionValue.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ swatchColor: null, imageUrl: '' }),
        })
        expect(tx.sdProductVariant.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ isDefault: true, sortOrder: 5 }),
        })
        expect(tx.sdProductVariant.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ isDefault: false, sortOrder: 9 }),
        })
    })

    it('defaults the first variant when none is marked', async () => {
        await service.updateOptionsAndVariants('p1', dto)
        expect(tx.sdProductVariant.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ isDefault: true }),
        })
    })

    it('rejects more than one default variant', async () => {
        const twoDefaults: UpdateProductOptionsVariantsDto = {
            ...dto,
            variants: [
                { ...dto.variants[0], isDefault: true },
                { ...dto.variants[1], isDefault: true },
            ],
        }
        await expect(
            service.updateOptionsAndVariants('p1', twoDefaults),
        ).rejects.toThrow(BadRequestException)
    })

    it('persists the variant image mode on the product attributes', async () => {
        mockPrisma.sdProduct.findUnique.mockResolvedValue({
            id: 'p1',
            attributes: { tagline: 'kept' },
        })
        await service.updateOptionsAndVariants('p1', {
            ...dto,
            variantImageMode: 'keep',
        })
        expect(tx.sdProduct.update).toHaveBeenCalledWith({
            where: { id: 'p1' },
            data: {
                attributes: { tagline: 'kept', variantImageMode: 'keep' },
            },
        })
    })

    it('stores no price override when a variant omits its price', async () => {
        const inherit: UpdateProductOptionsVariantsDto = {
            ...dto,
            variants: [{ ...dto.variants[0], price: null, sku: 'TEE-INH-M' }],
        }
        await service.updateOptionsAndVariants('p1', inherit)
        expect(tx.sdProductVariant.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ price: null }),
        })
    })

    it('falls back to the parent material for unlinked variants', async () => {
        mockPrisma.sdProductVariant.findUnique.mockResolvedValueOnce({
            id: 'v-1',
            productId: 'p1',
            materialId: null,
            companyId: null,
            isActive: true,
            product: { divisionId: 'DIV_RETAIL' },
        })
        mockMaterialResolution.resolveMaterialForProduct.mockResolvedValueOnce({
            materialId: 'mat-1',
        })
        mockAvailability.getForLinkedMaterial.mockResolvedValueOnce({
            availableBaseQty: 7,
            state: 'IN_STOCK',
        })
        const result = await service.variantAvailability('v-1', 'c-1')
        expect(result.materialId).toBe('mat-1')
        expect(result.availableQuantity).toBe(7)
    })

    it('rejects duplicate variant combinations (Conflict)', async () => {
        const dup = {
            ...dto,
            variants: [
                { ...dto.variants[0] },
                {
                    ...dto.variants[0],
                    variantName: 'Black / Medium copy',
                    sku: 'TEE-BLK-M2',
                    barcode: '480003',
                },
            ],
        }
        await expect(service.updateOptionsAndVariants('p1', dup)).rejects.toThrow(
            ConflictException,
        )
    })

    it('rejects a variant SKU already used by another product', async () => {
        mockPrisma.sdProductVariant.findFirst.mockResolvedValue({ id: 'other' })
        await expect(
            service.updateOptionsAndVariants('p1', dto),
        ).rejects.toThrow(ConflictException)
    })

    it('rejects a duplicate option value within an option', async () => {
        const bad = {
            options: [
                {
                    name: 'Size',
                    isRequired: true,
                    values: [
                        { value: 'Medium' },
                        { value: 'Medium' },
                    ],
                },
            ],
            variants: [],
        }
        await expect(service.updateOptionsAndVariants('p1', bad)).rejects.toThrow(
            BadRequestException,
        )
    })

    it('rejects a variant referencing an unknown option value', async () => {
        const bad = {
            ...dto,
            variants: [
                {
                    ...dto.variants[0],
                    variantName: 'Black / Huge',
                    sku: 'TEE-BLK-H',
                    barcode: '480004',
                    optionValues: ['Black', 'Huge'],
                },
            ],
        }
        await expect(service.updateOptionsAndVariants('p1', bad)).rejects.toThrow(
            BadRequestException,
        )
    })

    it('writes the full option + variant set in one transaction', async () => {
        mockPrisma.sdProductVariant.findMany.mockResolvedValue([])
        mockPrisma.sdProductOption.findMany.mockResolvedValue([])

        await service.updateOptionsAndVariants('p1', dto)

        expect(tx.sdProductOption.deleteMany).toHaveBeenCalled()
        expect(tx.sdProductVariant.create).toHaveBeenCalledTimes(2)
        expect(tx.sdProductOption.create).toHaveBeenCalledTimes(2)
        expect(tx.sdProductVariantOptionValue.create).toHaveBeenCalledTimes(4)
    })

    it('clearing options also clears variants (simple product)', async () => {
        tx.sdProductVariant.findMany.mockResolvedValue([
            { id: 'v-1' },
            { id: 'v-2' },
        ])
        mockPrisma.sdProductVariant.findMany.mockResolvedValue([])
        mockPrisma.sdProductOption.findMany.mockResolvedValue([])

        await service.updateOptionsAndVariants('p1', {
            options: [],
            variants: [],
        })

        expect(tx.sdProductVariantOptionValue.deleteMany).toHaveBeenCalledWith({
            where: { variantId: { in: ['v-1', 'v-2'] } },
        })
        expect(tx.sdProductVariant.deleteMany).toHaveBeenCalledWith({
            where: { productId: 'p1' },
        })
    })

    it('resolves the exact variant for a set of option value ids', async () => {
        mockPrisma.sdProductVariant.findMany.mockResolvedValue([
            {
                id: 'v-1',
                optionValues: [{ optionValueId: 'a' }, { optionValueId: 'b' }],
            },
            {
                id: 'v-2',
                optionValues: [{ optionValueId: 'a' }, { optionValueId: 'c' }],
            },
        ])
        const match = await service.resolveVariantByOptionValueIds('p1', [
            'a',
            'c',
        ])
        expect(match?.id).toBe('v-2')
        const none = await service.resolveVariantByOptionValueIds('p1', [
            'x',
            'y',
        ])
        expect(none).toBeNull()
    })

    it('finds the exact variant by barcode for POS scanning', async () => {
        const variant = {
            id: 'v-1',
            variantName: 'Black / Large',
            sku: 'TEE-BLK-L',
            barcode: '480002',
            product: { id: 'p1', sku: 'TEE-01' },
        }
        mockPrisma.sdProductVariant.findUnique.mockResolvedValue(variant)
        const found = await service.findVariantByBarcode('480002')
        expect(found?.id).toBe('v-1')

        mockPrisma.sdProductVariant.findUnique.mockResolvedValue(null)
        await expect(
            service.findVariantByBarcode('000000'),
        ).rejects.toThrow(NotFoundException)
    })

    it('reports per-variant MM availability through the availability service', async () => {
        mockPrisma.sdProductVariant.findUnique.mockResolvedValue({
            id: 'v-1',
            isActive: true,
            materialId: 'mat-1',
            companyId: 'c-1',
            productId: 'p1',
            product: { id: 'p1', divisionId: 'DIV_RETAIL' },
        })
        mockAvailability.getForLinkedMaterial.mockResolvedValue({
            materialId: 'mat-1',
            warehouseId: null,
            availableBaseQty: 42,
            state: 'IN_STOCK',
            lowStockThreshold: 10,
        })

        const result = await service.variantAvailability('v-1')
        expect(result.availableQuantity).toBe(42)
        expect(mockAvailability.getForLinkedMaterial).toHaveBeenCalledWith(
            expect.objectContaining({ materialId: 'mat-1', companyId: 'c-1' }),
        )
    })

    it('NOT_MAPPED when a variant has no linked material', async () => {
        mockPrisma.sdProductVariant.findUnique.mockResolvedValue({
            id: 'v-1',
            isActive: true,
            materialId: null,
            companyId: 'c-1',
            productId: 'p1',
        })
        const result = await service.variantAvailability('v-1')
        expect(result.state).toBe('NOT_MAPPED')
        expect(result.availableQuantity).toBe(0)
    })
})