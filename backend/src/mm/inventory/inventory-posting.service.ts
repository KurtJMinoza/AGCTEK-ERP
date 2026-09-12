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
import { PostStatusChangeDto } from './dto/post-status-change.dto'
import { ValuationEngineService } from '../valuation/valuation-engine.service'
import { UomConversionsService } from '../uom-conversions/uom-conversions.service'
import { assertMaterialUsable } from '../materials/material-usability'
import {
    MM_STOCK_STATUSES,
    MOVEMENT_DIRECTION,
} from './inventory.constants'
import { reversalKey } from '../common/idempotency.util'
import { MmScopeService } from '../common/mm-scope.service'
import { MmDomainEventsService } from '../common/mm-domain-events.service'

const ALLOWED_STOCK_STATUSES = new Set<string>(MM_STOCK_STATUSES)

type PreparedPost = {
    dto: PostTransactionDto
    direction: 1 | -1
    effectiveBinId: string | null | undefined
    stockStatus: string
    createdBy: string
    plantId: string | null
    qty: Decimal
    signedQty: Decimal
    baseUomId: string
    receiptUnitCost: Decimal
    provisionalTotal: Decimal
}

@Injectable()
export class InventoryPostingService {
    constructor(
        private prisma: PrismaService,
        private events: EventEmitter2,
        private valuation: ValuationEngineService,
        private uomConversions: UomConversionsService,
        private scope: MmScopeService,
        private domainEvents: MmDomainEventsService,
    ) {}

    async postTransaction(dto: PostTransactionDto) {
        if (dto.idempotencyKey) {
            const existing = await this.prisma.mmInventoryTransaction.findUnique({
                where: { idempotencyKey: dto.idempotencyKey },
            })
            if (existing) return existing
        }

        const prepared = await this.preparePost(dto)
        const result = await this.prisma.$transaction(
            (tx) => this.runPostInTx(tx, prepared),
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                timeout: 20000,
            },
        )

