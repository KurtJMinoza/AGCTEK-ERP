import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

export type ResolveHitType =
    | 'MATERIAL_BARCODE'
    | 'SKU'
    | 'MATERIAL_CODE'
    | 'SUPPLIER_BARCODE'
    | 'WAREHOUSE'
    | 'STORAGE_BIN'
    | 'BATCH'
    | 'SERIAL'
    | 'PURCHASE_ORDER'
    | 'EXPECTED_RECEIPT'
    | 'PICKING_TASK'
    | 'PUTAWAY_TASK'
    | 'WAREHOUSE_TASK'
    | 'TRANSFER_ORDER'
    | 'PACKAGE'
    | 'PALLET'
    | 'INVENTORY_COUNT'
    | 'INVENTORY_COUNT_LINE'

/** Canonical Phase 11 scan entity types */
export type ScanEntityType =
    | 'MATERIAL'
    | 'BATCH'
    | 'SERIAL'
    | 'BIN'
    | 'PALLET'
    | 'PACKAGE'
    | 'PURCHASE_ORDER'
    | 'TRANSFER_ORDER'
    | 'WAREHOUSE_TASK'
    | 'EXPECTED_RECEIPT'
    | 'INVENTORY_COUNT'
    | 'WAREHOUSE'

export interface ResolveHit {
    type: ResolveHitType
    /** Canonical scan type */
    entityType?: ScanEntityType
    entityId?: string
    barcode: string
    materialId?: string
    material?: {
        id: string
        materialCode: string
        materialName: string
        sku?: string | null
        batchManaged?: boolean
        serialManaged?: boolean
        baseUomId?: string
    }
    warehouseId?: string
    warehouse?: { id: string; code: string; name: string; companyId: string }
    storageBinId?: string
    storageBin?: { id: string; code: string; barcode?: string | null }
    location?: {
        warehouseId?: string
        storageBinId?: string
        binCode?: string
    } | null
    batchId?: string
    batch?: { id: string; batchNumber: string; materialId: string }
    serialNumberId?: string
    serial?: { id: string; serialNumber: string; materialId: string }
    supplierId?: string
    supplierMaterialId?: string
    documentType?: string
    documentId?: string
    documentNumber?: string
    purchaseOrderId?: string
    expectedReceiptId?: string
    pickingTaskId?: string
    putawayTaskId?: string
    warehouseTaskId?: string
    transferOrderId?: string
    packageId?: string
    countId?: string
    countLineId?: string
    status?: string | null
    allowedActions?: string[]
}

const MAT_SELECT = {
    id: true,
    materialCode: true,
    materialName: true,
    sku: true,
    batchManaged: true,
    serialManaged: true,
    baseUomId: true,
} as const

@Injectable()
export class BarcodeResolveService {
    constructor(private prisma: PrismaService) {}

    async resolve(barcode: string, companyId?: string): Promise<ResolveHit> {
        const hit = await this.resolveCore(barcode, companyId)
        return this.enrich(hit)
    }

