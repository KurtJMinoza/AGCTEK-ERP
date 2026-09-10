import {
    Injectable,
    BadRequestException,
    NotFoundException,
    ConflictException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PostTransactionDto } from './dto/post-transaction.dto'
import { ReverseTransactionDto } from './dto/reverse-transaction.dto'
import { ValuationEngineService } from '../valuation/valuation-engine.service'
import { UomConversionsService } from '../uom-conversions/uom-conversions.service'
import { assertMaterialUsable } from '../materials/material-usability'

const MOVEMENT_DIRECTION: Record<string, 1 | -1> = {
    RECEIPT: 1,
    ISSUE: -1,
    TRANSFER_IN: 1,
    TRANSFER_OUT: -1,
    ADJUSTMENT_IN: 1,
    ADJUSTMENT_OUT: -1,
    RETURN_IN: 1,
    RETURN_OUT: -1,
    SCRAP: -1,
    COUNT_GAIN: 1,
    COUNT_LOSS: -1,
}

const ALLOWED_STOCK_STATUSES = new Set([
    'UNRESTRICTED',
    'QUALITY_INSPECTION',
    'BLOCKED',
    'QUARANTINE',
    'IN_TRANSIT',
    'EXPIRED',
    'DAMAGED',
])

@Injectable()
export class InventoryPostingService {
    constructor(
        private prisma: PrismaService,
        private events: EventEmitter2,
        private valuation: ValuationEngineService,
        private uomConversions: UomConversionsService,
    ) {}

    async postTransaction(dto: PostTransactionDto) {
        if (dto.idempotencyKey) {
            const existing = await this.prisma.mmInventoryTransaction.findUnique({
                where: { idempotencyKey: dto.idempotencyKey },
            })
            if (existing) return existing
        }

        const direction = MOVEMENT_DIRECTION[dto.movementType]
        if (direction === undefined) {
            throw new BadRequestException(`Unknown movement type: ${dto.movementType}`)
        }

        const material = await this.validateMaterial(dto.materialId)
        const warehouse = await this.validateWarehouse(dto.warehouseId)
        if (dto.storageBinId) await this.validateBin(dto.storageBinId, dto.warehouseId)
        await this.validateUom(dto.uomId)
        if (material.batchManaged && !dto.batchId) {
            throw new BadRequestException('Batch ID is required for batch-managed material')
        }
        if (dto.batchId) await this.validateBatch(dto.batchId, dto.materialId)
        if (material.serialManaged && !dto.serialNumberId) {
            throw new BadRequestException('Serial number ID is required for serial-managed material')
        }
        if (dto.serialNumberId) await this.validateSerial(dto.serialNumberId, dto.materialId)

        const stockStatus = dto.stockStatus || 'UNRESTRICTED'
        this.assertStockStatus(stockStatus)

        const createdBy = dto.createdBy?.trim() || 'system'
        const plantId = dto.plantId ?? warehouse.plantId ?? null

        const { quantity: qty, baseUomId } = await this.uomConversions.toBaseUom(
            dto.materialId,
            dto.uomId,
            dto.quantity,
        )
        const signedQty = direction === 1 ? qty : qty.neg()

        if (direction === -1 && !material.negativeStockAllowed) {
            await this.checkAvailableStock(
                dto.companyId, dto.warehouseId, dto.storageBinId ?? null,
                dto.materialId, dto.batchId ?? null, dto.serialNumberId ?? null,
                stockStatus, qty,
                dto.stockCheckMode ?? 'AVAILABLE',
            )
        }

        const receiptUnitCost = new Decimal(dto.unitCost ?? 0)
        const provisionalTotal =
            dto.totalCost !== undefined
                ? new Decimal(dto.totalCost)
                : receiptUnitCost.mul(qty)

        const result = await this.prisma.$transaction(async (tx) => {
            if (dto.idempotencyKey) {
                const dup = await tx.mmInventoryTransaction.findUnique({
                    where: { idempotencyKey: dto.idempotencyKey },
                })
                if (dup) return { transaction: dup, oldBalance: null as Decimal | null }
            }

            const txnNumber = await this.generateTxnNumber(tx)

            const transaction = await tx.mmInventoryTransaction.create({
                data: {
                    transactionNumber: txnNumber,
                    companyId: dto.companyId,
                    plantId,
                    warehouseId: dto.warehouseId,
                    storageBinId: dto.storageBinId ?? null,
                    materialId: dto.materialId,
                    batchId: dto.batchId ?? null,
                    serialNumberId: dto.serialNumberId ?? null,
                    stockStatus,
                    movementType: dto.movementType,
                    quantity: qty,
                    baseQuantity: qty,
                    signedQuantity: signedQty,
                    uomId: baseUomId,
                    unitCost: receiptUnitCost,
                    totalCost: provisionalTotal,
                    postingDate: new Date(dto.postingDate),
                    documentDate: new Date(dto.documentDate),
                    sourceModule: dto.sourceModule ?? null,
                    sourceDocumentType: dto.sourceDocumentType ?? null,
                    sourceDocumentId: dto.sourceDocumentId ?? null,
                    sourceDocumentLineId: dto.sourceDocumentLineId ?? null,
                    reasonCode: dto.reasonCode ?? null,
                    remarks: dto.remarks ?? null,
                    idempotencyKey: dto.idempotencyKey ?? null,
                    createdBy,
                },
            })

            const oldBalance = await this.upsertBalance(
                tx, dto.companyId, dto.warehouseId, dto.storageBinId ?? null,
                dto.materialId, dto.batchId ?? null, dto.serialNumberId ?? null,
                stockStatus, signedQty,
                dto.releaseReservedQuantity != null
                    ? new Decimal(dto.releaseReservedQuantity)
                    : undefined,
            )

            await this.valuation.applyInTransaction(tx, {
                inventoryTxnId: transaction.id,
                companyId: dto.companyId,
                materialId: dto.materialId,
                warehouseId: dto.warehouseId,
                batchId: dto.batchId ?? null,
                quantity: qty,
                receiptUnitCost,
                direction,
                postingDate: new Date(dto.postingDate),
                sourceDocumentId: dto.sourceDocumentId ?? null,
                movementType: dto.movementType,
            })

            const valued = await tx.mmInventoryTransaction.findUnique({
                where: { id: transaction.id },
            })

            await tx.mmInventoryAudit.create({
                data: {
                    transactionId: transaction.id,
                    action: 'POSTED',
                    changes: {
                        movementType: dto.movementType,
                        quantity: qty.toString(),
                        baseQuantity: qty.toString(),
                        signedQuantity: signedQty.toString(),
                        direction,
                        stockStatus,
                        unitCost: valued?.unitCost?.toString(),
                        totalCost: valued?.totalCost?.toString(),
                    },
                    performedBy: createdBy,
                },
            })

            return { transaction: valued ?? transaction, oldBalance }
        }, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: 20000,
        })

