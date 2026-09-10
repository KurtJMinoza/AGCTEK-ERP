import { Injectable, BadRequestException, Inject, forwardRef } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { MaterialValuationService } from './material-valuation.service'
import { CostLayerService, LayerConsumption } from './cost-layer.service'

const COST_SCALE = 6

export type ValuationApplyInput = {
    inventoryTxnId: string
    companyId: string
    materialId: string
    warehouseId: string
    batchId?: string | null
    quantity: Decimal
    /** Document/receipt price from caller (inbound) */
    receiptUnitCost: Decimal
    /** +1 inbound/gain, -1 outbound/loss */
    direction: 1 | -1
    postingDate: Date
    sourceDocumentId?: string | null
    movementType: string
}

export type ValuationApplyResult = {
    unitCost: Decimal
    totalCost: Decimal
    valuationTxnId: string
}

@Injectable()
export class ValuationEngineService {
    constructor(
        private prisma: PrismaService,
        @Inject(forwardRef(() => MaterialValuationService))
        private materialValuation: MaterialValuationService,
        private costLayers: CostLayerService,
        private events: EventEmitter2,
    ) {}

    /**
     * Apply valuation side-effects inside an open Prisma transaction and return
     * the inventory unit/total cost that should be stored on the ledger txn.
     */
    async applyInTransaction(
        tx: Prisma.TransactionClient,
        input: ValuationApplyInput,
    ): Promise<ValuationApplyResult> {
        const existing = await tx.mmInventoryValuationTransaction.findUnique({
            where: { inventoryTxnId: input.inventoryTxnId },
        })
        if (existing) {
            return {
                unitCost: new Decimal(existing.unitCost),
                totalCost: new Decimal(existing.totalCost),
                valuationTxnId: existing.id,
            }
        }

        const valuation = await this.materialValuation.ensureForPosting(
            input.companyId,
            input.materialId,
            input.warehouseId,
            tx,
        )

        const method = valuation.valuationMethod
        const qty = input.quantity

        if (input.direction === 1) {
            return this.applyInbound(tx, input, valuation, method, qty)
        }
        return this.applyOutbound(tx, input, valuation, method, qty)
    }

    async reverseInTransaction(
        tx: Prisma.TransactionClient,
        originalInventoryTxnId: string,
        reversalInventoryTxnId: string,
    ): Promise<ValuationApplyResult | null> {
        const original = await tx.mmInventoryValuationTransaction.findUnique({
            where: { inventoryTxnId: originalInventoryTxnId },
        })
        if (!original) return null

        const already = await tx.mmInventoryValuationTransaction.findUnique({
            where: { reversalOfId: original.id },
        })
        if (already) {
            return {
                unitCost: new Decimal(already.unitCost),
                totalCost: new Decimal(already.totalCost),
                valuationTxnId: already.id,
            }
        }

        // Restore FIFO layers / MAP from snapshots
        if (original.valuationMethod === 'FIFO') {
            if (original.direction === 'OUT' && original.layerConsumptions) {
                await this.costLayers.restoreConsumptions(
                    tx,
                    original.layerConsumptions as unknown as LayerConsumption[],
                )
            } else if (original.direction === 'IN') {
                await this.costLayers.markReceiptLayerReversed(
                    tx,
                    originalInventoryTxnId,
                )
            }
        }

        if (
            original.valuationMethod === 'MOVING_AVERAGE' &&
            original.movingAvgBefore != null
        ) {
            await tx.mmMaterialValuation.updateMany({
                where: {
                    companyId: original.companyId,
                    materialId: original.materialId,
                    warehouseId: original.warehouseId,
                },
                data: {
                    movingAverageCost: original.movingAvgBefore,
                },
            })
        }

        const valNumber = await this.generateValNumber(tx)
        const reversal = await tx.mmInventoryValuationTransaction.create({
            data: {
                valuationNumber: valNumber,
                inventoryTxnId: reversalInventoryTxnId,
                companyId: original.companyId,
                materialId: original.materialId,
                warehouseId: original.warehouseId,
                valuationMethod: original.valuationMethod,
                direction: 'REVERSAL',
                quantity: new Decimal(original.quantity).neg(),
                unitCost: original.unitCost,
                totalCost: new Decimal(original.totalCost).neg(),
                priceVariance: new Decimal(original.priceVariance).neg(),
                movingAvgBefore: original.movingAvgAfter,
                movingAvgAfter: original.movingAvgBefore,
                layerConsumptions: original.layerConsumptions ?? undefined,
                reversalOfId: original.id,
            },
        })

        const payload = {
            sourceModule: 'VALUATION',
            documentType: 'INVENTORY_VALUATION',
            documentId: reversal.id,
            companyId: original.companyId,
            eventHint: 'INVENTORY_VALUATION_REVERSAL',
            lines: [
                {
                    materialId: original.materialId,
                    quantity: Number(new Decimal(original.quantity).neg()),
                    unitCost: Number(original.unitCost),
                    totalCost: Number(new Decimal(original.totalCost).neg()),
                },
            ],
        }

        await tx.mmAccountingEvent.create({
            data: {
                eventType: 'INVENTORY_VALUATION_REVERSED',
                sourceModule: 'VALUATION',
                documentType: 'INVENTORY_VALUATION',
                documentId: reversal.id,
                companyId: original.companyId,
                payload,
                status: 'PENDING',
            },
        })
        this.events.emit('accounting.entry.requested', payload)

        return {
            unitCost: new Decimal(reversal.unitCost),
            totalCost: new Decimal(reversal.totalCost),
            valuationTxnId: reversal.id,
        }
    }

