import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * A ledger row's origin pointer.
 */
export type SourcePointer = {
    sourceDocumentType?: string | null
    sourceDocumentId?: string | null
}

/** Resolves source document ids into the document's own human number. */
type DocResolver = (
    prisma: PrismaService,
    ids: string[],
) => Promise<Map<string, string>>

const toMap = <K extends string>(
    rows: ({ id: string } & Record<K, string | null>)[],
    key: K,
) =>
    new Map(
        rows
            .filter((r) => !!r[key])
            .map((r) => [r.id, r[key] as string]),
    )

/**
 * Source document type -> the model that owns it and the field holding its
 * business number. One entry per ledger `sourceDocumentType` that can be
 * traced back to a real document.
 */
const DOC_RESOLVERS: Record<string, DocResolver> = {
    GOODS_RECEIPT: async (prisma, ids) =>
        toMap(
            await prisma.mmGoodsReceipt.findMany({
                where: { id: { in: ids } },
                select: { id: true, documentNumber: true },
            }),
            'documentNumber',
        ),
    GOODS_ISSUE: async (prisma, ids) =>
        toMap(
            await prisma.mmGoodsIssue.findMany({
                where: { id: { in: ids } },
                select: { id: true, documentNumber: true },
            }),
            'documentNumber',
        ),
    SALES_ORDER: async (prisma, ids) =>
        toMap(
            await prisma.sdSalesOrder.findMany({
                where: { id: { in: ids } },
                select: { id: true, orderNumber: true },
            }),
            'orderNumber',
        ),
    SO: async (prisma, ids) =>
        toMap(
            await prisma.sdSalesOrder.findMany({
                where: { id: { in: ids } },
                select: { id: true, orderNumber: true },
            }),
            'orderNumber',
        ),
    ORDER: async (prisma, ids) =>
        toMap(
            await prisma.sdSalesOrder.findMany({
                where: { id: { in: ids } },
                select: { id: true, orderNumber: true },
            }),
            'orderNumber',
        ),
    STOCK_TRANSFER_ORDER: async (prisma, ids) =>
        toMap(
            await prisma.mmStockTransferOrder.findMany({
                where: { id: { in: ids } },
                select: { id: true, orderNumber: true },
            }),
            'orderNumber',
        ),
    STOCK_TRANSFER_RECEIPT: async (prisma, ids) =>
        toMap(
            await prisma.mmTransferReceipt.findMany({
                where: { id: { in: ids } },
                select: { id: true, receiptNumber: true },
            }),
            'receiptNumber',
        ),
    STOCK_TRANSFER_SHIPMENT: async (prisma, ids) =>
        toMap(
            await prisma.mmTransferShipment.findMany({
                where: { id: { in: ids } },
                select: { id: true, shipmentNumber: true },
            }),
            'shipmentNumber',
        ),
    WAREHOUSE_TRANSFER: async (prisma, ids) =>
        toMap(
            await prisma.wmWarehouseTransfer.findMany({
                where: { id: { in: ids } },
                select: { id: true, transferNumber: true },
            }),
            'transferNumber',
        ),
    WM_TRANSFER: async (prisma, ids) =>
        toMap(
            await prisma.wmWarehouseTransfer.findMany({
                where: { id: { in: ids } },
                select: { id: true, transferNumber: true },
            }),
            'transferNumber',
        ),
    BIN_TRANSFER: async (prisma, ids) =>
        toMap(
            await prisma.mmBinTransfer.findMany({
                where: { id: { in: ids } },
                select: { id: true, documentNumber: true },
            }),
            'documentNumber',
        ),
    WAREHOUSE_TASK: async (prisma, ids) =>
        toMap(
            await prisma.wmWarehouseTask.findMany({
                where: { id: { in: ids } },
                select: { id: true, taskNumber: true },
            }),
            'taskNumber',
        ),
    PUTAWAY: async (prisma, ids) =>
        toMap(
            await prisma.wmPutawayTask.findMany({
                where: { id: { in: ids } },
                select: { id: true, taskNumber: true },
            }),
            'taskNumber',
        ),
    PACKAGE: async (prisma, ids) =>
        toMap(
            await prisma.wmPackage.findMany({
                where: { id: { in: ids } },
                select: { id: true, packageNumber: true },
            }),
            'packageNumber',
        ),
    INVENTORY_COUNT_ADJUSTMENT: async (prisma, ids) =>
        toMap(
            await prisma.mmInventoryCount.findMany({
                where: { id: { in: ids } },
                select: { id: true, countNumber: true },
            }),
            'countNumber',
        ),
    QUALITY_INSPECTION: async (prisma, ids) =>
        toMap(
            await prisma.mmQualityInspection.findMany({
                where: { id: { in: ids } },
                select: { id: true, inspectionNumber: true },
            }),
            'inspectionNumber',
        ),
    INSPECTION_LOT: async (prisma, ids) =>
        toMap(
            await prisma.mmInspectionLot.findMany({
                where: { id: { in: ids } },
                select: { id: true, lotNumber: true },
            }),
            'lotNumber',
        ),
    CUSTOMER_RETURN: async (prisma, ids) =>
        toMap(
            await prisma.mmCustomerReturn.findMany({
                where: { id: { in: ids } },
                select: { id: true, returnNumber: true },
            }),
            'returnNumber',
        ),
    SUPPLIER_RETURN: async (prisma, ids) =>
        toMap(
            await prisma.mmSupplierReturn.findMany({
                where: { id: { in: ids } },
                select: { id: true, returnNumber: true },
            }),
            'returnNumber',
        ),
    DISPOSAL: async (prisma, ids) =>
        toMap(
            await prisma.mmDisposal.findMany({
                where: { id: { in: ids } },
                select: { id: true, disposalNumber: true },
            }),
            'disposalNumber',
        ),
    PRODUCTION_ORDER: async (prisma, ids) =>
        toMap(
            await prisma.ppProductionOrder.findMany({
                where: { id: { in: ids } },
                select: { id: true, orderNumber: true },
            }),
            'orderNumber',
        ),
    WORK_ORDER: async (prisma, ids) =>
        toMap(
            await prisma.ppProductionOrder.findMany({
                where: { id: { in: ids } },
                select: { id: true, orderNumber: true },
            }),
            'orderNumber',
        ),
    PLANNED_ORDER: async (prisma, ids) =>
        toMap(
            await prisma.mmPlannedOrder.findMany({
                where: { id: { in: ids } },
                select: { id: true, plannedOrderNumber: true },
            }),
            'plannedOrderNumber',
        ),
    LANDED_COST: async (prisma, ids) =>
        toMap(
            await prisma.mmLandedCost.findMany({
                where: { id: { in: ids } },
                select: { id: true, documentNumber: true },
            }),
            'documentNumber',
        ),
    /**
     * Stock level edits point at the material itself, so the material code is
     * the meaningful reference.
     */
    MATERIAL_STOCK_THRESHOLD: async (prisma, ids) =>
        toMap(
            await prisma.mmMaterial.findMany({
                where: { id: { in: ids } },
                select: { id: true, materialCode: true },
            }),
            'materialCode',
        ),
    STANDARD_COST_REVISION: async (prisma, ids) =>
        toMap(
            await prisma.mmMaterial.findMany({
                where: { id: { in: ids } },
                select: { id: true, materialCode: true },
            }),
            'materialCode',
        ),
}

