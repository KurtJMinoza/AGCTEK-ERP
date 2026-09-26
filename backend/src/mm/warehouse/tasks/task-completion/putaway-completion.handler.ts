import {
    Injectable,
    BadRequestException,
    NotFoundException,
    Inject,
    forwardRef,
} from '@nestjs/common'
import { PrismaService } from '../../../../prisma/prisma.service'
import { InventoryPostingService } from '../../../inventory/inventory-posting.service'
import { CompleteTaskDto } from '../dto/warehouse-task.dto'
import { Decimal } from '@prisma/client/runtime/library'
import { WmWarehouseTask } from '@prisma/client'

@Injectable()
export class PutawayCompletionHandler {
    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => InventoryPostingService))
        private posting: InventoryPostingService,
    ) {}

    async complete(task: WmWarehouseTask, dto: CompleteTaskDto) {
        const destBinId = dto.destinationBinId
        if (!destBinId) {
            throw new BadRequestException('destinationBinId is required for putaway')
        }

        if (dto.scannedBinCode?.trim()) {
            await this.assertScannedBinMatches(
                task.warehouseId,
                destBinId,
                dto.scannedBinCode.trim(),
            )
        }

        const remaining = new Decimal(task.quantity).minus(task.completedQuantity)
        if (new Decimal(dto.quantity).gt(remaining)) {
            throw new BadRequestException('Putaway quantity exceeds remaining task quantity')
        }

        await this.assertBinAcceptsPutaway(
            destBinId,
            task.warehouseId,
            task.materialId!,
            dto.quantity,
        )

        const warehouse = await this.prisma.warehouse.findUnique({
            where: { id: task.warehouseId },
        })
        if (!warehouse) throw new NotFoundException('Warehouse not found')

        const material = await this.prisma.mmMaterial.findUnique({
            where: { id: task.materialId! },
        })
        if (!material) throw new NotFoundException('Material not found')

        const companyId = task.companyId
        const uomId = task.uomId ?? material.baseUomId
        const qty = dto.quantity
        const today = new Date().toISOString()
        const stockStatus = task.stockStatus ?? 'UNRESTRICTED'
        const idKey = dto.idempotencyKey

        if (task.sourceBinId) {
            await this.posting.postTransaction({
                companyId,
                warehouseId: task.warehouseId,
                storageBinId: task.sourceBinId,
                materialId: task.materialId!,
                batchId: task.batchId ?? undefined,
                serialNumberId: task.serialId ?? undefined,
                stockStatus,
                movementType: 'TRANSFER_OUT',
                quantity: qty,
                uomId,
                postingDate: today,
                documentDate: today,
                sourceModule: 'WAREHOUSE',
                sourceDocumentType: 'WAREHOUSE_TASK',
                sourceDocumentId: task.id,
                createdBy: dto.performedBy ?? task.assignedUserId ?? undefined,
                idempotencyKey: idKey ? `${idKey}:out` : undefined,
            })
        } else {
            await this.posting.postTransaction({
                companyId,
                warehouseId: task.warehouseId,
                materialId: task.materialId!,
                batchId: task.batchId ?? undefined,
                serialNumberId: task.serialId ?? undefined,
                stockStatus,
                movementType: 'TRANSFER_OUT',
                quantity: qty,
                uomId,
                postingDate: today,
                documentDate: today,
                sourceModule: 'WAREHOUSE',
                sourceDocumentType: 'WAREHOUSE_TASK',
                sourceDocumentId: task.id,
                createdBy: dto.performedBy ?? task.assignedUserId ?? undefined,
                idempotencyKey: idKey ? `${idKey}:out` : undefined,
            })
        }

        await this.posting.postTransaction({
            companyId,
            warehouseId: task.warehouseId,
            storageBinId: destBinId,
            materialId: task.materialId!,
            batchId: task.batchId ?? undefined,
            serialNumberId: task.serialId ?? undefined,
            stockStatus,
            movementType: 'TRANSFER_IN',
            quantity: qty,
            uomId,
            postingDate: today,
            documentDate: today,
            sourceModule: 'WAREHOUSE',
            sourceDocumentType: 'WAREHOUSE_TASK',
            sourceDocumentId: task.id,
            createdBy: dto.performedBy ?? task.assignedUserId ?? undefined,
            idempotencyKey: idKey ? `${idKey}:in` : undefined,
        })

        const newCompleted = new Decimal(task.completedQuantity).plus(qty)
        const isDone = newCompleted.gte(task.quantity)

        const updated = await this.prisma.wmWarehouseTask.update({
            where: { id: task.id },
            data: {
                completedQuantity: newCompleted,
                destinationBinId: destBinId,
                status: isDone ? 'COMPLETED' : 'PARTIALLY_COMPLETED',
                completedAt: isDone ? new Date() : null,
            },
        })

        const putawayBridge = await this.prisma.wmPutawayTask.findFirst({
            where: { warehouseTaskId: task.id },
        })
        if (putawayBridge) {
            await this.prisma.wmPutawayTask.update({
                where: { id: putawayBridge.id },
                data: {
                    actualBinId: destBinId,
                    quantity: newCompleted,
                    status: isDone ? 'COMPLETED' : 'IN_PROGRESS',
                    completedAt: isDone ? new Date() : null,
                },
            })
        }

        return updated
    }

    private async assertScannedBinMatches(
        warehouseId: string,
        actualBinId: string,
        scannedBinCode: string,
    ) {
        const bin = await this.prisma.wmStorageBin.findFirst({
            where: {
                OR: [
                    { id: scannedBinCode },
                    { code: { equals: scannedBinCode, mode: 'insensitive' } },
                    { barcode: { equals: scannedBinCode, mode: 'insensitive' } },
                ],
                storageSection: { storageType: { warehouseId } },
            },
        })
        if (!bin || bin.id !== actualBinId) {
            throw new BadRequestException('WRONG_BIN: Scanned bin does not match destination')
        }
    }

    private async assertBinAcceptsPutaway(
        binId: string,
        warehouseId: string,
        materialId: string,
        quantity: number,
    ) {
        const bin = await this.prisma.wmStorageBin.findUnique({
            where: { id: binId },
            include: { storageSection: { include: { storageType: true } } },
        })
        if (!bin) throw new BadRequestException('Storage bin not found')
        if (!bin.putawayAllowed) {
            throw new BadRequestException('BLOCKED_LOCATION: Bin does not allow putaway')
        }
        if (bin.storageSection.storageType.warehouseId !== warehouseId) {
            throw new BadRequestException('Bin is not in the target warehouse')
        }
        if (bin.status !== 'ACTIVE') {
            throw new BadRequestException('BLOCKED_LOCATION: Bin is not active')
        }
        void materialId
        void quantity
    }
}
