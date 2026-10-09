import {
    Injectable,
    ConflictException,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateStorageShelfDto } from './dto/create-storage-shelf.dto'
import { UpdateStorageShelfDto } from './dto/update-storage-shelf.dto'
import { WarehouseService } from './warehouse.service'

@Injectable()
export class StorageShelvesService {
    constructor(
        private prisma: PrismaService,
        private warehouseService: WarehouseService,
    ) {}

    async findAll(query: { storageSectionId?: string }) {
        const where: any = { deletedAt: null }
        if (query.storageSectionId) where.storageSectionId = query.storageSectionId

        return this.prisma.wmStorageShelf.findMany({
            where,
            include: {
                storageSection: {
                    include: { storageType: { include: { warehouse: true } } },
                },
            },
            orderBy: { createdAt: 'desc' },
        })
    }

    async findOne(id: string) {
        const shelf = await this.prisma.wmStorageShelf.findFirst({
            where: { id, deletedAt: null },
            include: {
                storageSection: {
                    include: { storageType: { include: { warehouse: true } } },
                },
                bins: { where: { deletedAt: null } },
            },
        })
        if (!shelf) throw new NotFoundException('Storage shelf not found')
        return shelf
    }

    async create(dto: CreateStorageShelfDto) {
        await this.assertUniqueCode(dto.storageSectionId, dto.code)

        const section = await this.prisma.wmStorageSection.findFirst({
            where: { id: dto.storageSectionId, deletedAt: null },
            include: { storageType: true },
        })
        if (!section) throw new NotFoundException('Storage section not found')

        const shelf = await this.prisma.wmStorageShelf.create({
            data: dto as any,
            include: {
                storageSection: {
                    include: { storageType: { include: { warehouse: true } } },
                },
            },
        })

        await this.warehouseService.writeAudit(
            section.storageType.warehouseId, 'STORAGE_SHELF', shelf.id, 'CREATE', shelf,
        )
        return shelf
    }

    async update(id: string, dto: UpdateStorageShelfDto) {
        const existing = await this.findOne(id)

        if (dto.code && dto.code !== existing.code) {
            await this.assertUniqueCode(existing.storageSectionId, dto.code, id)
        }
        delete (dto as any).storageSectionId

        const updated = await this.prisma.wmStorageShelf.update({
            where: { id },
            data: dto as any,
            include: {
                storageSection: {
                    include: { storageType: { include: { warehouse: true } } },
                },
            },
        })

        await this.warehouseService.writeAudit(
            existing.storageSection.storageType.warehouseId,
            'STORAGE_SHELF', id, 'UPDATE', null,
        )
        return updated
    }

    async softDelete(id: string) {
        await this.findOne(id)
        const activeBins = await this.prisma.wmStorageBin.count({
            where: { shelfId: id, deletedAt: null, status: 'ACTIVE' },
        })
        if (activeBins > 0) {
            throw new BadRequestException(
                'Cannot delete storage shelf with active bins',
            )
        }
        return this.prisma.wmStorageShelf.update({
            where: { id },
            data: { deletedAt: new Date() },
        })
    }

    private async assertUniqueCode(
        storageSectionId: string,
        code: string,
        excludeId?: string,
    ) {
        const existing = await this.prisma.wmStorageShelf.findFirst({
            where: {
                storageSectionId,
                code: { equals: code, mode: 'insensitive' },
                deletedAt: null,
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
        })
        if (existing) {
            throw new ConflictException(
                'Storage shelf code already exists in this storage section',
            )
        }
    }
}