    /**
     * Resolve priority:
     * material barcode → SKU → materialCode → supplier barcode →
     * warehouse → bin → batch → serial →
     * PO / ER / tasks / package / transfer / count
     */
    private async resolveCore(barcode: string, companyId?: string): Promise<ResolveHit> {
        const value = barcode.trim()
        if (!value) {
            throw new NotFoundException('INVALID_BARCODE: Barcode is empty')
        }

        const matBc = await this.prisma.mmBarcode.findFirst({
            where: { barcodeValue: value, deletedAt: null },
            include: { material: { select: MAT_SELECT } },
        })
        if (matBc) {
            return {
                type: 'MATERIAL_BARCODE',
                barcode: value,
                materialId: matBc.materialId,
                material: matBc.material,
            }
        }

        const bySku = await this.prisma.mmMaterial.findFirst({
            where: { sku: value, deletedAt: null },
            select: MAT_SELECT,
        })
        if (bySku) {
            return {
                type: 'SKU',
                barcode: value,
                materialId: bySku.id,
                material: bySku,
            }
        }

        const byCode = await this.prisma.mmMaterial.findFirst({
            where: { materialCode: value, deletedAt: null },
            select: MAT_SELECT,
        })
        if (byCode) {
            return {
                type: 'MATERIAL_CODE',
                barcode: value,
                materialId: byCode.id,
                material: byCode,
            }
        }

        const supMat = await this.prisma.mmSupplierMaterial.findFirst({
            where: { supplierBarcode: value },
            include: { material: { select: MAT_SELECT } },
        })
        if (supMat) {
            return {
                type: 'SUPPLIER_BARCODE',
                barcode: value,
                materialId: supMat.materialId,
                material: supMat.material,
                supplierId: supMat.supplierId,
                supplierMaterialId: supMat.id,
            }
        }

        const whWhere: any = { barcode: value, deletedAt: null }
        if (companyId) whWhere.companyId = companyId
        const wh = await this.prisma.warehouse.findFirst({
            where: whWhere,
            select: { id: true, code: true, name: true, companyId: true },
        })
        if (wh) {
            return {
                type: 'WAREHOUSE',
                barcode: value,
                warehouseId: wh.id,
                warehouse: wh,
            }
        }

        const bin = await this.prisma.wmStorageBin.findFirst({
            where: { barcode: value, deletedAt: null },
            select: { id: true, code: true, barcode: true },
        })
        if (bin) {
            return {
                type: 'STORAGE_BIN',
                barcode: value,
                storageBinId: bin.id,
                storageBin: bin,
            }
        }

        const batch = await this.prisma.mmBatch.findFirst({
            where: { batchNumber: value, deletedAt: null },
            select: { id: true, batchNumber: true, materialId: true },
        })
        if (batch) {
            return {
                type: 'BATCH',
                barcode: value,
                batchId: batch.id,
                batch,
                materialId: batch.materialId,
            }
        }

        const serial = await this.prisma.mmSerialNumber.findFirst({
            where: { serialNumber: value, deletedAt: null },
            select: { id: true, serialNumber: true, materialId: true },
        })
        if (serial) {
            return {
                type: 'SERIAL',
                barcode: value,
                serialNumberId: serial.id,
                serial,
                materialId: serial.materialId,
            }
        }

        // ── Document barcodes (document numbers) ────────────────
        const poWhere: any = { poNumber: value }
        if (companyId) poWhere.companyId = companyId
        const po = await this.prisma.mmPurchaseOrder.findFirst({
            where: poWhere,
            select: {
                id: true,
                poNumber: true,
                companyId: true,
                warehouseId: true,
                supplierId: true,
            },
        })
        if (po) {
            return {
                type: 'PURCHASE_ORDER',
                barcode: value,
                documentType: 'PURCHASE_ORDER',
                documentId: po.id,
                documentNumber: po.poNumber,
                purchaseOrderId: po.id,
                warehouseId: po.warehouseId ?? undefined,
                supplierId: po.supplierId,
            }
        }

        const erWhere: any = { documentNumber: value }
        if (companyId) erWhere.companyId = companyId
        const er = await this.prisma.mmExpectedReceipt.findFirst({
            where: erWhere,
            select: {
                id: true,
                documentNumber: true,
                companyId: true,
                warehouseId: true,
                purchaseOrderId: true,
                supplierId: true,
            },
        })
        if (er) {
            return {
                type: 'EXPECTED_RECEIPT',
                barcode: value,
                documentType: 'EXPECTED_RECEIPT',
                documentId: er.id,
                documentNumber: er.documentNumber,
                expectedReceiptId: er.id,
                purchaseOrderId: er.purchaseOrderId ?? undefined,
                warehouseId: er.warehouseId,
                supplierId: er.supplierId,
            }
        }

        const pickTask = await this.prisma.wmPickingTask.findFirst({
            where: { taskNumber: value },
            select: {
                id: true,
                taskNumber: true,
                companyId: true,
                warehouseId: true,
                materialId: true,
                sourceBinId: true,
                batchId: true,
                serialId: true,
                status: true,
            },
        })
        if (pickTask) {
            return {
                type: 'PICKING_TASK',
                barcode: value,
                documentType: 'PICKING_TASK',
                documentId: pickTask.id,
                documentNumber: pickTask.taskNumber,
                pickingTaskId: pickTask.id,
                warehouseTaskId: pickTask.id,
                warehouseId: pickTask.warehouseId,
                materialId: pickTask.materialId,
                storageBinId: pickTask.sourceBinId,
                batchId: pickTask.batchId ?? undefined,
                serialNumberId: pickTask.serialId ?? undefined,
                status: pickTask.status,
            }
        }

        const putaway = await this.prisma.wmPutawayTask.findFirst({
            where: { taskNumber: value },
            select: {
                id: true,
                taskNumber: true,
                companyId: true,
                warehouseId: true,
                materialId: true,
                sourceBinId: true,
                recommendedBinId: true,
                batchId: true,
                serialId: true,
                status: true,
            },
        })
        if (putaway) {
            return {
                type: 'PUTAWAY_TASK',
                barcode: value,
                documentType: 'PUTAWAY_TASK',
                documentId: putaway.id,
                documentNumber: putaway.taskNumber,
                putawayTaskId: putaway.id,
                warehouseTaskId: putaway.id,
                warehouseId: putaway.warehouseId,
                materialId: putaway.materialId,
                storageBinId:
                    putaway.recommendedBinId ?? putaway.sourceBinId ?? undefined,
                batchId: putaway.batchId ?? undefined,
                serialNumberId: putaway.serialId ?? undefined,
                status: putaway.status,
            }
        }

        const whTask = await this.prisma.wmWarehouseTask.findFirst({
            where: { taskNumber: value },
            select: {
                id: true,
                taskNumber: true,
                companyId: true,
                warehouseId: true,
                materialId: true,
                sourceBinId: true,
                destinationBinId: true,
                batchId: true,
                serialId: true,
                status: true,
                taskType: true,
            },
        })
        if (whTask) {
            return {
                type: 'WAREHOUSE_TASK',
                barcode: value,
                documentType: whTask.taskType,
                documentId: whTask.id,
                documentNumber: whTask.taskNumber,
                warehouseTaskId: whTask.id,
                warehouseId: whTask.warehouseId,
                materialId: whTask.materialId ?? undefined,
                storageBinId:
                    whTask.sourceBinId ?? whTask.destinationBinId ?? undefined,
                batchId: whTask.batchId ?? undefined,
                serialNumberId: whTask.serialId ?? undefined,
                status: whTask.status,
            }
        }

        const stoWhere: any = { orderNumber: value }
        if (companyId) stoWhere.companyId = companyId
        const sto = await this.prisma.mmStockTransferOrder.findFirst({
            where: stoWhere,
            select: {
                id: true,
                orderNumber: true,
                companyId: true,
                sourceWarehouseId: true,
                status: true,
            },
        })
        if (sto) {
            return {
                type: 'TRANSFER_ORDER',
                barcode: value,
                documentType: 'TRANSFER_ORDER',
                documentId: sto.id,
                documentNumber: sto.orderNumber,
                transferOrderId: sto.id,
                warehouseId: sto.sourceWarehouseId,
                status: sto.status,
            }
        }

        const pkg = await this.prisma.wmPackage.findFirst({
            where: { packageNumber: value },
            select: {
                id: true,
                packageNumber: true,
                warehouseId: true,
                packageType: true,
                status: true,
            },
        })
        if (pkg) {
            const isPallet =
                (pkg.packageType ?? '').toUpperCase() === 'PALLET' ||
                value.toUpperCase().startsWith('PLT')
            return {
                type: isPallet ? 'PALLET' : 'PACKAGE',
                barcode: value,
                documentType: isPallet ? 'PALLET' : 'PACKAGE',
                documentId: pkg.id,
                documentNumber: pkg.packageNumber,
                packageId: pkg.id,
                warehouseId: pkg.warehouseId,
                status: pkg.status,
            }
        }

        const count = await this.prisma.mmInventoryCount.findFirst({
            where: { countNumber: value },
            select: {
                id: true,
                countNumber: true,
                companyId: true,
                warehouseId: true,
                status: true,
            },
        })
        if (count) {
            return {
                type: 'INVENTORY_COUNT',
                barcode: value,
                documentType: 'INVENTORY_COUNT',
                documentId: count.id,
                documentNumber: count.countNumber,
                countId: count.id,
                warehouseId: count.warehouseId,
                status: count.status,
            }
        }

        // Count line by id (cuid scanned from label)
        const countLine = await this.prisma.mmInventoryCountLine.findFirst({
            where: { id: value },
            select: {
                id: true,
                countId: true,
                materialId: true,
                storageBinId: true,
                batchId: true,
                serialNumberId: true,
                status: true,
            },
        })
        if (countLine) {
            return {
                type: 'INVENTORY_COUNT_LINE',
                barcode: value,
                documentType: 'INVENTORY_COUNT_LINE',
                documentId: countLine.id,
                countId: countLine.countId,
                countLineId: countLine.id,
                materialId: countLine.materialId,
                storageBinId: countLine.storageBinId ?? undefined,
                batchId: countLine.batchId ?? undefined,
                serialNumberId: countLine.serialNumberId ?? undefined,
                status: countLine.status,
            }
        }

        throw new NotFoundException(
            `INVALID_BARCODE: No identifier found for barcode: ${value}`,
        )
    }