    private async applyInbound(
        tx: Prisma.TransactionClient,
        input: ValuationApplyInput,
        valuation: any,
        method: string,
        qty: Decimal,
    ): Promise<ValuationApplyResult> {
        const receiptCost = this.roundCost(input.receiptUnitCost)
        let unitCost = receiptCost
        let totalCost = this.roundCost(receiptCost.mul(qty))
        let priceVariance = new Decimal(0)
        let movingAvgBefore: Decimal | null = null
        let movingAvgAfter: Decimal | null = null
        let layerConsumptions: LayerConsumption[] | null = null

        if (method === 'STANDARD_COST') {
            unitCost = this.roundCost(new Decimal(valuation.standardCost))
            totalCost = this.roundCost(unitCost.mul(qty))
            priceVariance = this.roundCost(
                receiptCost.minus(unitCost).mul(qty),
            )
        } else if (method === 'MOVING_AVERAGE') {
            movingAvgBefore = new Decimal(valuation.movingAverageCost)
            const onHand = await this.onHandQty(
                tx,
                input.companyId,
                input.warehouseId,
                input.materialId,
            )
            // onHand already includes this receipt (balance updated before valuation)
            const qtyBefore = onHand.minus(qty)
            if (qtyBefore.lte(0)) {
                movingAvgAfter = receiptCost
            } else {
                movingAvgAfter = qtyBefore
                    .mul(movingAvgBefore)
                    .plus(qty.mul(receiptCost))
                    .div(qtyBefore.plus(qty))
            }
            movingAvgAfter = this.roundCost(movingAvgAfter)
            await tx.mmMaterialValuation.update({
                where: { id: valuation.id },
                data: { movingAverageCost: movingAvgAfter },
            })
            unitCost = receiptCost
            totalCost = this.roundCost(receiptCost.mul(qty))
        } else if (method === 'FIFO') {
            await this.costLayers.createLayer(tx, {
                companyId: input.companyId,
                materialId: input.materialId,
                warehouseId: input.warehouseId,
                batchId: input.batchId,
                receiptTxnId: input.inventoryTxnId,
                receiptDocumentId: input.sourceDocumentId,
                quantity: qty,
                unitCost: receiptCost,
                postingDate: input.postingDate,
            })
            unitCost = receiptCost
            totalCost = this.roundCost(receiptCost.mul(qty))
        }

        const valTxn = await this.createValTxn(tx, {
            inventoryTxnId: input.inventoryTxnId,
            companyId: input.companyId,
            materialId: input.materialId,
            warehouseId: input.warehouseId,
            valuationMethod: method,
            direction: 'IN',
            quantity: qty,
            unitCost,
            totalCost,
            priceVariance,
            movingAvgBefore,
            movingAvgAfter,
            layerConsumptions,
        })

        await tx.mmInventoryTransaction.update({
            where: { id: input.inventoryTxnId },
            data: { unitCost, totalCost },
        })

        await this.emitValuationAccounting(tx, valTxn, priceVariance)

        return { unitCost, totalCost, valuationTxnId: valTxn.id }
    }

