import { Test, TestingModule } from '@nestjs/testing'
import { StorageShelvesService } from './storage-shelves.service'
import { PrismaService } from '../../prisma/prisma.service'
import { WarehouseService } from './warehouse.service'
import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common'

const mockPrisma = {
    wmStorageShelf: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
    },
    wmStorageSection: { findFirst: jest.fn() },
    wmStorageBin: { count: jest.fn() },
}

const mockWarehouse = { writeAudit: jest.fn() }

describe('StorageShelvesService', () => {
    let service: StorageShelvesService

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                StorageShelvesService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: WarehouseService, useValue: mockWarehouse },
            ],
        }).compile()

        service = module.get<StorageShelvesService>(StorageShelvesService)
        jest.clearAllMocks()
    })

    it('creates a shelf under an existing section and writes an audit', async () => {
        mockPrisma.wmStorageShelf.findFirst.mockResolvedValue(null)
        mockPrisma.wmStorageSection.findFirst.mockResolvedValue({
            id: 'sec-1',
            storageType: { warehouseId: 'wh-1' },
        })
        mockPrisma.wmStorageShelf.create.mockResolvedValue({
            id: 'shf-1',
            code: 'S01',
            name: 'Shelf 1',
            storageSectionId: 'sec-1',
        })
        mockWarehouse.writeAudit.mockResolvedValue(undefined)

        const result = await service.create({
            code: 'S01',
            name: 'Shelf 1',
            storageSectionId: 'sec-1',
        } as any)

        expect(result.code).toBe('S01')
        expect(mockPrisma.wmStorageShelf.create).toHaveBeenCalled()
        expect(mockWarehouse.writeAudit).toHaveBeenCalledWith(
            'wh-1',
            'STORAGE_SHELF',
            'shf-1',
            'CREATE',
            expect.any(Object),
        )
    })

    it('rejects a duplicate shelf code in the same section', async () => {
        mockPrisma.wmStorageShelf.findFirst.mockResolvedValue({ id: 'existing' })

        await expect(
            service.create({
                code: 'S01',
                name: 'Shelf 1',
                storageSectionId: 'sec-1',
            } as any),
        ).rejects.toThrow(ConflictException)
    })

    it('rejects a shelf for a missing section', async () => {
        mockPrisma.wmStorageShelf.findFirst.mockResolvedValue(null)
        mockPrisma.wmStorageSection.findFirst.mockResolvedValue(null)

        await expect(
            service.create({
                code: 'S01',
                name: 'Shelf 1',
                storageSectionId: 'missing',
            } as any),
        ).rejects.toThrow(NotFoundException)
    })

    it('does not delete a shelf that still has active bins', async () => {
        mockPrisma.wmStorageShelf.findFirst.mockResolvedValue({
            id: 'shf-1',
            storageSection: { storageType: { warehouseId: 'wh-1' } },
            bins: [],
        })
        mockPrisma.wmStorageBin.count.mockResolvedValue(2)

        await expect(service.softDelete('shf-1')).rejects.toThrow(
            BadRequestException,
        )
    })

    it('soft deletes a shelf with no active bins', async () => {
        mockPrisma.wmStorageShelf.findFirst.mockResolvedValue({
            id: 'shf-1',
            storageSection: { storageType: { warehouseId: 'wh-1' } },
            bins: [],
        })
        mockPrisma.wmStorageBin.count.mockResolvedValue(0)
        mockPrisma.wmStorageShelf.update.mockResolvedValue({ id: 'shf-1' })

        await service.softDelete('shf-1')

        expect(mockPrisma.wmStorageShelf.update).toHaveBeenCalledWith({
            where: { id: 'shf-1' },
            data: { deletedAt: expect.any(Date) },
        })
    })
})