    /** Enrich hit with canonical entityType, location, allowedActions. */
    enrich(hit: ResolveHit): ResolveHit {
        const entityType = this.toEntityType(hit.type)
        const entityId =
            hit.materialId ||
            hit.batchId ||
            hit.serialNumberId ||
            hit.storageBinId ||
            hit.packageId ||
            hit.purchaseOrderId ||
            hit.transferOrderId ||
            hit.warehouseTaskId ||
            hit.putawayTaskId ||
            hit.pickingTaskId ||
            hit.expectedReceiptId ||
            hit.countId ||
            hit.countLineId ||
            hit.documentId ||
            hit.warehouseId

        return {
            ...hit,
            entityType,
            entityId,
            location: {
                warehouseId: hit.warehouseId,
                storageBinId: hit.storageBinId,
                binCode: hit.storageBin?.code,
            },
            status: hit.status ?? null,
            allowedActions: this.allowedActionsFor(entityType, hit.status),
        }
    }

    private toEntityType(type: ResolveHitType): ScanEntityType {
        switch (type) {
            case 'MATERIAL_BARCODE':
            case 'SKU':
            case 'MATERIAL_CODE':
            case 'SUPPLIER_BARCODE':
                return 'MATERIAL'
            case 'BATCH':
                return 'BATCH'
            case 'SERIAL':
                return 'SERIAL'
            case 'STORAGE_BIN':
                return 'BIN'
            case 'PALLET':
                return 'PALLET'
            case 'PACKAGE':
                return 'PACKAGE'
            case 'PURCHASE_ORDER':
                return 'PURCHASE_ORDER'
            case 'TRANSFER_ORDER':
                return 'TRANSFER_ORDER'
            case 'PICKING_TASK':
            case 'PUTAWAY_TASK':
            case 'WAREHOUSE_TASK':
                return 'WAREHOUSE_TASK'
            case 'EXPECTED_RECEIPT':
                return 'EXPECTED_RECEIPT'
            case 'INVENTORY_COUNT':
            case 'INVENTORY_COUNT_LINE':
                return 'INVENTORY_COUNT'
            case 'WAREHOUSE':
                return 'WAREHOUSE'
            default:
                return 'MATERIAL'
        }
    }

