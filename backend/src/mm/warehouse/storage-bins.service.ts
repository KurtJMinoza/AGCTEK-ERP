import {
    Injectable,
    ConflictException,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateStorageBinDto } from './dto/create-storage-bin.dto'
import { UpdateStorageBinDto } from './dto/update-storage-bin.dto'
import { StorageBinQueryDto } from './dto/storage-bin-query.dto'
import { WarehouseService } from './warehouse.service'

@Injectable()
export class StorageBinsService {
    constructor(
        private prisma: PrismaService,
        private warehouseService: WarehouseService,
    ) {}

    async findAll(query: StorageBinQueryDto) {
        const where: any = { deletedAt: null }
        if (query.storageSectionId) where.storageSectionId = query.storageSectionId
        if (query.status) where.status = query.status
        if (query.warehouseId) {
            where.storageSection = {
                storageType: { warehouseId: query.warehouseId },
            }
        }

        const bins = await this.prisma.wmStorageBin.findMany({
            where,
            include: {
                storageSection: {
                    include: { storageType: { include: { warehouse: true } } },
                },
            },
            orderBy: { createdAt: 'desc' },
        })
        return bins.map((b) => this.withDerivedHierarchy(b))
    }

    async findOne(id: string) {
        const bin = await this.prisma.wmStorageBin.findFirst({
            where: { id, deletedAt: null },
            include: {
                storageSection: {
                    include: { storageType: { include: { warehouse: true } } },
                },
            },
        })
        if (!bin) throw new NotFoundException('Storage bin not found')
        return this.withDerivedHierarchy(bin)
    }

    async create(dto: CreateStorageBinDto) {
        await this.assertUniqueCode(dto.storageSectionId, dto.code)
        this.validateCapacity(dto)

        const section = await this.prisma.wmStorageSection.findFirst({
            where: { id: dto.storageSectionId, deletedAt: null },
            include: { storageType: true },
        })
        if (!section) throw new NotFoundException('Storage section not found')

        const barcode = dto.barcode || await this.generateBarcode()
        if (dto.barcode) await this.assertUniqueBarcode(dto.barcode)

        const bin = await this.prisma.wmStorageBin.create({
            data: { ...dto, barcode } as any,
            include: {
                storageSection: {
                    include: { storageType: { include: { warehouse: true } } },
                },
            },
        })

        await this.warehouseService.writeAudit(
            section.storageType.warehouseId, 'STORAGE_BIN', bin.id, 'CREATE', bin,
        )
        return this.withDerivedHierarchy(bin)
    }