/**
 * Turns raw `sourceDocumentType` + `sourceDocumentId` pointers into the
 * business number of the document that caused the posting, so the ledger can
 * show a reference an operations user can act on instead of an internal id.
 *
 * Resolution is best-effort: an unknown type or a deleted document simply
 * yields no reference, and the caller falls back to the raw pointer.
 */
@Injectable()
export class InventorySourceReferenceResolver {
    constructor(private prisma: PrismaService) {}

    /**
     * @returns map of `type::id` -> document number
     */
    async resolve(pointers: SourcePointer[]): Promise<Map<string, string>> {
        const result = new Map<string, string>()

        const idsByType = new Map<string, string[]>()
        for (const p of pointers) {
            const type = p.sourceDocumentType
            const id = p.sourceDocumentId
            if (!type || !id) continue
            if (!DOC_RESOLVERS[type]) continue
            const bucket = idsByType.get(type) ?? []
            if (!bucket.includes(id)) bucket.push(id)
            idsByType.set(type, bucket)
        }

        await Promise.all(
            [...idsByType.entries()].map(async ([type, ids]) => {
                const resolver = DOC_RESOLVERS[type]
                try {
                    const found = await resolver(this.prisma, ids)
                    for (const [id, number] of found) {
                        result.set(`${type}::${id}`, number)
                    }
                } catch {
                    // A reference is a nicety — never fail the ledger over it.
                }
            }),
        )

        return result
    }
}