        this.events.emit('inventory.transaction.posted', result.transaction)
        this.events.emit('inventory.stock.changed', {
            materialId: dto.materialId,
            warehouseId: dto.warehouseId,
            storageBinId: dto.storageBinId ?? null,
            stockStatus,
            oldQty: result.oldBalance?.toString() ?? '0',
            newQty: new Decimal(result.oldBalance ?? 0).plus(signedQty).toString(),
        })

        return result.transaction
    }

    async reverseTransaction(transactionId: string, dto: ReverseTransactionDto) {
        const original = await this.prisma.mmInventoryTransaction.findUnique({
            where: { id: transactionId },
        })
        if (!original) throw new NotFoundException('Transaction not found')

        const existingReversal = await this.prisma.mmInventoryTransaction.findUnique({
            where: { reversalOfId: transactionId },
        })
        if (existingReversal) {
            throw new ConflictException('Transaction has already been reversed')
        }

        const direction = MOVEMENT_DIRECTION[original.movementType]
        if (direction === undefined) {
            throw new BadRequestException('Cannot reverse: unknown movement type')
        }

        const createdBy = dto.createdBy?.trim() || 'system'
        const baseQty = new Decimal(
            original.baseQuantity != null && Number(original.baseQuantity) !== 0
                ? original.baseQuantity
                : Decimal.abs(new Decimal(original.quantity)),
        )
        const reversalSignedQty = direction === 1 ? baseQty.neg() : baseQty

        if (direction === 1) {
            const material = await this.prisma.mmMaterial.findUnique({
                where: { id: original.materialId },
            })
            if (material && !material.negativeStockAllowed) {
                await this.checkAvailableStock(
                    original.companyId, original.warehouseId,
                    original.storageBinId, original.materialId,
                    original.batchId, original.serialNumberId,
                    original.stockStatus, baseQty,
                )
            }
        }

        const result = await this.prisma.$transaction(async (tx) => {
            const again = await tx.mmInventoryTransaction.findUnique({
                where: { reversalOfId: transactionId },
            })
            if (again) {
                throw new ConflictException('Transaction has already been reversed')
            }

            const txnNumber = await this.generateTxnNumber(tx)

            const reversal = await tx.mmInventoryTransaction.create({
                data: {
                    transactionNumber: txnNumber,
                    companyId: original.companyId,
                    plantId: original.plantId,
                    warehouseId: original.warehouseId,
                    storageBinId: original.storageBinId,
                    materialId: original.materialId,
                    batchId: original.batchId,
                    serialNumberId: original.serialNumberId,
                    stockStatus: original.stockStatus,
                    movementType: original.movementType,
                    quantity: baseQty.neg(),
                    baseQuantity: baseQty,
                    signedQuantity: reversalSignedQty,
                    uomId: original.uomId,
                    unitCost: original.unitCost,
                    totalCost: new Decimal(original.totalCost).neg(),
                    postingDate: new Date(),
                    documentDate: new Date(original.documentDate),
                    sourceModule: original.sourceModule,
                    sourceDocumentType: original.sourceDocumentType,
                    sourceDocumentId: original.sourceDocumentId,
                    sourceDocumentLineId: original.sourceDocumentLineId,
                    reasonCode: dto.reasonCode ?? 'REVERSAL',
                    remarks: dto.remarks ?? `Reversal of ${original.transactionNumber}`,
                    reversalOfId: original.id,
                    createdBy,
                },
            })

            await this.upsertBalance(
                tx, original.companyId, original.warehouseId, original.storageBinId,
                original.materialId, original.batchId, original.serialNumberId,
                original.stockStatus, reversalSignedQty,
            )

            await this.valuation.reverseInTransaction(
                tx,
                original.id,
                reversal.id,
            )

            await tx.mmInventoryAudit.create({
                data: {
                    transactionId: reversal.id,
                    action: 'REVERSED',
                    changes: {
                        originalTransactionId: original.id,
                        originalTransactionNumber: original.transactionNumber,
                        reversalQuantity: reversalSignedQty.toString(),
                        baseQuantity: baseQty.toString(),
                        signedQuantity: reversalSignedQty.toString(),
                    },
                    performedBy: createdBy,
                },
            })

            return reversal
        }, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: 20000,
        })

        this.events.emit('inventory.transaction.reversed', {
            reversal: result,
            original,
        })
        this.events.emit('inventory.stock.changed', {
            materialId: original.materialId,
            warehouseId: original.warehouseId,
            storageBinId: original.storageBinId,
            stockStatus: original.stockStatus,
        })

        return result
    }

    private assertStockStatus(status: string) {
        if (!ALLOWED_STOCK_STATUSES.has(status)) {
            throw new BadRequestException(
                `Invalid stock status: ${status}. Allowed: ${[...ALLOWED_STOCK_STATUSES].join(', ')}`,
            )
        }
    }

    private async validateMaterial(id: string) {
        const material = await this.prisma.mmMaterial.findFirst({
            where: { id, deletedAt: null },
        })
        assertMaterialUsable(material, { forInventory: true })
        return material!
    }

    private async validateWarehouse(id: string) {
        const wh = await this.prisma.warehouse.findFirst({
            where: { id, deletedAt: null },
        })
        if (!wh) throw new BadRequestException('Warehouse not found')
        if (wh.status !== 'ACTIVE') {
            throw new BadRequestException('Warehouse is not ACTIVE')
        }
        return wh
    }

    private async validateBin(binId: string, warehouseId: string) {
        const bin = await this.prisma.wmStorageBin.findFirst({
            where: { id: binId, deletedAt: null },
            include: { storageSection: { include: { storageType: true } } },
        })
        if (!bin) throw new BadRequestException('Storage bin not found')
        if (bin.status !== 'ACTIVE') {
            throw new BadRequestException('Storage bin is not ACTIVE')
        }
        if (bin.storageSection.storageType.warehouseId !== warehouseId) {
            throw new BadRequestException('Storage bin does not belong to the specified warehouse')
        }
        return bin
    }

    private async validateUom(id: string) {
        const uom = await this.prisma.mmUom.findFirst({
            where: { id, deletedAt: null },
        })
        if (!uom) throw new BadRequestException('UOM not found')
        return uom
    }

    private async validateBatch(batchId: string, materialId: string) {
        const batch = await this.prisma.mmBatch.findFirst({
            where: { id: batchId, materialId, deletedAt: null },
        })
        if (!batch) throw new BadRequestException('Batch not found or does not belong to material')
        return batch
    }

    private async validateSerial(serialId: string, materialId: string) {
        const serial = await this.prisma.mmSerialNumber.findFirst({
            where: { id: serialId, materialId, deletedAt: null },
        })
        if (!serial) throw new BadRequestException('Serial number not found or does not belong to material')
        return serial
    }

    private async checkAvailableStock(
        companyId: string,
        warehouseId: string,
        storageBinId: string | null,
        materialId: string,
        batchId: string | null,
        serialNumberId: string | null,
        stockStatus: string,
        requiredQty: Decimal,
        mode: 'AVAILABLE' | 'ON_HAND' = 'AVAILABLE',
    ) {
        const balance = await this.prisma.mmInventoryBalance.findFirst({
            where: {
                companyId,
                warehouseId,
                storageBinId: storageBinId ?? null,
                materialId,
                batchId: batchId ?? null,
                serialNumberId: serialNumberId ?? null,
                stockStatus,
            },
        })
        const pool = balance
            ? new Decimal(mode === 'ON_HAND' ? balance.quantity : balance.availableQuantity)
            : new Decimal(0)
        if (pool.lt(requiredQty)) {
            throw new BadRequestException(
                `Insufficient stock. ${mode === 'ON_HAND' ? 'On hand' : 'Available'}: ${pool.toString()}, Requested: ${requiredQty.toString()}`,
            )
        }
    }

    private async upsertBalance(
        tx: Prisma.TransactionClient,
        companyId: string,
        warehouseId: string,
        storageBinId: string | null,
        materialId: string,
        batchId: string | null,
        serialNumberId: string | null,
        stockStatus: string,
        signedQty: Decimal,
        releaseReserved?: Decimal,
    ): Promise<Decimal> {
        const existing = await tx.mmInventoryBalance.findFirst({
            where: {
                companyId,
                warehouseId,
                storageBinId: storageBinId ?? null,
                materialId,
                batchId: batchId ?? null,
                serialNumberId: serialNumberId ?? null,
                stockStatus,
            },
        })

        if (existing) {
            const oldQty = new Decimal(existing.quantity)
            const newQty = oldQty.plus(signedQty)
            let newReserved = new Decimal(existing.reservedQuantity)
            if (releaseReserved && releaseReserved.gt(0)) {
                newReserved = Decimal.max(new Decimal(0), newReserved.minus(releaseReserved))
            }
            const newAvailable = newQty.minus(newReserved)
            const updated = await tx.mmInventoryBalance.updateMany({
                where: { id: existing.id, version: existing.version },
                data: {
                    quantity: newQty,
                    reservedQuantity: newReserved,
                    availableQuantity: newAvailable,
                    version: { increment: 1 },
                },
            })
            if (updated.count === 0) {
                throw new ConflictException(
                    'Inventory balance was modified concurrently; retry the posting',
                )
            }
            return oldQty
        }

        await tx.mmInventoryBalance.create({
            data: {
                companyId,
                warehouseId,
                storageBinId: storageBinId ?? null,
                materialId,
                batchId: batchId ?? null,
                serialNumberId: serialNumberId ?? null,
                stockStatus,
                quantity: signedQty,
                reservedQuantity: 0,
                availableQuantity: signedQty,
            },
        })
        return new Decimal(0)
    }

    private async generateTxnNumber(tx: Prisma.TransactionClient): Promise<string> {
        const today = new Date()
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
        const prefix = `TXN-${dateStr}-`

        const last = await tx.mmInventoryTransaction.findFirst({
            where: { transactionNumber: { startsWith: prefix } },
            orderBy: { transactionNumber: 'desc' },
        })

        let seq = 1
        if (last) {
            const lastSeq = parseInt(last.transactionNumber.replace(prefix, ''), 10)
            if (!isNaN(lastSeq)) seq = lastSeq + 1
        }

        return `${prefix}${String(seq).padStart(5, '0')}`
    }
}
