import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

export type PostingScopeInput = {
    companyId: string
    warehouseId: string
    materialId: string
    storageBinId?: string | null
    plantId?: string | null
}

@Injectable()
export class MmScopeService {
    constructor(private prisma: PrismaService) {}

    async assertPostingScope(input: PostingScopeInput): Promise<void> {
        const warehouse = await this.prisma.warehouse.findFirst({
            where: { id: input.warehouseId, deletedAt: null },
        })
        if (!warehouse) throw new BadRequestException('Warehouse not found')
        if (warehouse.companyId !== input.companyId) {
            throw new BadRequestException(
                'Warehouse does not belong to the specified company',
            )
        }
        if (input.plantId && warehouse.plantId && input.plantId !== warehouse.plantId) {
            throw new BadRequestException(
                'Plant does not match the warehouse plant assignment',
            )
        }

        const material = await this.prisma.mmMaterial.findFirst({
            where: { id: input.materialId, deletedAt: null },
        })
        if (!material) throw new NotFoundException('Material not found')
        if (material.companyId && material.companyId !== input.companyId) {
            throw new BadRequestException(
                'Material does not belong to the specified company',
            )
        }

        if (input.storageBinId) {
            const bin = await this.prisma.wmStorageBin.findFirst({
                where: { id: input.storageBinId, deletedAt: null },
                include: { storageSection: { include: { storageType: true } } },
            })
            if (!bin) throw new BadRequestException('Storage bin not found')
            if (bin.storageSection.storageType.warehouseId !== input.warehouseId) {
                throw new BadRequestException(
                    'Storage bin does not belong to the specified warehouse',
                )
            }
        }
    }
}
