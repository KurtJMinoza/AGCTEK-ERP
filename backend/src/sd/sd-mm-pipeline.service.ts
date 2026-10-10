import { Injectable, Logger } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../prisma/prisma.service'
import { UomConversionsService } from '../mm/uom-conversions/uom-conversions.service'
import { MaterialResolutionService } from './material-resolution.service'
import { FulfillmentDeterminationService } from './fulfillment-determination.service'
import { SdFulfillmentService } from './sd-fulfillment.service'
import { SdEventEmitterService } from './sd-event-emitter.service'
import { SD_EVENTS } from './sd-event.types'
import { SD_MM_ERROR, SdMmIntegrationException } from './sd-integration.errors'

@Injectable()
export class SdMmPipelineService {
    private readonly logger = new Logger(SdMmPipelineService.name)

    constructor(
        private prisma: PrismaService,
        private uom: UomConversionsService,
        private materialResolution: MaterialResolutionService,
        private fulfillmentDetermination: FulfillmentDeterminationService,
        private fulfillment: SdFulfillmentService,
        private sdEvents: SdEventEmitterService,
    ) {}

    /**
     * Resolve product→material, UOM→base, warehouse, and SD fulfillment rows.
     * Does not emit MM events (call `emitSalesOrderConfirmedIntegration` after).
     */
    async enrichOrderForMmIntegration(salesOrderId: string) {
        const order = await this.prisma.sdSalesOrder.findUnique({
            where: { id: salesOrderId },
            include: { lines: { orderBy: { lineNumber: 'asc' } } },
        })
        if (!order) return null

        const companyId =
            order.companyId ??
            (await this.fulfillmentDetermination.defaultCompanyId())
        /** Mutable: a variant's linked company overrides the fallback per line. */
        let effectiveCompanyId = companyId

        const linesByWarehouse = new Map<
            string,
            Array<{
                salesOrderLineId: string
                productId: string | null
                materialId: string
                salesQty: Decimal
                salesUomId: string | null
                baseQty: Decimal
                baseUomId: string
            }>
        >()

        for (const line of order.lines) {
            let productId = line.productId
            let materialId = line.materialId
            const divisionId = line.divisionId ?? order.divisionId
            let variantSalesUomId: string | null = null

            // Variants are the stock item: their linked material supplies ATP,
            // reservation and goods issue — never the parent product's material.
            if (line.variantId) {
                const variant = await this.prisma.sdProductVariant.findUnique({
                    where: { id: line.variantId },
                    select: {
                        materialId: true,
                        companyId: true,
                        salesUomId: true,
                        materialUomId: true,
                    },
                })
                if (variant?.materialId) {
                    materialId = variant.materialId
                    if (variant.companyId) effectiveCompanyId = variant.companyId
                    variantSalesUomId =
                        variant.salesUomId ?? variant.materialUomId ?? null
                }
            }

            if (!materialId && line.sku && divisionId) {
                const product =
                    await this.materialResolution.findProductByDivisionSku(
                        divisionId,
                        line.sku,
                    )
                if (product) {
                    productId = product.id
                    if (product.productType === 'STOCK_ITEM') {
                        const resolved =
                            await this.materialResolution.resolveMaterialForProduct(
                                {
                                    productId: product.id,
                                    companyId,
                                    divisionId,
                                    channel: order.channel,
                                },
                            )
                        materialId = resolved.materialId
                    }
                }
            }

            if (!materialId) continue

            const material = await this.prisma.mmMaterial.findUnique({
                where: { id: materialId },
                select: { baseUomId: true },
            })
            if (!material) continue

            let productSalesUom: string | null = null
            if (productId) {
                const p = await this.prisma.sdProduct.findUnique({
                    where: { id: productId },
                    select: { salesUomId: true },
                })
                productSalesUom = p?.salesUomId ?? null
            }
            const salesUomId =
                line.salesUomId ??
                variantSalesUomId ??
                productSalesUom ??
                material.baseUomId

            let baseQty: Decimal
            let baseUomId = material.baseUomId
            try {
                const converted = await this.uom.toBaseUom(
                    materialId,
                    salesUomId,
                    line.quantity,
                )
                baseQty = converted.quantity
                baseUomId = converted.baseUomId
            } catch (err) {
                // Retail lines with no explicit UOM conversion still flow into
                // the pipeline: one sold unit maps to one base unit. Preferred
                // over failing checkout after the order is already recorded.
                if (
                    err instanceof Error &&
                    /No UOM conversion found/i.test(err.message)
                ) {
                    this.logger.warn(
                        `Order ${order.orderNumber} line ${line.lineNumber}: no UOM conversion ` +
                            `for material ${materialId} (sku ${line.sku}) — using 1:1 base units`,
                    )
                    baseQty = new Decimal(line.quantity)
                    baseUomId = material.baseUomId
                } else {
                    throw new SdMmIntegrationException(
                        SD_MM_ERROR.INVALID_UOM_MAPPING,
                        err instanceof Error ? err.message : 'UOM conversion failed',
                    )
                }
            }

            await this.prisma.sdSalesOrderLine.update({
                where: { id: line.id },
                data: {
                    productId,
                    materialId,
                    salesUomId,
                    baseQuantity: baseQty,
                    baseUomId,
                    // Organization / MM company scope, mirrored on every line so
                    // picking/packing/shipment/invoice/return all derive it.
                    ...(effectiveCompanyId
                        ? { companyId: effectiveCompanyId }
                        : {}),
                },
            })

            const { warehouseId } =
                await this.fulfillmentDetermination.determineWarehouse({
                    companyId: effectiveCompanyId,
                    channel: order.channel,
                    branchId: order.branchId,
                    divisionId,
                    explicitWarehouseId: order.warehouseId,
                    materialId,
                })

            const bucket = linesByWarehouse.get(warehouseId) ?? []
            bucket.push({
                salesOrderLineId: line.id,
                productId,
                materialId,
                salesQty: line.quantity,
                salesUomId,
                baseQty,
                baseUomId,
            })
            linesByWarehouse.set(warehouseId, bucket)
        }

        const primaryWarehouse =
            order.warehouseId ??
            linesByWarehouse.keys().next().value ??
            null

        // E-commerce orders don't pick a branch at checkout — carry the
        // Organization branch of the fulfillment warehouse (e.g. HQ Branch).
        let primaryWarehouseBranchId: string | null = null
        if (!order.branchId && primaryWarehouse) {
            const warehouse =
                await this.prisma.warehouse.findUnique({
                    where: { id: primaryWarehouse },
                    select: { branchId: true },
                })
            primaryWarehouseBranchId = warehouse?.branchId ?? null
        }

        await this.prisma.sdSalesOrder.update({
            where: { id: order.id },
            data: {
                companyId: effectiveCompanyId,
                ...(primaryWarehouse ? { warehouseId: primaryWarehouse } : {}),
                ...(primaryWarehouseBranchId
                    ? { branchId: primaryWarehouseBranchId }
                    : {}),
            },
        })

        for (const [warehouseId, lines] of linesByWarehouse) {
            await this.fulfillment.syncFulfillmentsForOrder({
                salesOrderId: order.id,
                companyId: effectiveCompanyId,
                warehouseId,
                lines,
            })
        }

        return this.prisma.sdSalesOrder.findUnique({
            where: { id: salesOrderId },
            include: {
                lines: { include: { material: true }, orderBy: { lineNumber: 'asc' } },
            },
        })
    }

