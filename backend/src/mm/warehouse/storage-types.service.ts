import {
    Injectable,
    ConflictException,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateStorageTypeDto } from './dto/create-storage-type.dto'
import { UpdateStorageTypeDto } from './dto/update-storage-type.dto'
import { WarehouseService } from './warehouse.service'

@Injectable()
export class StorageTypesService {
    constructor(
        private prisma: PrismaService,
        private warehouseService: WarehouseService,
    ) {}

    async findAll(query: { warehouseId?: string }) {
        const where: any = { deletedAt: null }
        if (query.warehouseId) where.warehouseId = query.warehouseId

        return this.prisma.wmStorageType.findMany({
            where,
            include: { warehouse: true },
            orderBy: { createdAt: 'desc' },
        })
    }

    async findOne(id: string) {
        const type = await this.prisma.wmStorageType.findFirst({
            where: { id, deletedAt: null },
            include: {
                warehouse: true,
                sections: { where: { deletedAt: null } },
            },
        })
        if (!type) throw new NotFoundException('Storage type not found')
        return type
    }

    async create(dto: CreateStorageTypeDto) {
        const warehouse = await this.prisma.warehouse.findFirst({
            where: { id: dto.warehouseId, deletedAt: null },
        })
        if (!warehouse) {
            throw new BadRequestException('Warehouse not found. Create a warehouse first.')
        }

        await this.assertUniqueCode(dto.warehouseId, dto.code)

        const storageType = await this.prisma.wmStorageType.create({
            data: dto as any,
            include: { warehouse: true },
        })

        await this.warehouseService.writeAudit(
            dto.warehouseId, 'STORAGE_TYPE', storageType.id, 'CREATE', storageType,
        )
        return storageType
    }

    async update(id: string, dto: UpdateStorageTypeDto) {
        const existing = await this.findOne(id)

        if (dto.code && dto.code !== existing.code) {
            await this.assertUniqueCode(existing.warehouseId, dto.code, id)
        }
        delete (dto as any).warehouseId

        const updated = await this.prisma.wmStorageType.update({
            where: { id },
            data: dto as any,
            include: { warehouse: true },
        })

        await this.warehouseService.writeAudit(
            existing.warehouseId, 'STORAGE_TYPE', id, 'UPDATE', null,
        )
        return updated
    }

    async softDelete(id: string) {
        const type = await this.findOne(id)
        const activeSections = await this.prisma.wmStorageSection.count({
            where: { storageTypeId: id, deletedAt: null, status: 'ACTIVE' },
        })
        if (activeSections > 0) {
            throw new BadRequestException(
                'Cannot delete storage type with active sections',
            )
        }
        return this.prisma.wmStorageType.update({
            where: { id },
            data: { deletedAt: new Date() },
        })
    }

    private async assertUniqueCode(warehouseId: string, code: string, excludeId?: string) {
        const existing = await this.prisma.wmStorageType.findFirst({
            where: {
                warehouseId,
                code: { equals: code, mode: 'insensitive' },
                deletedAt: null,
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
        })
        if (existing) {
            throw new ConflictException(
                'Storage type code already exists in this warehouse',
            )
        }
    }
}
