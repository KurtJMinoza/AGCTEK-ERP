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
    | 'INVENTORY_COUNT'
    | 'INVENTORY_COUNT_LINE'

export interface ResolveHit {
    type: ResolveHitType
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
    countId?: string
    countLineId?: string
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

    /**
     * Resolve priority:
     * material barcode → SKU → materialCode → supplier barcode →
     * warehouse → bin → batch → serial →
     * PO / ER / picking task / inventory count / count line
     */
    async resolve(barcode: string, companyId?: string): Promise<ResolveHit> {
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
                warehouseId: pickTask.warehouseId,
                materialId: pickTask.materialId,
                storageBinId: pickTask.sourceBinId,
                batchId: pickTask.batchId ?? undefined,
                serialNumberId: pickTask.serialId ?? undefined,
            }
        }

        const count = await this.prisma.mmInventoryCount.findFirst({
            where: { countNumber: value },
            select: {
                id: true,
                countNumber: true,
                companyId: true,
                warehouseId: true,
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
            }
        }

        throw new NotFoundException(
            `INVALID_BARCODE: No identifier found for barcode: ${value}`,
        )
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