    async update(id: string, dto: UpdateStorageBinDto) {
        const existing = await this.findOne(id)

        if (dto.code && dto.code !== existing.code) {
            await this.assertUniqueCode(existing.storageSectionId, dto.code, id)
        }
        if (dto.barcode && dto.barcode !== existing.barcode) {
            await this.assertUniqueBarcode(dto.barcode, id)
        }
        if (existing.status === 'INACTIVE' && dto.putawayAllowed === true) {
            throw new BadRequestException('Inactive bins cannot receive items')
        }
        delete (dto as any).storageSectionId

        const updated = await this.prisma.wmStorageBin.update({
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
            'STORAGE_BIN', id, 'UPDATE', null,
        )
        return this.withDerivedHierarchy(updated)
    }

    async softDelete(id: string) {
        await this.findOne(id)
        return this.prisma.wmStorageBin.update({
            where: { id },
            data: { deletedAt: new Date() },
        })
    }

    async getCapacitySummary(warehouseId?: string) {
        const where: any = { deletedAt: null }
        if (warehouseId) {
            where.storageSection = {
                storageType: { warehouseId },
            }
        }

        const bins = await this.prisma.wmStorageBin.findMany({
            where,
            select: {
                id: true,
                capacityQuantity: true,
                capacityWeight: true,
                capacityVolume: true,
                status: true,
            },
        })

        const binIds = bins.map((b) => b.id)
        const balances = binIds.length
            ? await this.prisma.mmInventoryBalance.findMany({
                  where: {
                      storageBinId: { in: binIds },
                      stockStatus: 'UNRESTRICTED',
                  },
                  select: { storageBinId: true, quantity: true },
              })
            : []

        const occupiedByBin = new Map<string, number>()
        for (const bal of balances) {
            if (!bal.storageBinId) continue
            occupiedByBin.set(
                bal.storageBinId,
                (occupiedByBin.get(bal.storageBinId) ?? 0) + Number(bal.quantity),
            )
        }

        const totalOccupied = [...occupiedByBin.values()].reduce((s, n) => s + n, 0)
        const totalCapacityQuantity = bins.reduce((sum, b) => sum + Number(b.capacityQuantity), 0)

        return {
            totalBins: bins.length,
            activeBins: bins.filter((b) => b.status === 'ACTIVE').length,
            inactiveBins: bins.filter((b) => b.status === 'INACTIVE').length,
            totalCapacityQuantity,
            totalCapacityQty: totalCapacityQuantity,
            totalCapacityWeight: bins.reduce((sum, b) => sum + Number(b.capacityWeight), 0),
            totalCapacityVolume: bins.reduce((sum, b) => sum + Number(b.capacityVolume), 0),
            totalOccupiedQuantity: totalOccupied,
            utilizationPct:
                totalCapacityQuantity > 0
                    ? Math.min(100, Math.round((totalOccupied / totalCapacityQuantity) * 100))
                    : 0,
        }
    }

    /** Bins with live occupancy from MmInventoryBalance (never client-writable). */
    async findAllWithOccupancy(query: StorageBinQueryDto) {
        const bins = await this.findAll(query)
        const binIds = bins.map((b) => b.id)
        const balances = binIds.length
            ? await this.prisma.mmInventoryBalance.findMany({
                  where: {
                      storageBinId: { in: binIds },
                      stockStatus: 'UNRESTRICTED',
                  },
                  select: { storageBinId: true, quantity: true },
              })
            : []
        const occupiedByBin = new Map<string, number>()
        for (const bal of balances) {
            if (!bal.storageBinId) continue
            occupiedByBin.set(
                bal.storageBinId,
                (occupiedByBin.get(bal.storageBinId) ?? 0) + Number(bal.quantity),
            )
        }
        return bins.map((b) => {
            const currentQuantity = occupiedByBin.get(b.id) ?? 0
            const capacity = Number(b.capacityQuantity)
            return {
                ...b,
                currentQuantity,
                remainingQuantity: Math.max(0, capacity - currentQuantity),
                utilizationPct:
                    capacity > 0 ? Math.min(100, Math.round((currentQuantity / capacity) * 100)) : 0,
            }
        })
    }

    /** Derived from section → type (no denormalized FKs on bin). */
    private withDerivedHierarchy<T extends { storageSection?: any }>(bin: T) {
        const storageType = bin.storageSection?.storageType
        return {
            ...bin,
            warehouseId: storageType?.warehouseId ?? storageType?.warehouse?.id ?? null,
            storageTypeId: storageType?.id ?? null,
        }
    }

    private async generateBarcode(): Promise<string> {
        const timestamp = Date.now().toString(36).toUpperCase()
        const random = Math.random().toString(36).substring(2, 6).toUpperCase()
        return `BIN-${timestamp}-${random}`
    }

    private validateCapacity(dto: any) {
        if (dto.capacityQuantity !== undefined && dto.capacityQuantity < 0) {
            throw new BadRequestException('Capacity quantity must be >= 0')
        }
        if (dto.capacityWeight !== undefined && dto.capacityWeight < 0) {
            throw new BadRequestException('Capacity weight must be >= 0')
        }
        if (dto.capacityVolume !== undefined && dto.capacityVolume < 0) {
            throw new BadRequestException('Capacity volume must be >= 0')
        }
    }

    private async assertUniqueCode(storageSectionId: string, code: string, excludeId?: string) {
        const existing = await this.prisma.wmStorageBin.findFirst({
            where: {
                storageSectionId,
                code: { equals: code, mode: 'insensitive' },
                deletedAt: null,
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
        })
        if (existing) {
            throw new ConflictException(
                'Bin code already exists in this storage section',
            )
        }
    }

    private async assertUniqueBarcode(barcode: string, excludeId?: string) {
        const existing = await this.prisma.wmStorageBin.findFirst({
            where: {
                barcode,
                deletedAt: null,
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
        })
        if (existing) {
            throw new ConflictException('Barcode already exists')
        }
    }
}