    private allowedActionsFor(
        entityType: ScanEntityType,
        status?: string | null,
    ): string[] {
        const closed = ['COMPLETED', 'CANCELLED', 'CLOSED', 'POSTED', 'DISPATCHED']
        if (status && closed.includes(status.toUpperCase())) {
            return ['VIEW']
        }
        switch (entityType) {
            case 'MATERIAL':
                return ['RECEIVE', 'PUTAWAY', 'PICK', 'COUNT', 'TRANSFER', 'PACK']
            case 'BATCH':
            case 'SERIAL':
                return ['RECEIVE', 'PUTAWAY', 'PICK', 'COUNT']
            case 'BIN':
                return ['PUTAWAY', 'PICK', 'COUNT', 'TRANSFER']
            case 'PACKAGE':
            case 'PALLET':
                return ['PACK', 'VIEW']
            case 'PURCHASE_ORDER':
            case 'EXPECTED_RECEIPT':
                return ['RECEIVE']
            case 'TRANSFER_ORDER':
                return ['TRANSFER', 'VIEW']
            case 'WAREHOUSE_TASK':
                return ['PUTAWAY', 'PICK', 'COUNT', 'CONFIRM']
            case 'INVENTORY_COUNT':
                return ['COUNT']
            case 'WAREHOUSE':
                return ['VIEW']
            default:
                return ['VIEW']
        }
    }

