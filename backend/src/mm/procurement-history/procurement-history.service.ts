import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { ProcurementHistoryQueryDto } from './dto/procurement-history-query.dto'

/**
 * Read-only procurement history over PO lines.
 * Never posts inventory.
 */
@Injectable()
export class ProcurementHistoryService {
    constructor(private prisma: PrismaService) {}

    async search(query: ProcurementHistoryQueryDto) {
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 50

        const poWhere: any = {}
        if (query.companyId) poWhere.companyId = query.companyId
        if (query.supplierId) poWhere.supplierId = query.supplierId
        if (query.buyerId) poWhere.buyerId = query.buyerId
        if (query.poNumber) {
            poWhere.poNumber = {
                contains: query.poNumber,
                mode: 'insensitive',
            }
        }
        if (query.dateFrom || query.dateTo) {
            poWhere.createdAt = {}
            if (query.dateFrom) poWhere.createdAt.gte = new Date(query.dateFrom)
            if (query.dateTo) poWhere.createdAt.lte = new Date(query.dateTo)
        }

        const lineWhere: any = {
            purchaseOrder: poWhere,
        }
        if (query.materialId) lineWhere.materialId = query.materialId
        if (query.minPrice != null || query.maxPrice != null) {
            lineWhere.unitPrice = {}
            if (query.minPrice != null) {
                lineWhere.unitPrice.gte = new Decimal(query.minPrice)
            }
            if (query.maxPrice != null) {
                lineWhere.unitPrice.lte = new Decimal(query.maxPrice)
            }
        }
        if (query.minQty != null || query.maxQty != null) {
            lineWhere.quantity = {}
            if (query.minQty != null) {
                lineWhere.quantity.gte = new Decimal(query.minQty)
            }
            if (query.maxQty != null) {
                lineWhere.quantity.lte = new Decimal(query.maxQty)
            }
        }

        const [rows, total] = await Promise.all([
            this.prisma.mmPurchaseOrderLine.findMany({
                where: lineWhere,
                include: {
                    material: {
                        select: {
                            id: true,
                            materialCode: true,
                            materialName: true,
                        },
                    },
                    uom: { select: { id: true, code: true } },
                    purchaseOrder: {
                        select: {
                            id: true,
                            poNumber: true,
                            buyerId: true,
                            status: true,
                            createdAt: true,
                            expectedDeliveryDate: true,
                            supplier: {
                                select: {
                                    id: true,
                                    supplierCode: true,
                                    supplierName: true,
                                },
                            },
                            company: {
                                select: { id: true, name: true, code: true },
                            },
                        },
                    },
                },
                orderBy: { purchaseOrder: { createdAt: 'desc' } },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmPurchaseOrderLine.count({ where: lineWhere }),
        ])

        const data = rows.map((r) => ({
            id: r.id,
            poId: r.purchaseOrderId,
            poNumber: r.purchaseOrder.poNumber,
            poStatus: r.purchaseOrder.status,
            date: r.purchaseOrder.createdAt,
            expectedDeliveryDate: r.purchaseOrder.expectedDeliveryDate,
            buyerId: r.purchaseOrder.buyerId,
            company: r.purchaseOrder.company,
            supplier: r.purchaseOrder.supplier,
            material: r.material,
            uom: r.uom,
            quantity: Number(r.quantity),
            unitPrice: Number(r.unitPrice),
            lineTotal: Number(r.lineTotal),
        }))

        return {
            data,
            meta: {
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize),
            },
        }
    }
}
