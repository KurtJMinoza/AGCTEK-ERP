import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { MmScopeService } from '../common/mm-scope.service'
import { PrismaService } from '../../prisma/prisma.service'

describe('MmScopeService', () => {
    let service: MmScopeService
    const mockPrisma = {
        warehouse: { findFirst: jest.fn() },
        mmMaterial: { findFirst: jest.fn() },
        wmStorageBin: { findFirst: jest.fn() },
    }

    beforeEach(async () => {
        jest.clearAllMocks()
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MmScopeService,
                { provide: PrismaService, useValue: mockPrisma },
            ],
        }).compile()
        service = module.get(MmScopeService)
    })

    it('rejects warehouse company mismatch', async () => {
        mockPrisma.warehouse.findFirst.mockResolvedValue({
            id: 'wh-1',
            companyId: 'co-other',
            plantId: 'p1',
            deletedAt: null,
        })
        mockPrisma.mmMaterial.findFirst.mockResolvedValue({
            id: 'mat-1',
            companyId: 'co-1',
            deletedAt: null,
        })

        await expect(
            service.assertPostingScope({
                companyId: 'co-1',
                warehouseId: 'wh-1',
                materialId: 'mat-1',
            }),
        ).rejects.toThrow(BadRequestException)
    })

    it('rejects material company mismatch', async () => {
        mockPrisma.warehouse.findFirst.mockResolvedValue({
            id: 'wh-1',
            companyId: 'co-1',
            plantId: 'p1',
            deletedAt: null,
        })
        mockPrisma.mmMaterial.findFirst.mockResolvedValue({
            id: 'mat-1',
            companyId: 'co-other',
            deletedAt: null,
        })

        await expect(
            service.assertPostingScope({
                companyId: 'co-1',
                warehouseId: 'wh-1',
                materialId: 'mat-1',
            }),
        ).rejects.toThrow(BadRequestException)
    })

    it('accepts aligned company scope', async () => {
        mockPrisma.warehouse.findFirst.mockResolvedValue({
            id: 'wh-1',
            companyId: 'co-1',
            plantId: 'p1',
            deletedAt: null,
        })
        mockPrisma.mmMaterial.findFirst.mockResolvedValue({
            id: 'mat-1',
            companyId: 'co-1',
            deletedAt: null,
        })

        await expect(
            service.assertPostingScope({
                companyId: 'co-1',
                warehouseId: 'wh-1',
                materialId: 'mat-1',
            }),
        ).resolves.toBeUndefined()
    })
})
