import { Test, TestingModule } from '@nestjs/testing'
import { ConflictException, BadRequestException } from '@nestjs/common'
import { MaterialsService } from './materials.service'
import { PrismaService } from '../../prisma/prisma.service'
import { InventoryAvailabilityService } from '../inventory/inventory-availability.service'

describe('MaterialsService MM-01 lifecycle (mocked)', () => {
    let service: MaterialsService
    const prisma: any = {
        mmMaterial: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            findUnique: jest.fn(),
            count: jest.fn(),
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
        mmCurrency: { findFirst: jest.fn() },
    }
    const availability = {
        getCompanyMaterialTotalsBatch: jest.fn(),
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
                {
                    provide: InventoryAvailabilityService,
                    useValue: availability,
                },
            ],
        }).compile()
        service = module.get(MaterialsService)

        prisma.mmMaterialType.findFirst.mockResolvedValue({ id: 't1', isActive: true })
        prisma.mmMaterialCategory.findFirst.mockResolvedValue({ id: 'c1', isActive: true })
        prisma.mmUom.findFirst.mockResolvedValue({ id: 'u1', isActive: true })
        prisma.mmCurrency.findFirst.mockResolvedValue({ id: 'php' })
        prisma.mmMaterialAudit.create.mockResolvedValue({})
        prisma.mmMaterial.findMany.mockResolvedValue([])
        availability.getCompanyMaterialTotalsBatch.mockResolvedValue(new Map())
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
            .mockResolvedValueOnce(null) // code unique
            .mockResolvedValueOnce(null) // sku unique
            .mockResolvedValueOnce(null) // no soft-deleted code to restore
            .mockResolvedValueOnce(null) // no soft-deleted sku to restore
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

    it('restores a soft-deleted material when its code and SKU are reused', async () => {
        const deleted = {
            ...draftMaterial,
            sku: 'SKU-1',
            deletedAt: new Date(),
        }
        prisma.mmMaterial.findFirst
            .mockResolvedValueOnce(null) // active code conflict
            .mockResolvedValueOnce(null) // active SKU conflict
            .mockResolvedValueOnce(deleted) // deleted code match
            .mockResolvedValueOnce(deleted) // deleted SKU match
        prisma.mmMaterial.update.mockResolvedValue({
            ...deleted,
            materialName: 'Restored widget',
            deletedAt: null,
        })

        const result = await service.create({
            materialCode: deleted.materialCode,
            materialName: 'Restored widget',
            materialTypeId: 't1',
            materialCategoryId: 'c1',
            baseUomId: 'u1',
            sku: deleted.sku,
        })

        expect(result.id).toBe(deleted.id)
        expect(result.deletedAt).toBeNull()
        expect(prisma.mmMaterial.create).not.toHaveBeenCalled()
        expect(prisma.mmMaterial.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: deleted.id },
                data: expect.objectContaining({ deletedAt: null }),
            }),
        )
        expect(prisma.mmMaterialAudit.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ action: 'RESTORE' }) }),
        )
    })

    it('generates codes after soft-deleted rows and ignores malformed suffixes', async () => {
        prisma.mmMaterial.findMany
            .mockResolvedValueOnce([
                { materialCode: 'MAT-000009' },
                { materialCode: 'MAT-DELETED' },
            ])
            .mockResolvedValueOnce([
                { sku: 'SKU-000014' },
                { sku: 'SKU-OLD' },
            ])
        prisma.mmMaterial.findFirst.mockResolvedValue(null)
        prisma.mmMaterial.create.mockResolvedValue({
            ...draftMaterial,
            materialCode: 'MAT-000010',
            sku: 'SKU-000015',
        })

        await service.create({
            materialName: 'Generated identifiers',
            materialTypeId: 't1',
            materialCategoryId: 'c1',
            baseUomId: 'u1',
        })

        expect(prisma.mmMaterial.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    materialCode: 'MAT-000010',
                    sku: 'SKU-000015',
                }),
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

    describe('live ledger stock (never the material master cache)', () => {
        beforeEach(() => {
            prisma.mmMaterial.findFirst.mockResolvedValue({
                ...draftMaterial,
                companyId: 'company-1',
                // Stale cache: the ledger is the authority.
                onHandQty: 999,
                reservedQty: 999,
            })
            prisma.mmMaterial.findMany.mockResolvedValue([
                {
                    ...draftMaterial,
                    companyId: 'company-1',
                    onHandQty: 999,
                    reservedQty: 999,
                },
            ])
            prisma.mmMaterial.count.mockResolvedValue(1)
        })

        it('findOne reports on-hand / available / reserved from the MM ledger', async () => {
            availability.getCompanyMaterialTotalsBatch.mockResolvedValue(
                new Map([
                    [
                        'mat-1',
                        { onHandQty: 50, reservedQty: 10, availableQty: 40 },
                    ],
                ]),
            )

            const result = await service.findOne('mat-1')

            expect(availability.getCompanyMaterialTotalsBatch).toHaveBeenCalledWith(
                'company-1',
                ['mat-1'],
            )
            expect(result.ledgerOnHandQty).toBe(50)
            expect(result.ledgerReservedQty).toBe(10)
            expect(result.ledgerAvailableQty).toBe(40)
            expect(result.availableQty).toBe(40)
        })

        it('findAll reports the live ledger quantities per material', async () => {
            availability.getCompanyMaterialTotalsBatch.mockResolvedValue(
                new Map([
                    [
                        'mat-1',
                        { onHandQty: 12, reservedQty: 2, availableQty: 10 },
                    ],
                ]),
            )

            const result = await service.findAll({} as never)
            const rows = result.data as unknown as Array<{
                ledgerOnHandQty: number
                ledgerReservedQty: number
                ledgerAvailableQty: number
            }>

            expect(rows[0].ledgerOnHandQty).toBe(12)
            expect(rows[0].ledgerReservedQty).toBe(2)
            expect(rows[0].ledgerAvailableQty).toBe(10)
            expect(result.data[0].availableQty).toBe(10)
        })

        it('reports an honest zero for a material with no ledger rows', async () => {
            availability.getCompanyMaterialTotalsBatch.mockResolvedValue(new Map())

            const result = await service.findOne('mat-1')

            expect(result.ledgerOnHandQty).toBe(0)
            expect(result.ledgerReservedQty).toBe(0)
            expect(result.ledgerAvailableQty).toBe(0)
            expect(result.availableQty).toBe(0)
        })
    })
})
