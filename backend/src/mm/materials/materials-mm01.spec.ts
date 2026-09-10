import { Test, TestingModule } from '@nestjs/testing'
import { ConflictException, BadRequestException } from '@nestjs/common'
import { MaterialsService } from './materials.service'
import { PrismaService } from '../../prisma/prisma.service'

describe('MaterialsService MM-01 lifecycle (mocked)', () => {
    let service: MaterialsService
    const prisma: any = {
        mmMaterial: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        mmMaterialType: { findFirst: jest.fn() },
        mmMaterialCategory: { findFirst: jest.fn() },
        mmUom: { findFirst: jest.fn() },
        mmMaterialAudit: { create: jest.fn() },
        mmBatch: { count: jest.fn() },
        mmSerialNumber: { count: jest.fn() },
        mmBarcode: { count: jest.fn() },
    }

    const draftMaterial = {
        id: 'mat-1',
        materialCode: 'MAT-000001',
        materialName: 'Widget',
        status: 'DRAFT',
        materialTypeId: 't1',
        materialCategoryId: 'c1',
        baseUomId: 'u1',
        sku: null,
        deletedAt: null,
        minimumStock: 0,
        maximumStock: 0,
        safetyStock: 0,
        reorderPoint: 0,
    }

    beforeEach(async () => {
        jest.clearAllMocks()
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MaterialsService,
                { provide: PrismaService, useValue: prisma },
            ],
        }).compile()
        service = module.get(MaterialsService)

        prisma.mmMaterialType.findFirst.mockResolvedValue({ id: 't1', isActive: true })
        prisma.mmMaterialCategory.findFirst.mockResolvedValue({ id: 'c1', isActive: true })
        prisma.mmUom.findFirst.mockResolvedValue({ id: 'u1', isActive: true })
        prisma.mmMaterialAudit.create.mockResolvedValue({})
    })

    it('rejects duplicate SKU on create', async () => {
        prisma.mmMaterial.findFirst
            .mockResolvedValueOnce(null) // code unique
            .mockResolvedValueOnce({ id: 'other' }) // sku conflict

        await expect(
            service.create({
                materialCode: 'MAT-X',
                materialName: 'Dup',
                materialTypeId: 't1',
                materialCategoryId: 'c1',
                baseUomId: 'u1',
                sku: 'SKU-1',
            } as any),
        ).rejects.toThrow(ConflictException)
    })

    it('auto-generates SKU when omitted on create', async () => {
        prisma.mmMaterial.findFirst
            .mockResolvedValueOnce(null) // last MAT- for code sequence
            .mockResolvedValueOnce(null) // code unique
            .mockResolvedValueOnce(null) // last SKU- for sku sequence
            .mockResolvedValueOnce(null) // sku unique
        prisma.mmMaterial.create.mockResolvedValue({
            ...draftMaterial,
            sku: 'SKU-000001',
        })

        await service.create({
            materialName: 'Widget',
            materialTypeId: 't1',
            materialCategoryId: 'c1',
            baseUomId: 'u1',
        } as any)

        expect(prisma.mmMaterial.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ sku: 'SKU-000001' }),
            }),
        )
    })

    it('rejects activate when type/category/uom incomplete', async () => {
        prisma.mmMaterial.findFirst.mockResolvedValue({ ...draftMaterial })
        // findOne uses findFirst with includes — service findOne
        prisma.mmMaterialType.findFirst.mockResolvedValue(null)

        // findOne path: materials.service findOne
        const findOneSpy = jest.spyOn(service, 'findOne').mockResolvedValue({ ...draftMaterial } as any)

        await expect(service.activate('mat-1')).rejects.toThrow(BadRequestException)
        findOneSpy.mockRestore()
    })

    it('activates complete DRAFT → ACTIVE', async () => {
        jest.spyOn(service, 'findOne').mockResolvedValue({ ...draftMaterial } as any)
        prisma.mmMaterial.update.mockResolvedValue({ ...draftMaterial, status: 'ACTIVE' })

        const result = await service.activate('mat-1')
        expect(result.status).toBe('ACTIVE')
        expect(prisma.mmMaterial.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { status: 'ACTIVE' },
            }),
        )
    })

    it('blocks ACTIVE material and unblocks to INACTIVE', async () => {
        jest.spyOn(service, 'findOne')
            .mockResolvedValueOnce({ ...draftMaterial, status: 'ACTIVE' } as any)
            .mockResolvedValueOnce({ ...draftMaterial, status: 'BLOCKED' } as any)

        prisma.mmMaterial.update
            .mockResolvedValueOnce({ ...draftMaterial, status: 'BLOCKED' })
            .mockResolvedValueOnce({ ...draftMaterial, status: 'INACTIVE' })

        const blocked = await service.block('mat-1', 'hold')
        expect(blocked.status).toBe('BLOCKED')

        const unblocked = await service.unblock('mat-1')
        expect(unblocked.status).toBe('INACTIVE')
    })
})