    async emitSalesOrderConfirmedIntegration(
        order: NonNullable<Awaited<ReturnType<typeof this.enrichOrderForMmIntegration>>>,
    ) {
        if (!this.isMmLinked(order)) {
            this.logger.warn(
                `Order ${order.orderNumber} skipped MM integration — missing material mapping or scope`,
            )
            return false
        }

        await this.sdEvents.emit(SD_EVENTS.SALES_ORDER_CONFIRMED, this.toEventPayload(order))
        return true
    }

    /** Prepare + emit in one idempotent-friendly call for confirm/retail. */
    async integrateConfirmedOrder(salesOrderId: string) {
        const enriched = await this.enrichOrderForMmIntegration(salesOrderId)
        if (!enriched) return { integrated: false, order: null }
        const integrated = await this.emitSalesOrderConfirmedIntegration(enriched)
        return { integrated, order: enriched }
    }

    /**
     * Org company for a checkout order. Resolved from the Organization setup
     * (code AGCTEK by default) and validated to exist — checkout is blocked
     * with a clear error when no company is configured instead of silently
     * recording an order without one.
     */
    async resolveCheckoutCompanyId(): Promise<string> {
        return this.fulfillmentDetermination.defaultCompanyId()
    }

    isMmLinked(
        order: {
            companyId: string | null
            warehouseId: string | null
            lines: Array<{ materialId: string | null; baseQuantity?: Decimal | null }>
        },
    ) {
        return (
            !!order.companyId &&
            !!order.warehouseId &&
            order.lines.some((l) => !!l.materialId) &&
            order.lines
                .filter((l) => !!l.materialId)
                .every((l) => l.baseQuantity != null)
        )
    }

    toEventPayload(order: {
        id: string
        orderNumber: string
        companyId: string | null
        warehouseId: string | null
        customerId: string
        correlationId: string
        idempotencyKey: string | null
        lines: Array<{
            id: string
            lineNumber: number
            materialId: string | null
            quantity: Decimal
            baseQuantity: Decimal | null
        }>
    }) {
        return {
            salesOrderId: order.id,
            orderNumber: order.orderNumber,
            companyId: order.companyId,
            warehouseId: order.warehouseId,
            customerId: order.customerId,
            correlationId: order.correlationId,
            idempotencyKey: order.idempotencyKey,
            lines: order.lines
                .filter((line) => line.materialId)
                .map((line) => ({
                    lineId: line.id,
                    lineNumber: line.lineNumber,
                    materialId: line.materialId,
                    quantity: (line.baseQuantity ?? line.quantity).toString(),
                    demandReferenceLineId: line.id,
                })),
        }
    }
}