    private async applyOutbound(
        tx: Prisma.TransactionClient,
        input: ValuationApplyInput,
        valuation: any,
        method: string,
        qty: Decimal,
    ): Promise<ValuationApplyResult> {
        let unitCost = new Decimal(0)
        let totalCost = new Decimal(0)
        let movingAvgBefore: Decimal | null = null
        let movingAvgAfter: Decimal | null = null
        let layerConsumptions: LayerConsumption[] | null = null

        if (method === 'STANDARD_COST') {
            unitCost = this.roundCost(new Decimal(valuation.standardCost))
            totalCost = this.roundCost(unitCost.mul(qty))
        } else if (method === 'MOVING_AVERAGE') {
            movingAvgBefore = new Decimal(valuation.movingAverageCost)
            movingAvgAfter = movingAvgBefore
            unitCost = this.roundCost(movingAvgBefore)
            totalCost = this.roundCost(unitCost.mul(qty))
            // MAP unchanged on issue (snapshots stored for reversal)
        } else if (method === 'FIFO') {
            const consumed = await this.costLayers.consumeFifo(tx, {
                companyId: input.companyId,
                materialId: input.materialId,
                warehouseId: input.warehouseId,
                batchId: input.batchId,
                quantity: qty,
            })
            layerConsumptions = consumed.consumptions
            unitCost = this.roundCost(consumed.unitCost)
            totalCost = this.roundCost(consumed.totalCost)
        }

        const valTxn = await this.createValTxn(tx, {
            inventoryTxnId: input.inventoryTxnId,
            companyId: input.companyId,
            materialId: input.materialId,
            warehouseId: input.warehouseId,
            valuationMethod: method,
            direction: 'OUT',
            quantity: qty,
            unitCost,
            totalCost,
            priceVariance: new Decimal(0),
            movingAvgBefore,
            movingAvgAfter,
            layerConsumptions,
        })

        await tx.mmInventoryTransaction.update({
            where: { id: input.inventoryTxnId },
            data: { unitCost, totalCost },
        })

        await this.emitValuationAccounting(tx, valTxn, new Decimal(0))

        return { unitCost, totalCost, valuationTxnId: valTxn.id }
    }

    private async createValTxn(
        tx: Prisma.TransactionClient,
        data: {
            inventoryTxnId: string
            companyId: string
            materialId: string
            warehouseId: string
            valuationMethod: string
            direction: string
            quantity: Decimal
            unitCost: Decimal
            totalCost: Decimal
            priceVariance: Decimal
            movingAvgBefore: Decimal | null
            movingAvgAfter: Decimal | null
            layerConsumptions: LayerConsumption[] | null
        },
    ) {
        const valuationNumber = await this.generateValNumber(tx)
        return tx.mmInventoryValuationTransaction.create({
            data: {
                valuationNumber,
                inventoryTxnId: data.inventoryTxnId,
                companyId: data.companyId,
                materialId: data.materialId,
                warehouseId: data.warehouseId,
                valuationMethod: data.valuationMethod,
                direction: data.direction,
                quantity: data.quantity,
                unitCost: data.unitCost,
                totalCost: data.totalCost,
                priceVariance: data.priceVariance,
                movingAvgBefore: data.movingAvgBefore,
                movingAvgAfter: data.movingAvgAfter,
                layerConsumptions: data.layerConsumptions
                    ? (data.layerConsumptions as unknown as Prisma.InputJsonValue)
                    : undefined,
            },
        })
    }

