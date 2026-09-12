import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { InventoryAvailabilityService } from '../inventory/inventory-availability.service'
import { CreateStoLineDto } from './dto/stock-transfer.dto'

@Injectable()
export class StockTransferValidationService {
    constructor(
        private prisma: PrismaService,
        private availability: InventoryAvailabilityService,
    ) {}

    async assertWarehouses(
        companyId: string,
        transferType: string,
        sourceWarehouseId: string,
        destinationWarehouseId: string,
    ) {
        const [source, dest] = await Promise.all([
            this.prisma.warehouse.findUnique({ where: { id: sourceWarehouseId } }),
            this.prisma.warehouse.findUnique({ where: { id: destinationWarehouseId } }),
        ])
        if (!source || source.deletedAt) throw new NotFoundException('Source warehouse not found')
        if (!dest || dest.deletedAt) throw new NotFoundException('Destination warehouse not found')
        if (source.status !== 'ACTIVE') {
            throw new BadRequestException('Source warehouse is inactive')
        }
        if (dest.status !== 'ACTIVE') {
            throw new BadRequestException('Destination warehouse is inactive')
        }
        if (source.companyId !== companyId || dest.companyId !== companyId) {
            throw new BadRequestException('Warehouses must belong to the same company')
        }

        switch (transferType) {
            case 'BIN_TO_BIN':
                if (sourceWarehouseId !== destinationWarehouseId) {
                    throw new BadRequestException('BIN_TO_BIN requires the same warehouse')
                }
                break
            case 'WAREHOUSE_TO_WAREHOUSE':
                if (sourceWarehouseId === destinationWarehouseId) {
                    throw new BadRequestException('WAREHOUSE_TO_WAREHOUSE requires different warehouses')
                }
                break
            case 'BRANCH_TO_BRANCH':
                if (sourceWarehouseId === destinationWarehouseId) {
                    throw new BadRequestException('BRANCH_TO_BRANCH requires different warehouses')
                }
                if (!source.branchId || !dest.branchId || source.branchId === dest.branchId) {
                    throw new BadRequestException('BRANCH_TO_BRANCH requires different branch FKs')
                }
                break
            case 'PLANT_TO_PLANT':
                if (sourceWarehouseId === destinationWarehouseId) {
                    throw new BadRequestException('PLANT_TO_PLANT requires different warehouses')
                }
                if (!source.plantId || !dest.plantId || source.plantId === dest.plantId) {
                    throw new BadRequestException('PLANT_TO_PLANT requires different plant FKs')
                }
                break
            default:
                throw new BadRequestException(`Unsupported transfer type: ${transferType}`)
        }

        return { source, dest }
    }

    async assertLines(companyId: string, warehouseId: string, transferType: string, lines: CreateStoLineDto[]) {
        if (!lines?.length) throw new BadRequestException('At least one line is required')

        for (const line of lines) {
            const material = await this.prisma.mmMaterial.findFirst({
                where: { id: line.materialId, deletedAt: null },
            })
            if (!material) throw new BadRequestException(`Material not found: ${line.materialId}`)
            if (material.status === 'INACTIVE') {
                throw new BadRequestException(`Material is inactive: ${material.materialCode}`)
            }
            if (material.batchManaged && !line.batchId) {
                throw new BadRequestException(`Batch required for batch-managed material ${material.materialCode}`)
            }
            if (material.serialManaged && !line.serialNumberId) {
                throw new BadRequestException(`Serial required for serial-managed material ${material.materialCode}`)
            }
            if (line.batchId) {
                const batch = await this.prisma.mmBatch.findUnique({ where: { id: line.batchId } })
                if (!batch || batch.materialId !== line.materialId) {
                    throw new BadRequestException('Invalid batch for material')
                }
            }
            if (line.serialNumberId) {
                const serial = await this.prisma.mmSerialNumber.findUnique({
                    where: { id: line.serialNumberId },
                })
                if (!serial || serial.materialId !== line.materialId) {
                    throw new BadRequestException('Invalid serial for material')
                }
            }
            if (transferType === 'BIN_TO_BIN') {
                if (!line.sourceBinId || !line.destinationBinId) {
                    throw new BadRequestException('BIN_TO_BIN requires source and destination bins')
                }
                if (line.sourceBinId === line.destinationBinId) {
                    throw new BadRequestException('Source and destination bins must differ')
                }
            }

            const check = await this.availability.assertAvailable(
                companyId,
                warehouseId,
                line.materialId,
                line.quantity,
                {
                    storageBinId: line.sourceBinId,
                    batchId: line.batchId,
                    serialNumberId: line.serialNumberId,
                },
            )
            if (!check.ok) {
                throw new BadRequestException(
                    `Insufficient available stock for ${material.materialCode}. Available: ${check.available}, Requested: ${line.quantity}`,
                )
            }
        }
    }

    assertDestinationWarehouse(orderDestId: string, providedDestId?: string) {
        if (providedDestId && providedDestId !== orderDestId) {
            throw new BadRequestException('Wrong destination warehouse for this transfer order')
        }
    }
}
