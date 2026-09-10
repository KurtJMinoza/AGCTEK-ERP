import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { InventoryValueQueryDto } from './dto/valuation.dto'
import { MaterialValuationService } from './material-valuation.service'

@Injectable()
export class InventoryValueService {
    constructor(
        private prisma: PrismaService,
        private materialValuation: MaterialValuationService,
    ) {}

    /**
     * quantity × applicable cost at material/warehouse (and optional batch) level.
     */
    async query(query: InventoryValueQueryDto) {
        const page = query.page ?? 1
        const limit = query.limit ?? 50
        const rows = await this.loadAggregatedBalances(query)

        const total = rows.length
        const slice = rows.slice((page - 1) * limit, page * limit)

        const data = []
        for (const row of slice) {
            const val = await this.materialValuation.ensureForPosting(
                row.companyId,
                row.materialId,
                row.warehouseId,
            )
            const { unitCost, inventoryValue } = await this.resolveCost(
                val,
                row,
            )
            data.push({
                companyId: row.companyId,
                warehouseId: row.warehouseId,
                warehouseName: row.warehouseName,
                materialId: row.materialId,
                materialCode: row.materialCode,
                materialName: row.materialName,
                batchId: row.batchId,
                quantity: row.quantity.toString(),
                unitCost: unitCost.toFixed(6),
                inventoryValue: inventoryValue.toFixed(6),
                valuationMethod: val.valuationMethod,
                hasCost: true,
            })
        }

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        }
    }

    /**
     * Read-only valuation report — never creates valuation masters.
     */
    async queryReadOnly(query: InventoryValueQueryDto) {
        const page = query.page ?? 1
        const limit = query.limit ?? 50
        const rows = await this.loadAggregatedBalances(query)

        const total = rows.length
        if (total === 0) {
            return {
                data: [],
                meta: { total: 0, page, limit, totalPages: 0 },
                totals: { inventoryValue: 0 },
                readOnly: true,
            }
        }

        const slice = rows.slice((page - 1) * limit, page * limit)

        const allValuations = await this.prisma.mmMaterialValuation.findMany({
            where: {
                companyId: query.companyId,
                OR: rows.map((r) => ({
                    materialId: r.materialId,
                    warehouseId: r.warehouseId,
                })),
            },
        })
        const valMap = new Map(
            allValuations.map((v) => [`${v.warehouseId}|${v.materialId}`, v]),
        )

        const fifoKeys = rows.filter((r) => {
            const v = valMap.get(`${r.warehouseId}|${r.materialId}`)
            return v?.valuationMethod === 'FIFO'
        })
        const fifoLayers =
            fifoKeys.length > 0
                ? await this.prisma.mmCostLayer.findMany({
                      where: {
                          companyId: query.companyId,
                          status: 'OPEN',
                          remainingQuantity: { gt: 0 },
                          OR: fifoKeys.map((r) => ({
                              warehouseId: r.warehouseId,
                              materialId: r.materialId,
                              batchId: r.batchId,
                          })),
                      },
                  })
                : []

        const layerMap = new Map<string, typeof fifoLayers>()
        for (const l of fifoLayers) {
            const key = `${l.warehouseId}|${l.materialId}|${l.batchId ?? ''}`
            const arr = layerMap.get(key) ?? []
            arr.push(l)
            layerMap.set(key, arr)
        }

        const data = []
        for (const row of slice) {
            const val = valMap.get(`${row.warehouseId}|${row.materialId}`)
            if (!val) {
                data.push({
                    companyId: row.companyId,
                    warehouseId: row.warehouseId,
                    warehouseName: row.warehouseName,
                    materialId: row.materialId,
                    materialCode: row.materialCode,
                    materialName: row.materialName,
                    batchId: row.batchId,
                    quantity: row.quantity.toString(),
                    unitCost: null,
                    inventoryValue: null,
                    valuationMethod: null,
                    hasCost: false,
                })
                continue
            }

            let unitCost = new Decimal(0)
            if (val.valuationMethod === 'STANDARD_COST') {
                unitCost = new Decimal(val.standardCost)
            } else if (val.valuationMethod === 'MOVING_AVERAGE') {
                unitCost = new Decimal(val.movingAverageCost)
            } else if (val.valuationMethod === 'FIFO') {
                const layers =
                    layerMap.get(
                        `${row.warehouseId}|${row.materialId}|${row.batchId ?? ''}`,
                    ) ?? []
                let value = new Decimal(0)
                let remQty = new Decimal(0)
                for (const l of layers) {
                    const rq = new Decimal(l.remainingQuantity)
                    value = value.plus(rq.mul(l.unitCost))
                    remQty = remQty.plus(rq)
                }
                unitCost = remQty.gt(0) ? value.div(remQty) : new Decimal(0)
            }

            const inventoryValue = row.quantity.mul(unitCost)
            data.push({
                companyId: row.companyId,
                warehouseId: row.warehouseId,
                warehouseName: row.warehouseName,
                materialId: row.materialId,
                materialCode: row.materialCode,
                materialName: row.materialName,
                batchId: row.batchId,
                quantity: row.quantity.toString(),
                unitCost: unitCost.toFixed(6),
                inventoryValue: inventoryValue.toFixed(6),
                valuationMethod: val.valuationMethod,
                hasCost: true,
            })
        }

        const allValue = await this.sumReadOnlyValue(rows, valMap, layerMap)

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
            totals: { inventoryValue: allValue },
            readOnly: true,
        }
    }

    private async loadAggregatedBalances(query: InventoryValueQueryDto) {
        const where: any = {
            companyId: query.companyId,
            stockStatus: 'UNRESTRICTED',
            quantity: { gt: 0 },
        }
        if (query.warehouseId) where.warehouseId = query.warehouseId
        if (query.materialId) where.materialId = query.materialId
        if (query.batchId) where.batchId = query.batchId

        const balances = await this.prisma.mmInventoryBalance.findMany({
            where,
            include: { material: true, warehouse: true },
            orderBy: [{ warehouseId: 'asc' }, { materialId: 'asc' }],
        })

        type Key = string
        const map = new Map<
            Key,
            {
                companyId: string
                warehouseId: string
                warehouseName: string
                materialId: string
                materialCode: string
                materialName: string
                batchId: string | null
                quantity: Decimal
            }
        >()

        for (const b of balances) {
            const key = `${b.warehouseId}|${b.materialId}|${b.batchId ?? ''}`
            const existing = map.get(key)
            const qty = new Decimal(b.quantity)
            if (existing) {
                existing.quantity = existing.quantity.plus(qty)
            } else {
                map.set(key, {
                    companyId: b.companyId,
                    warehouseId: b.warehouseId,
                    warehouseName: b.warehouse.name,
                    materialId: b.materialId,
                    materialCode: b.material.materialCode,
                    materialName: b.material.materialName,
                    batchId: b.batchId,
                    quantity: qty,
                })
            }
        }

        return [...map.values()]
    }

    private async resolveCost(
        val: { valuationMethod: string; standardCost: Decimal; movingAverageCost: Decimal },
        row: { companyId: string; warehouseId: string; materialId: string; batchId: string | null; quantity: Decimal },
    ) {
        let unitCost = new Decimal(0)
        if (val.valuationMethod === 'STANDARD_COST') {
            unitCost = new Decimal(val.standardCost)
        } else if (val.valuationMethod === 'MOVING_AVERAGE') {
            unitCost = new Decimal(val.movingAverageCost)
        } else if (val.valuationMethod === 'FIFO') {
            const layers = await this.prisma.mmCostLayer.findMany({
                where: {
                    companyId: row.companyId,
                    warehouseId: row.warehouseId,
                    materialId: row.materialId,
                    batchId: row.batchId,
                    status: 'OPEN',
                    remainingQuantity: { gt: 0 },
                },
            })
            let value = new Decimal(0)
            let remQty = new Decimal(0)
            for (const l of layers) {
                const rq = new Decimal(l.remainingQuantity)
                value = value.plus(rq.mul(l.unitCost))
                remQty = remQty.plus(rq)
            }
            unitCost = remQty.gt(0) ? value.div(remQty) : new Decimal(0)
        }
        return { unitCost, inventoryValue: row.quantity.mul(unitCost) }
    }

    private async sumReadOnlyValue(
        rows: Awaited<ReturnType<typeof this.loadAggregatedBalances>>,
        valMap: Map<string, any>,
        layerMap: Map<string, any[]>,
    ) {
        let total = 0
        for (const row of rows) {
            const val = valMap.get(`${row.warehouseId}|${row.materialId}`)
            if (!val) continue
            let unitCost = new Decimal(0)
            if (val.valuationMethod === 'STANDARD_COST') {
                unitCost = new Decimal(val.standardCost)
            } else if (val.valuationMethod === 'MOVING_AVERAGE') {
                unitCost = new Decimal(val.movingAverageCost)
            } else if (val.valuationMethod === 'FIFO') {
                const layers =
                    layerMap.get(
                        `${row.warehouseId}|${row.materialId}|${row.batchId ?? ''}`,
                    ) ?? []
                let value = new Decimal(0)
                let remQty = new Decimal(0)
                for (const l of layers) {
                    const rq = new Decimal(l.remainingQuantity)
                    value = value.plus(rq.mul(l.unitCost))
                    remQty = remQty.plus(rq)
                }
                unitCost = remQty.gt(0) ? value.div(remQty) : new Decimal(0)
            }
            total += Number(row.quantity.mul(unitCost))
        }
        return Number(total.toFixed(6))
    }
}