        this.emitPostEvents(prepared, result)
        return result.transaction
    }

    /** Atomic transfer pair — both legs commit or neither does. */
    async postTransferPair(outDto: PostTransactionDto, inDto: PostTransactionDto) {
        if (outDto.idempotencyKey) {
            const existingOut = await this.prisma.mmInventoryTransaction.findUnique({
                where: { idempotencyKey: outDto.idempotencyKey },
            })
            if (existingOut) {
                const existingIn = inDto.idempotencyKey
                    ? await this.prisma.mmInventoryTransaction.findUnique({
                          where: { idempotencyKey: inDto.idempotencyKey },
                      })
                    : null
                if (existingIn) return { out: existingOut, in: existingIn }
            }
        }
        if (inDto.idempotencyKey) {
            const existingIn = await this.prisma.mmInventoryTransaction.findUnique({
                where: { idempotencyKey: inDto.idempotencyKey },
            })
            if (existingIn) {
                throw new BadRequestException(
                    'Transfer IN leg exists without matching OUT — data inconsistency',
                )
            }
        }

        const outPrepared = await this.preparePost(outDto)
        const inPrepared = await this.preparePost({
            ...inDto,
            sourceDocumentId: inDto.sourceDocumentId ?? undefined,
        })

        const result = await this.prisma.$transaction(
            async (tx) => {
                const outResult = await this.runPostInTx(tx, outPrepared)
                const inPreparedLinked: PreparedPost = {
                    ...inPrepared,
                    dto: {
                        ...inPrepared.dto,
                        sourceDocumentId:
                            inPrepared.dto.sourceDocumentId ?? outResult.transaction.id,
                    },
                }
                const inResult = await this.runPostInTx(tx, inPreparedLinked)
                return { outResult, inResult, inPrepared: inPreparedLinked }
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                timeout: 30000,
            },
        )

        this.emitPostEvents(outPrepared, result.outResult)
        this.emitPostEvents(result.inPrepared, result.inResult)
        return {
            out: result.outResult.transaction,
            in: result.inResult.transaction,
        }
    }

    async postStatusChange(dto: PostStatusChangeDto) {
        const idemKey = dto.idempotencyKey ?? `status:${dto.sourceDocumentId ?? dto.materialId}:${dto.fromStatus}:${dto.toStatus}:${dto.quantity}`
        if (dto.idempotencyKey) {
            const existing = await this.prisma.mmInventoryTransaction.findUnique({
                where: { idempotencyKey: idemKey },
            })
            if (existing) return existing
        }

        const material = await this.validateMaterial(dto.materialId)
        const warehouse = await this.validateWarehouse(dto.warehouseId)
        await this.scope.assertPostingScope({
            companyId: dto.companyId,
            warehouseId: dto.warehouseId,
            materialId: dto.materialId,
            storageBinId: dto.storageBinId,
            plantId: dto.plantId ?? warehouse.plantId,
        })
        const binId = dto.storageBinId ?? null
        if (binId) await this.validateBin(binId, dto.warehouseId)
        if (material.batchManaged && !dto.batchId) {
            throw new BadRequestException('Batch ID is required for batch-managed material')
        }
        if (material.serialManaged && !dto.serialNumberId) {
            throw new BadRequestException('Serial number ID is required for serial-managed material')
        }

        const createdBy = dto.createdBy?.trim() || 'system'
        const plantId = dto.plantId ?? warehouse.plantId ?? null

        const { quantity: qty, baseUomId } = await this.uomConversions.toBaseUom(
            dto.materialId,
            dto.uomId,
            dto.quantity,
        )

        if (!material.negativeStockAllowed) {
            await this.checkAvailableStock(
                dto.companyId,
                dto.warehouseId,
                binId,
                dto.materialId,
                dto.batchId ?? null,
                dto.serialNumberId ?? null,
                dto.fromStatus,
                qty,
                'ON_HAND',
            )
        }

        const result = await this.prisma.$transaction(
            async (tx) => {
                if (idemKey) {
                    const dup = await tx.mmInventoryTransaction.findUnique({
                        where: { idempotencyKey: idemKey },
                    })
                    if (dup) return dup
                }

                const txnNumber = await this.generateTxnNumber(tx)
                const transaction = await tx.mmInventoryTransaction.create({
                    data: {
                        transactionNumber: txnNumber,
                        companyId: dto.companyId,
                        plantId,
                        warehouseId: dto.warehouseId,
                        storageBinId: binId,
                        materialId: dto.materialId,
                        batchId: dto.batchId ?? null,
                        serialNumberId: dto.serialNumberId ?? null,
                        stockStatus: dto.toStatus,
                        movementType: 'STATUS_CHANGE',
                        quantity: qty,
                        baseQuantity: qty,
                        signedQuantity: new Decimal(0),
                        uomId: baseUomId,
                        postingDate: new Date(dto.postingDate),
                        documentDate: new Date(dto.documentDate),
                        sourceModule: dto.sourceModule ?? 'INVENTORY',
                        sourceDocumentType: dto.sourceDocumentType ?? null,
                        sourceDocumentId: dto.sourceDocumentId ?? null,
                        sourceDocumentLineId: dto.sourceDocumentLineId ?? null,
                        idempotencyKey: idemKey,
                        metadata: {
                            fromStatus: dto.fromStatus,
                            toStatus: dto.toStatus,
                        },
                        createdBy,
                    },
                })

                await this.upsertBalance(
                    tx,
                    dto.companyId,
                    plantId,
                    dto.warehouseId,
                    binId,
                    dto.materialId,
                    dto.batchId ?? null,
                    dto.serialNumberId ?? null,
                    dto.fromStatus,
                    qty.neg(),
                )
                await this.upsertBalance(
                    tx,
                    dto.companyId,
                    plantId,
                    dto.warehouseId,
                    binId,
                    dto.materialId,
                    dto.batchId ?? null,
                    dto.serialNumberId ?? null,
                    dto.toStatus,
                    qty,
                )

                await tx.mmInventoryAudit.create({
                    data: {
                        transactionId: transaction.id,
                        action: 'STATUS_CHANGE',
                        changes: {
                            fromStatus: dto.fromStatus,
                            toStatus: dto.toStatus,
                            quantity: qty.toString(),
                            idempotencyKey: idemKey,
                        },
                        performedBy: createdBy,
                    },
                })

                return transaction
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                timeout: 20000,
            },
        )

        this.events.emit('inventory.transaction.posted', result)
        this.events.emit('inventory.stock.changed', {
            materialId: dto.materialId,
            warehouseId: dto.warehouseId,
            storageBinId: binId,
            stockStatus: dto.toStatus,
        })

        return result
    }

    async reverseTransaction(transactionId: string, dto: ReverseTransactionDto) {
        const idemKey = dto.idempotencyKey ?? reversalKey(transactionId)
        const existingByKey = await this.prisma.mmInventoryTransaction.findUnique({
            where: { idempotencyKey: idemKey },
        })
        if (existingByKey) return existingByKey

        const original = await this.prisma.mmInventoryTransaction.findUnique({
            where: { id: transactionId },
        })
        if (!original) throw new NotFoundException('Transaction not found')

        const existingReversal = await this.prisma.mmInventoryTransaction.findUnique({
            where: { reversalOfId: transactionId },
        })
        if (existingReversal) return existingReversal

        await this.scope.assertPostingScope({
            companyId: original.companyId,
            warehouseId: original.warehouseId,
            materialId: original.materialId,
            storageBinId: original.storageBinId,
            plantId: original.plantId,
        })

        const direction = MOVEMENT_DIRECTION[original.movementType]
        if (direction === undefined || direction === 0) {
            throw new BadRequestException('Cannot reverse: unknown or status-change movement type')
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
                    original.companyId,
                    original.warehouseId,
                    original.storageBinId,
                    original.materialId,
                    original.batchId,
                    original.serialNumberId,
                    original.stockStatus,
                    baseQty,
                )
            }
        }

        const result = await this.prisma.$transaction(
            async (tx) => {
                const dupKey = await tx.mmInventoryTransaction.findUnique({
                    where: { idempotencyKey: idemKey },
                })
                if (dupKey) return dupKey

                const again = await tx.mmInventoryTransaction.findUnique({
                    where: { reversalOfId: transactionId },
                })
                if (again) return again

                const txnNumber = await this.generateTxnNumber(tx)

                const reversal = await tx.mmInventoryTransaction.create({
                    data: {
                        transactionNumber: txnNumber,
                        companyId: original.companyId,
                        plantId: original.plantId,
                        warehouseId: original.warehouseId,
                        storageBinId: original.storageBinId,
                        sourceBinId: original.sourceBinId,
                        destinationBinId: original.destinationBinId,
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
                        idempotencyKey: idemKey,
                        createdBy,
                    },
                })

                await this.upsertBalance(
                    tx,
                    original.companyId,
                    original.plantId,
                    original.warehouseId,
                    original.storageBinId,
                    original.materialId,
                    original.batchId,
                    original.serialNumberId,
                    original.stockStatus,
                    reversalSignedQty,
                )

                await this.valuation.reverseInTransaction(tx, original.id, reversal.id)

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
                            idempotencyKey: idemKey,
                        },
                        performedBy: createdBy,
                    },
                })

                return reversal
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                timeout: 20000,
            },
        )

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
        void this.domainEvents.inventoryTransactionReversed({
            companyId: original.companyId,
            reversalId: result.id,
            payload: {
                originalTransactionId: original.id,
                originalTransactionNumber: original.transactionNumber,
            },
        })

        return result
    }

    private async preparePost(dto: PostTransactionDto): Promise<PreparedPost> {
        const direction = MOVEMENT_DIRECTION[dto.movementType]
        if (direction === undefined || direction === 0) {
            throw new BadRequestException(
                `Unknown or invalid movement type: ${dto.movementType}. Use postStatusChange for STATUS_CHANGE.`,
            )
        }

        const material = await this.validateMaterial(dto.materialId)
        const warehouse = await this.validateWarehouse(dto.warehouseId)
        const effectiveBinId =
            dto.storageBinId ??
            (direction === -1 ? dto.sourceBinId : dto.destinationBinId) ??
            dto.sourceBinId ??
            dto.destinationBinId
        await this.scope.assertPostingScope({
            companyId: dto.companyId,
            warehouseId: dto.warehouseId,
            materialId: dto.materialId,
            storageBinId: effectiveBinId,
            plantId: dto.plantId ?? warehouse.plantId,
        })
        if (effectiveBinId) await this.validateBin(effectiveBinId, dto.warehouseId)
        if (dto.sourceBinId) await this.validateBin(dto.sourceBinId, dto.warehouseId)
        if (dto.destinationBinId) await this.validateBin(dto.destinationBinId, dto.warehouseId)
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
                dto.companyId,
                dto.warehouseId,
                effectiveBinId ?? null,
                dto.materialId,
                dto.batchId ?? null,
                dto.serialNumberId ?? null,
                stockStatus,
                qty,
                dto.stockCheckMode ?? 'AVAILABLE',
            )
        }

        const receiptUnitCost = new Decimal(dto.unitCost ?? 0)
        const provisionalTotal =
            dto.totalCost !== undefined
                ? new Decimal(dto.totalCost)
                : receiptUnitCost.mul(qty)

        return {
            dto,
            direction,
            effectiveBinId,
            stockStatus,
            createdBy,
            plantId,
            qty,
            signedQty,
            baseUomId,
            receiptUnitCost,
            provisionalTotal,
        }
    }

    private async runPostInTx(
        tx: Prisma.TransactionClient,
        prepared: PreparedPost,
    ): Promise<{ transaction: any; oldBalance: Decimal | null }> {
        const {
            dto,
            direction,
            effectiveBinId,
            stockStatus,
            createdBy,
            plantId,
            qty,
            signedQty,
            baseUomId,
            receiptUnitCost,
            provisionalTotal,
        } = prepared

        if (dto.idempotencyKey) {
            const dup = await tx.mmInventoryTransaction.findUnique({
                where: { idempotencyKey: dto.idempotencyKey },
            })
            if (dup) return { transaction: dup, oldBalance: null }
        }

        const txnNumber = await this.generateTxnNumber(tx)

        const transaction = await tx.mmInventoryTransaction.create({
            data: {
                transactionNumber: txnNumber,
                companyId: dto.companyId,
                plantId,
                warehouseId: dto.warehouseId,
                storageBinId: effectiveBinId ?? null,
                sourceBinId: dto.sourceBinId ?? null,
                destinationBinId: dto.destinationBinId ?? null,
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
            tx,
            dto.companyId,
            plantId,
            dto.warehouseId,
            effectiveBinId ?? null,
            dto.materialId,
            dto.batchId ?? null,
            dto.serialNumberId ?? null,
            stockStatus,
            signedQty,
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
                    idempotencyKey: dto.idempotencyKey ?? null,
                    unitCost: valued?.unitCost?.toString(),
                    totalCost: valued?.totalCost?.toString(),
                },
                performedBy: createdBy,
            },
        })

        return { transaction: valued ?? transaction, oldBalance }
    }

    private emitPostEvents(
        prepared: PreparedPost,
        result: { transaction: any; oldBalance: Decimal | null },
    ) {
        const { dto, effectiveBinId, stockStatus, signedQty } = prepared
        this.events.emit('inventory.transaction.posted', result.transaction)
        this.events.emit('inventory.stock.changed', {
            materialId: dto.materialId,
            warehouseId: dto.warehouseId,
            storageBinId: effectiveBinId ?? null,
            stockStatus,
            oldQty: result.oldBalance?.toString() ?? '0',
            newQty: new Decimal(result.oldBalance ?? 0).plus(signedQty).toString(),
        })
        void this.domainEvents.inventoryTransactionPosted({
            companyId: dto.companyId,
            transactionId: result.transaction.id,
            payload: {
                movementType: dto.movementType,
                materialId: dto.materialId,
                warehouseId: dto.warehouseId,
                quantity: prepared.qty.toString(),
                idempotencyKey: dto.idempotencyKey ?? null,
            },
        })
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
        plantId: string | null,
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
            if (newQty.lt(0)) {
                throw new BadRequestException('Operation would result in negative on-hand quantity')
            }
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
                    plantId: plantId ?? existing.plantId,
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

        if (signedQty.lt(0)) {
            throw new BadRequestException('Cannot issue from non-existent balance')
        }

        await tx.mmInventoryBalance.create({
            data: {
                companyId,
                plantId,
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