    private async emitValuationAccounting(
        tx: Prisma.TransactionClient,
        valTxn: any,
        priceVariance: Decimal,
    ) {
        const payload = {
            sourceModule: 'VALUATION',
            documentType: 'INVENTORY_VALUATION',
            documentId: valTxn.id,
            companyId: valTxn.companyId,
            eventHint: 'INVENTORY_VALUATION',
            lines: [
                {
                    materialId: valTxn.materialId,
                    quantity: Number(valTxn.quantity),
                    unitCost: Number(valTxn.unitCost),
                    totalCost: Number(valTxn.totalCost),
                    priceVariance: Number(priceVariance),
                },
            ],
        }

        await tx.mmAccountingEvent.create({
            data: {
                eventType: 'INVENTORY_VALUATION_POSTED',
                sourceModule: 'VALUATION',
                documentType: 'INVENTORY_VALUATION',
                documentId: valTxn.id,
                companyId: valTxn.companyId,
                payload,
                status: 'PENDING',
            },
        })
        this.events.emit('accounting.entry.requested', payload)

        if (!priceVariance.isZero()) {
            const varPayload = {
                ...payload,
                eventHint: 'PRICE_VARIANCE',
            }
            await tx.mmAccountingEvent.create({
                data: {
                    eventType: 'PRICE_VARIANCE_POSTED',
                    sourceModule: 'VALUATION',
                    documentType: 'INVENTORY_VALUATION',
                    documentId: valTxn.id,
                    companyId: valTxn.companyId,
                    payload: varPayload,
                    status: 'PENDING',
                },
            })
            this.events.emit('accounting.entry.requested', varPayload)
        }
    }

    private async onHandQty(
        tx: Prisma.TransactionClient,
        companyId: string,
        warehouseId: string,
        materialId: string,
    ): Promise<Decimal> {
        const aggs = await tx.mmInventoryBalance.aggregate({
            where: {
                companyId,
                warehouseId,
                materialId,
                stockStatus: 'UNRESTRICTED',
            },
            _sum: { quantity: true },
        })
        return new Decimal(aggs._sum.quantity ?? 0)
    }

    private roundCost(value: Decimal): Decimal {
        return new Decimal(value.toFixed(COST_SCALE))
    }