    async resolveBin(binOrId: string): Promise<{ id: string; code: string }> {
        const byId = await this.prisma.wmStorageBin.findFirst({
            where: { id: binOrId, deletedAt: null },
            select: { id: true, code: true },
        })
        if (byId) return byId

        const byBarcode = await this.prisma.wmStorageBin.findFirst({
            where: { barcode: binOrId, deletedAt: null },
            select: { id: true, code: true },
        })
        if (byBarcode) return byBarcode

        const byCode = await this.prisma.wmStorageBin.findFirst({
            where: { code: binOrId, deletedAt: null },
            select: { id: true, code: true },
        })
        if (byCode) return byCode

        throw new NotFoundException(`INVALID_BARCODE: Bin not found: ${binOrId}`)
    }

    async resolveBatch(
        batchOrId: string,
        materialId?: string,
    ): Promise<{ id: string; batchNumber: string; materialId: string }> {
        const byId = await this.prisma.mmBatch.findFirst({
            where: { id: batchOrId, deletedAt: null },
            select: { id: true, batchNumber: true, materialId: true },
        })
        if (byId) return byId

        const where: any = { batchNumber: batchOrId, deletedAt: null }
        if (materialId) where.materialId = materialId
        const byNumber = await this.prisma.mmBatch.findFirst({
            where,
            select: { id: true, batchNumber: true, materialId: true },
        })
        if (byNumber) return byNumber

        throw new NotFoundException(`INVALID_BARCODE: Batch not found: ${batchOrId}`)
    }

    async resolveSerial(
        serialOrId: string,
        materialId?: string,
    ): Promise<{ id: string; serialNumber: string; materialId: string }> {
        const byId = await this.prisma.mmSerialNumber.findFirst({
            where: { id: serialOrId, deletedAt: null },
            select: { id: true, serialNumber: true, materialId: true },
        })
        if (byId) return byId

        const where: any = { serialNumber: serialOrId, deletedAt: null }
        if (materialId) where.materialId = materialId
        const byNumber = await this.prisma.mmSerialNumber.findFirst({
            where,
            select: { id: true, serialNumber: true, materialId: true },
        })
        if (byNumber) return byNumber

        throw new NotFoundException(
            `INVALID_BARCODE: Serial not found: ${serialOrId}`,
        )
    }

    async resolveWarehouse(
        warehouseOrBarcode: string,
        companyId?: string,
    ): Promise<{ id: string; code: string; companyId: string }> {
        const byId = await this.prisma.warehouse.findFirst({
            where: { id: warehouseOrBarcode, deletedAt: null },
            select: { id: true, code: true, companyId: true },
        })
        if (byId) return byId

        const where: any = {
            OR: [{ barcode: warehouseOrBarcode }, { code: warehouseOrBarcode }],
            deletedAt: null,
        }
        if (companyId) where.companyId = companyId
        const hit = await this.prisma.warehouse.findFirst({
            where,
            select: { id: true, code: true, companyId: true },
        })
        if (hit) return hit

        throw new NotFoundException(
            `INVALID_BARCODE: Warehouse not found: ${warehouseOrBarcode}`,
        )
    }
}
