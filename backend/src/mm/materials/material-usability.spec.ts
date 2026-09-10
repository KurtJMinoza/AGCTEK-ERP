import { BadRequestException, NotFoundException } from '@nestjs/common'
import { assertMaterialUsable, assertActivateReady } from './material-usability'

describe('assertMaterialUsable', () => {
    const active = {
        id: 'm1',
        status: 'ACTIVE',
        deletedAt: null,
        inventoryManaged: true,
        purchasable: true,
    }

    it('rejects missing / deleted material', () => {
        expect(() => assertMaterialUsable(null)).toThrow(NotFoundException)
        expect(() => assertMaterialUsable({ ...active, deletedAt: new Date() })).toThrow(
            NotFoundException,
        )
    })

    it('rejects INACTIVE / DRAFT / BLOCKED', () => {
        expect(() => assertMaterialUsable({ ...active, status: 'INACTIVE' })).toThrow(
            BadRequestException,
        )
        expect(() => assertMaterialUsable({ ...active, status: 'DRAFT' })).toThrow(
            BadRequestException,
        )
        expect(() => assertMaterialUsable({ ...active, status: 'BLOCKED' })).toThrow(
            BadRequestException,
        )
    })

    it('rejects non-inventory-managed when forInventory', () => {
        expect(() =>
            assertMaterialUsable({ ...active, inventoryManaged: false }, { forInventory: true }),
        ).toThrow(BadRequestException)
    })

    it('rejects non-purchasable when forPurchase', () => {
        expect(() =>
            assertMaterialUsable({ ...active, purchasable: false }, { forPurchase: true }),
        ).toThrow(BadRequestException)
    })

    it('allows ACTIVE usable material', () => {
        expect(assertMaterialUsable(active, { forInventory: true, forPurchase: true })).toBe(
            active,
        )
    })
})

describe('assertActivateReady', () => {
    const prisma = {
        mmMaterialType: { findFirst: jest.fn() },
        mmMaterialCategory: { findFirst: jest.fn() },
        mmUom: { findFirst: jest.fn() },
    }

    beforeEach(() => {
        jest.clearAllMocks()
        prisma.mmMaterialType.findFirst.mockResolvedValue({ id: 't1' })
        prisma.mmMaterialCategory.findFirst.mockResolvedValue({ id: 'c1' })
        prisma.mmUom.findFirst.mockResolvedValue({ id: 'u1' })
    })

    it('rejects incomplete master (missing refs)', async () => {
        await expect(
            assertActivateReady(prisma, {
                materialName: 'X',
                materialTypeId: '',
                materialCategoryId: 'c1',
                baseUomId: 'u1',
            }),
        ).rejects.toThrow(BadRequestException)
    })

    it('rejects inactive type/category/uom', async () => {
        prisma.mmMaterialType.findFirst.mockResolvedValue(null)
        await expect(
            assertActivateReady(prisma, {
                materialName: 'X',
                materialTypeId: 't1',
                materialCategoryId: 'c1',
                baseUomId: 'u1',
            }),
        ).rejects.toThrow(BadRequestException)
    })

    it('passes when type, category, and UOM are active', async () => {
        await expect(
            assertActivateReady(prisma, {
                materialName: 'Ready',
                materialTypeId: 't1',
                materialCategoryId: 'c1',
                baseUomId: 'u1',
            }),
        ).resolves.toBeUndefined()
    })
})