    private async generateValNumber(
        tx: Prisma.TransactionClient,
    ): Promise<string> {
        const today = new Date()
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
        const prefix = `VAL-${dateStr}-`
        const last = await tx.mmInventoryValuationTransaction.findFirst({
            where: { valuationNumber: { startsWith: prefix } },
            orderBy: { valuationNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const n = parseInt(last.valuationNumber.replace(prefix, ''), 10)
            if (!isNaN(n)) seq = n + 1
        }
        return `${prefix}${String(seq).padStart(5, '0')}`
    }

    /**
     * Capitalize landed cost onto MAP / FIFO layers / std-cost variance.
     * Creates append-only valuation + synthetic inventory txn (no qty balance change).
     */
    async applyLandedCost(params: {
        companyId: string
        warehouseId: string
        materialId: string
        allocatedAmount: Decimal | number
        landedCostId: string
        postingDate?: Date
    }) {
        const allocated = this.roundCost(new Decimal(params.allocatedAmount))
        if (allocated.lte(0)) {
            throw new BadRequestException('Allocated amount must be positive')
        }

        return this.prisma.$transaction(async (tx) => {
            const valuation = await this.materialValuation.ensureForPosting(
                params.companyId,
                params.materialId,
                params.warehouseId,
                tx,
            )
            const method = valuation.valuationMethod
            const onHand = await this.onHandQty(
                tx,
                params.companyId,
                params.warehouseId,
                params.materialId,
            )
            const postingDate = params.postingDate ?? new Date()

            if (method !== 'STANDARD_COST' && onHand.lte(0)) {
                throw new BadRequestException(
                    `Cannot capitalize landed cost for material ${params.materialId}: no unrestricted on-hand`,
                )
            }

            const material = await tx.mmMaterial.findUnique({
                where: { id: params.materialId },
            })
            if (!material?.baseUomId) {
                throw new BadRequestException('Material base UOM is required')
            }

            let unitCost = new Decimal(0)
            let totalCost = allocated
            let priceVariance = new Decimal(0)
            let movingAvgBefore: Decimal | null = null
            let movingAvgAfter: Decimal | null = null
            let layerConsumptions: LayerConsumption[] | null = null
            const qty = onHand.gt(0) ? onHand : new Decimal(1)

            if (method === 'MOVING_AVERAGE') {
                movingAvgBefore = new Decimal(valuation.movingAverageCost)
                movingAvgAfter = this.roundCost(
                    onHand.mul(movingAvgBefore).plus(allocated).div(onHand),
                )
                await tx.mmMaterialValuation.update({
                    where: { id: valuation.id },
                    data: { movingAverageCost: movingAvgAfter },
                })
                unitCost = this.roundCost(allocated.div(onHand))
                totalCost = allocated
            } else if (method === 'FIFO') {
                const layers = await tx.mmCostLayer.findMany({
                    where: {
                        companyId: params.companyId,
                        materialId: params.materialId,
                        warehouseId: params.warehouseId,
                        status: 'OPEN',
                        remainingQuantity: { gt: 0 },
                    },
                    orderBy: [{ postingDate: 'asc' }, { createdAt: 'asc' }],
                })
                const totalRem = layers.reduce(
                    (s, l) => s.plus(l.remainingQuantity),
                    new Decimal(0),
                )
                if (totalRem.lte(0)) {
                    throw new BadRequestException(
                        'No open FIFO layers to capitalize onto',
                    )
                }
                const notes: LayerConsumption[] = []
                for (const layer of layers) {
                    const rem = new Decimal(layer.remainingQuantity)
                    const share = allocated.mul(rem).div(totalRem)
                    const newUnit = this.roundCost(
                        new Decimal(layer.unitCost).plus(share.div(rem)),
                    )
                    await tx.mmCostLayer.update({
                        where: { id: layer.id },
                        data: { unitCost: newUnit },
                    })
                    notes.push({
                        layerId: layer.id,
                        qty: rem.toString(),
                        unitCost: newUnit.toString(),
                    })
                }
                layerConsumptions = notes
                unitCost = this.roundCost(allocated.div(totalRem))
                totalCost = allocated
            } else {
                // STANDARD_COST — inventory stays at standard; capitalize as variance
                priceVariance = allocated
                unitCost = this.roundCost(new Decimal(valuation.standardCost))
                totalCost = new Decimal(0)
            }

            const invTxn = await this.createSyntheticInventoryTxn(tx, {
                companyId: params.companyId,
                warehouseId: params.warehouseId,
                materialId: params.materialId,
                uomId: material.baseUomId,
                quantity: qty,
                unitCost,
                totalCost,
                movementType: 'LANDED_COST',
                sourceDocumentType: 'LANDED_COST',
                sourceDocumentId: params.landedCostId,
                postingDate,
                remarks: `Landed cost capitalization ${params.landedCostId}`,
            })

            const valTxn = await this.createValTxn(tx, {
                inventoryTxnId: invTxn.id,
                companyId: params.companyId,
                materialId: params.materialId,
                warehouseId: params.warehouseId,
                valuationMethod: method,
                direction: 'IN',
                quantity: qty,
                unitCost,
                totalCost,
                priceVariance,
                movingAvgBefore,
                movingAvgAfter,
                layerConsumptions,
            })

            await this.emitLandedCostAccounting(tx, valTxn, allocated, priceVariance)
            return valTxn
        })
    }

    /**
     * Append-only on-hand revaluation when standard cost changes.
     */
    async applyRevaluation(params: {
        companyId: string
        warehouseId: string
        materialId: string
        oldStandardCost: Decimal | number
        newStandardCost: Decimal | number
        postingDate?: Date
    }) {
        const oldCost = this.roundCost(new Decimal(params.oldStandardCost))
        const newCost = this.roundCost(new Decimal(params.newStandardCost))
        const delta = this.roundCost(newCost.minus(oldCost))
        if (delta.isZero()) return null

        return this.prisma.$transaction(async (tx) => {
            const onHand = await this.onHandQty(
                tx,
                params.companyId,
                params.warehouseId,
                params.materialId,
            )
            if (onHand.lte(0)) return null

            const material = await tx.mmMaterial.findUnique({
                where: { id: params.materialId },
            })
            if (!material?.baseUomId) {
                throw new BadRequestException('Material base UOM is required')
            }

            const postingDate = params.postingDate ?? new Date()
            const totalCost = this.roundCost(delta.mul(onHand))

            const invTxn = await this.createSyntheticInventoryTxn(tx, {
                companyId: params.companyId,
                warehouseId: params.warehouseId,
                materialId: params.materialId,
                uomId: material.baseUomId,
                quantity: onHand,
                unitCost: delta,
                totalCost,
                movementType: 'REVALUATION',
                sourceDocumentType: 'STANDARD_COST_REVISION',
                sourceDocumentId: null,
                postingDate,
                remarks: `Standard cost revaluation ${oldCost} → ${newCost}`,
            })

            const valTxn = await this.createValTxn(tx, {
                inventoryTxnId: invTxn.id,
                companyId: params.companyId,
                materialId: params.materialId,
                warehouseId: params.warehouseId,
                valuationMethod: 'STANDARD_COST',
                direction: 'REVALUATION',
                quantity: onHand,
                unitCost: delta,
                totalCost,
                priceVariance: new Decimal(0),
                movingAvgBefore: null,
                movingAvgAfter: null,
                layerConsumptions: null,
            })

            const payload = {
                sourceModule: 'VALUATION',
                documentType: 'INVENTORY_VALUATION',
                documentId: valTxn.id,
                companyId: params.companyId,
                eventHint: 'INVENTORY_REVALUATION',
                lines: [
                    {
                        materialId: params.materialId,
                        quantity: Number(onHand),
                        unitCost: Number(delta),
                        totalCost: Number(totalCost),
                        oldStandardCost: Number(oldCost),
                        newStandardCost: Number(newCost),
                    },
                ],
            }
            await tx.mmAccountingEvent.create({
                data: {
                    eventType: 'INVENTORY_REVALUATION_POSTED',
                    sourceModule: 'VALUATION',
                    documentType: 'INVENTORY_VALUATION',
                    documentId: valTxn.id,
                    companyId: params.companyId,
                    payload,
                    status: 'PENDING',
                },
            })
            this.events.emit('accounting.entry.requested', payload)
            return valTxn
        })
    }

    private async createSyntheticInventoryTxn(
        tx: Prisma.TransactionClient,
        data: {
            companyId: string
            warehouseId: string
            materialId: string
            uomId: string
            quantity: Decimal
            unitCost: Decimal
            totalCost: Decimal
            movementType: string
            sourceDocumentType: string
            sourceDocumentId: string | null
            postingDate: Date
            remarks: string
        },
    ) {
        const today = new Date()
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
        const prefix = `TXN-${dateStr}-`
        const last = await tx.mmInventoryTransaction.findFirst({
            where: { transactionNumber: { startsWith: prefix } },
            orderBy: { transactionNumber: 'desc' },
        })
        let seq = 1
        if (last) {
            const n = parseInt(last.transactionNumber.replace(prefix, ''), 10)
            if (!isNaN(n)) seq = n + 1
        }
        const transactionNumber = `${prefix}${String(seq).padStart(5, '0')}`

        return tx.mmInventoryTransaction.create({
            data: {
                transactionNumber,
                companyId: data.companyId,
                warehouseId: data.warehouseId,
                materialId: data.materialId,
                stockStatus: 'UNRESTRICTED',
                movementType: data.movementType,
                quantity: data.quantity,
                uomId: data.uomId,
                unitCost: data.unitCost,
                totalCost: data.totalCost,
                postingDate: data.postingDate,
                documentDate: data.postingDate,
                sourceModule: 'VALUATION',
                sourceDocumentType: data.sourceDocumentType,
                sourceDocumentId: data.sourceDocumentId,
                remarks: data.remarks,
            },
        })
    }

    private async emitLandedCostAccounting(
        tx: Prisma.TransactionClient,
        valTxn: any,
        allocated: Decimal,
        priceVariance: Decimal,
    ) {
        const payload = {
            sourceModule: 'VALUATION',
            documentType: 'LANDED_COST',
            documentId: valTxn.id,
            companyId: valTxn.companyId,
            eventHint: 'LANDED_COST',
            lines: [
                {
                    materialId: valTxn.materialId,
                    quantity: Number(valTxn.quantity),
                    unitCost: Number(valTxn.unitCost),
                    totalCost: Number(allocated),
                    priceVariance: Number(priceVariance),
                },
            ],
        }
        await tx.mmAccountingEvent.create({
            data: {
                eventType: 'LANDED_COST_POSTED',
                sourceModule: 'VALUATION',
                documentType: 'LANDED_COST',
                documentId: valTxn.id,
                companyId: valTxn.companyId,
                payload,
                status: 'PENDING',
            },
        })
        this.events.emit('accounting.entry.requested', payload)

        if (!priceVariance.isZero()) {
            const varPayload = { ...payload, eventHint: 'PRICE_VARIANCE' }
            await tx.mmAccountingEvent.create({
                data: {
                    eventType: 'PRICE_VARIANCE_POSTED',
                    sourceModule: 'VALUATION',
                    documentType: 'LANDED_COST',
                    documentId: valTxn.id,
                    companyId: valTxn.companyId,
                    payload: varPayload,
                    status: 'PENDING',
                },
            })
            this.events.emit('accounting.entry.requested', varPayload)
        }
    }

    async listValuationTransactions(query: {
        companyId?: string
        warehouseId?: string
        materialId?: string
        valuationMethod?: string
        direction?: string
        priceVarianceOnly?: string | boolean
        page?: number
        limit?: number
    }) {
        const page = query.page ?? 1
        const limit = query.limit ?? 50
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.materialId) where.materialId = query.materialId
        if (query.valuationMethod) where.valuationMethod = query.valuationMethod
        if (query.direction) where.direction = query.direction
        const pvOnly =
            query.priceVarianceOnly === true ||
            query.priceVarianceOnly === 'true' ||
            query.priceVarianceOnly === '1'
        if (pvOnly) {
            where.priceVariance = { not: 0 }
        }

        const [rows, total] = await Promise.all([
            this.prisma.mmInventoryValuationTransaction.findMany({
                where,
                include: {
                    material: true,
                    warehouse: true,
                    inventoryTxn: true,
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.mmInventoryValuationTransaction.count({ where }),
        ])

        const data = await Promise.all(
            rows.map(async (row) => this.enrichPriceTriad(row)),
        )

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    /** Attach PO / receipt / invoice unit prices when source documents link. */
    private async enrichPriceTriad(row: any) {
        const inv = row.inventoryTxn
        const receiptUnitPrice =
            inv?.unitCost != null ? Number(inv.unitCost) : Number(row.unitCost)

        let poUnitPrice: number | null = null
        let invoiceUnitPrice: number | null = null

        const srcType = inv?.sourceDocumentType
        const srcId = inv?.sourceDocumentId
        const srcLineId = inv?.sourceDocumentLineId

        try {
            if (srcType === 'GOODS_RECEIPT' && srcId) {
                const grLine = srcLineId
                    ? await this.prisma.mmGoodsReceiptLine.findUnique({
                          where: { id: srcLineId },
                          include: {
                              purchaseOrderLine: true,
                          },
                      })
                    : await this.prisma.mmGoodsReceiptLine.findFirst({
                          where: {
                              receiptId: srcId,
                              materialId: row.materialId,
                          },
                          include: { purchaseOrderLine: true },
                      })

                if (grLine?.purchaseOrderLine) {
                    poUnitPrice = Number(grLine.purchaseOrderLine.unitPrice)
                    const invLine =
                        await this.prisma.mmSupplierInvoiceLine.findFirst({
                            where: {
                                purchaseOrderLineId: grLine.purchaseOrderLineId!,
                            },
                            orderBy: { lineNumber: 'desc' },
                        })
                    if (invLine) {
                        invoiceUnitPrice = Number(invLine.unitPrice)
                    }
                }
            } else if (
                (srcType === 'PURCHASE_ORDER' || srcType === 'PO') &&
                srcLineId
            ) {
                const poLine = await this.prisma.mmPurchaseOrderLine.findUnique({
                    where: { id: srcLineId },
                })
                if (poLine) poUnitPrice = Number(poLine.unitPrice)
            }
        } catch {
            /* enrichment is best-effort */
        }

        const { inventoryTxn: _omit, ...rest } = row
        return {
            ...rest,
            poUnitPrice,
            receiptUnitPrice,
            invoiceUnitPrice,
        }
    }
}
