import {
    Injectable,
    ConflictException,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateStorageSectionDto } from './dto/create-storage-section.dto'
import { UpdateStorageSectionDto } from './dto/update-storage-section.dto'
import { WarehouseService } from './warehouse.service'

@Injectable()
export class StorageSectionsService {
    constructor(
        private prisma: PrismaService,
        private warehouseService: WarehouseService,
    ) {}

    async findAll(query: { storageTypeId?: string }) {
        const where: any = { deletedAt: null }
        if (query.storageTypeId) where.storageTypeId = query.storageTypeId

        return this.prisma.wmStorageSection.findMany({
            where,
            include: { storageType: { include: { warehouse: true } } },
            orderBy: { createdAt: 'desc' },
        })
    }

    async findOne(id: string) {
        const section = await this.prisma.wmStorageSection.findFirst({
            where: { id, deletedAt: null },
            include: {
                storageType: { include: { warehouse: true } },
                bins: { where: { deletedAt: null } },
            },
        })
        if (!section) throw new NotFoundException('Storage section not found')
        return section
    }

    async create(dto: CreateStorageSectionDto) {
        await this.assertUniqueCode(dto.storageTypeId, dto.code)

        const storageType = await this.prisma.wmStorageType.findFirst({
            where: { id: dto.storageTypeId, deletedAt: null },
        })
        if (!storageType) throw new NotFoundException('Storage type not found')

        const section = await this.prisma.wmStorageSection.create({
            data: dto as any,
            include: { storageType: { include: { warehouse: true } } },
        })

        await this.warehouseService.writeAudit(
            storageType.warehouseId, 'STORAGE_SECTION', section.id, 'CREATE', section,
        )
        return section
    }

    async update(id: string, dto: UpdateStorageSectionDto) {
        const existing = await this.findOne(id)

        if (dto.code && dto.code !== existing.code) {
            await this.assertUniqueCode(existing.storageTypeId, dto.code, id)
        }
        delete (dto as any).storageTypeId

        const updated = await this.prisma.wmStorageSection.update({
            where: { id },
            data: dto as any,
            include: { storageType: { include: { warehouse: true } } },
        })

        await this.warehouseService.writeAudit(
            existing.storageType.warehouseId, 'STORAGE_SECTION', id, 'UPDATE', null,
        )
        return updated
    }

    async softDelete(id: string) {
        const section = await this.findOne(id)
        const activeBins = await this.prisma.wmStorageBin.count({
            where: { storageSectionId: id, deletedAt: null, status: 'ACTIVE' },
        })
        if (activeBins > 0) {
            throw new BadRequestException(
                'Cannot delete storage section with active bins',
            )
        }
        return this.prisma.wmStorageSection.update({
            where: { id },
            data: { deletedAt: new Date() },
        })
    }

    private async assertUniqueCode(storageTypeId: string, code: string, excludeId?: string) {
        const existing = await this.prisma.wmStorageSection.findFirst({
            where: {
                storageTypeId,
                code: { equals: code, mode: 'insensitive' },
                deletedAt: null,
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
        })
        if (existing) {
            throw new ConflictException(
                'Storage section code already exists in this storage type',
            )
        }
    }
}
