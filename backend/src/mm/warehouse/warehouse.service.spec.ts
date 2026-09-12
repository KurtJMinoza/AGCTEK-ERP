import { Test, TestingModule } from '@nestjs/testing'
import { WarehouseService } from './warehouse.service'
import { PrismaService } from '../../prisma/prisma.service'
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common'

const mockPrisma = {
    company: {
        findUnique: jest.fn(),
    },
    warehouse: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    },
    wmStorageType: { count: jest.fn() },
    wmWarehouseAudit: { create: jest.fn() },
}

describe('WarehouseService', () => {
    let service: WarehouseService

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WarehouseService,
                { provide: PrismaService, useValue: mockPrisma },
            ],
        }).compile()

        service = module.get<WarehouseService>(WarehouseService)
        jest.clearAllMocks()
        mockPrisma.company.findUnique.mockResolvedValue({ id: 'c1' })
    })

    it('should create a warehouse with auto-generated code', async () => {
        mockPrisma.company.findUnique.mockResolvedValue({ id: 'c1' })
        mockPrisma.warehouse.findFirst
            .mockResolvedValueOnce(null) // generateNextCode - no existing
            .mockResolvedValueOnce(null) // assertUniqueCode
        mockPrisma.warehouse.create.mockResolvedValue({
            id: '1', code: 'WH-000001', name: 'Test', status: 'ACTIVE',
        })
        mockPrisma.wmWarehouseAudit.create.mockResolvedValue({})

        const result = await service.create({ name: 'Test', companyId: 'c1' } as any)
        expect(result.code).toBe('WH-000001')
        expect(mockPrisma.warehouse.create).toHaveBeenCalled()
    })

    it('should reject duplicate warehouse code', async () => {
        mockPrisma.warehouse.findFirst
            .mockResolvedValueOnce(null) // generateNextCode
            .mockResolvedValueOnce({ id: 'existing' }) // assertUniqueCode

        await expect(
            service.create({ name: 'Dup', companyId: 'c1' } as any),
        ).rejects.toThrow(ConflictException)
    })

    it('should increment code from existing warehouses', async () => {
        mockPrisma.warehouse.findFirst
            .mockResolvedValueOnce({ code: 'WH-000005' }) // generateNextCode
            .mockResolvedValueOnce(null) // assertUniqueCode
        mockPrisma.warehouse.create.mockResolvedValue({
            id: '2', code: 'WH-000006', name: 'Next', status: 'ACTIVE',
        })
        mockPrisma.wmWarehouseAudit.create.mockResolvedValue({})

        const result = await service.create({ name: 'Next', companyId: 'c1' } as any)
        expect(result.code).toBe('WH-000006')
    })

    it('should not find a deleted warehouse', async () => {
        mockPrisma.warehouse.findFirst.mockResolvedValue(null)

        await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException)
    })

    it('should reject activation of already active warehouse', async () => {
        mockPrisma.warehouse.findFirst.mockResolvedValue({
            id: '1', code: 'WH-000001', status: 'ACTIVE',
        })

        await expect(service.activate('1')).rejects.toThrow(BadRequestException)
    })

    it('should reject deactivation of already inactive warehouse', async () => {
        mockPrisma.warehouse.findFirst.mockResolvedValue({
            id: '1', code: 'WH-000001', status: 'INACTIVE',
        })

        await expect(service.deactivate('1')).rejects.toThrow(BadRequestException)
    })

    it('should block deletion when active storage types exist', async () => {
        mockPrisma.warehouse.findFirst.mockResolvedValue({
            id: '1', code: 'WH-000001', status: 'ACTIVE',
        })
        mockPrisma.wmStorageType.count.mockResolvedValue(3)

        await expect(service.softDelete('1')).rejects.toThrow(BadRequestException)
    })

    it('should allow deletion when no active storage types', async () => {
        mockPrisma.warehouse.findFirst.mockResolvedValue({
            id: '1', code: 'WH-000001', status: 'ACTIVE',
        })
        mockPrisma.wmStorageType.count.mockResolvedValue(0)
        mockPrisma.warehouse.update.mockResolvedValue({ id: '1', deletedAt: new Date() })

        const result = await service.softDelete('1')
        expect(result.deletedAt).toBeTruthy()
    })

    it('should strip code from update payload', async () => {
        mockPrisma.warehouse.findFirst.mockResolvedValue({
            id: '1', code: 'WH-000001', name: 'Old', status: 'ACTIVE',
        })
        mockPrisma.warehouse.update.mockResolvedValue({
            id: '1', code: 'WH-000001', name: 'New', status: 'ACTIVE',
        })
        mockPrisma.wmWarehouseAudit.create.mockResolvedValue({})

        await service.update('1', { code: 'HACK', name: 'New' } as any)
        const updateCall = mockPrisma.warehouse.update.mock.calls[0][0]
        expect(updateCall.data.code).toBeUndefined()
    })
})
