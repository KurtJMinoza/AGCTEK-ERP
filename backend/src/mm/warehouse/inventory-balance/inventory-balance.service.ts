import {
    Injectable,
    BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'

/**
 * @deprecated Physical stock quantities must go through InventoryPostingService /
 * MmInventoryBalance. This stub WmInventoryBalance helper is retained only for
 * legacy metadata reads and must not be used for putaway, capacity, or transfers.
 */
@Injectable()
export class InventoryBalanceService {
    constructor(private prisma: PrismaService) {}

    private readonly includes = {
        bin: { include: { storageSection: { include: { storageType: true } } } },
        material: true,
    }

    async getByBin(binId: string) {
        return this.prisma.wmInventoryBalance.findMany({
            where: { binId },
            include: this.includes,
        })
    }

    async getByMaterial(materialId: string) {
        return this.prisma.wmInventoryBalance.findMany({
            where: { materialId },
            include: this.includes,
        })
    }

    async getByWarehouse(warehouseId: string) {
        return this.prisma.wmInventoryBalance.findMany({
            where: {
                bin: {
                    storageSection: {
                        storageType: { warehouseId },
                    },
                },
            },
            include: this.includes,
        })
    }

    async query(params: { binId?: string; materialId?: string; warehouseId?: string }) {
        if (params.binId) return this.getByBin(params.binId)
        if (params.materialId) return this.getByMaterial(params.materialId)
        if (params.warehouseId) return this.getByWarehouse(params.warehouseId)
        return this.prisma.wmInventoryBalance.findMany({ include: this.includes })
    }

    /**
     * @deprecated Stub writes are locked. Use InventoryPostingService.
     */
    async addStock(
        _binId: string,
        _materialId: string,
        _qty: number,
        _batchId?: string | null,
        _serialId?: string | null,
    ): Promise<never> {
        throw new BadRequestException(
            'WmInventoryBalance mutations are disabled. Use InventoryPostingService / MmInventoryBalance.',
        )
    }

    /**
     * @deprecated Stub writes are locked. Use InventoryPostingService.
     */
    async removeStock(
        _binId: string,
        _materialId: string,
        _qty: number,
        _batchId?: string | null,
        _serialId?: string | null,
    ): Promise<never> {
        throw new BadRequestException(
            'WmInventoryBalance mutations are disabled. Use InventoryPostingService / MmInventoryBalance.',
        )
    }

    /**
     * @deprecated Stub writes are locked. Use MmInventoryReservation.
     */
    async reserveStock(
        _binId: string,
        _materialId: string,
        _qty: number,
        _batchId?: string | null,
        _serialId?: string | null,
    ): Promise<never> {
        throw new BadRequestException(
            'WmInventoryBalance mutations are disabled. Use MmInventoryReservation.',
        )
    }

    /**
     * @deprecated Stub writes are locked. Use MmInventoryReservation.
     */
    async unreserveStock(
        _binId: string,
        _materialId: string,
        _qty: number,
        _batchId?: string | null,
        _serialId?: string | null,
    ): Promise<never> {
        throw new BadRequestException(
            'WmInventoryBalance mutations are disabled. Use MmInventoryReservation.',
        )
    }
}
