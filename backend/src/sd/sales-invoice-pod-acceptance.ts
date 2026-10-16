import { Decimal } from '@prisma/client/runtime/library'
import type { Prisma, PrismaClient } from '@prisma/client'

type Client = PrismaClient | Prisma.TransactionClient

export type PodAcceptedInvoiceLine = {
    salesOrderLineId: string
    acceptedQuantity: number
    shippedQuantity: number
}

export type PodInvoiceAcceptance = {
    /** Stop-level COD due after partial accept; null when not recorded. */
    codAmountDue: number | null
    lines: PodAcceptedInvoiceLine[]
}

/**
 * Load POD acceptance for a sales order (TripStop.codAmountDue + TripStopLine.acceptedQuantity).
 * Returns null when nothing was recorded (full deliver — invoice stays as created at GI).
 */
export async function loadPodAcceptanceForOrder(
    client: Client,
    salesOrderId: string,
): Promise<PodInvoiceAcceptance | null> {
    const shipments = await client.shipment.findMany({
        where: {
            status: 'DELIVERED',
            package: { salesOrderId },
        },
        select: {
            id: true,
            lines: {
                select: {
                    id: true,
                    quantity: true,
                    packageItemId: true,
                },
            },
        },
    })
    if (!shipments.length) return null

    const shipmentIds = shipments.map((s) => s.id)
    const stopLinks = await client.tripStopShipment.findMany({
        where: { shipmentId: { in: shipmentIds }, action: 'DROPOFF' },
        select: {
            shipmentId: true,
            tripStop: {
                select: {
                    codAmountDue: true,
                    lines: {
                        select: {
                            shipmentLineId: true,
                            acceptedQuantity: true,
                        },
                    },
                },
            },
        },
    })
    if (!stopLinks.length) return null

    let codAmountDue: number | null = null
    const acceptedByShipmentLine = new Map<string, number>()
    let anyRecorded = false

    for (const link of stopLinks) {
        const stop = link.tripStop
        if (stop.codAmountDue != null) {
            const due = Number(stop.codAmountDue)
            if (Number.isFinite(due)) {
                codAmountDue = due
                anyRecorded = true
            }
        }
        for (const row of stop.lines) {
            if (row.acceptedQuantity == null) continue
            anyRecorded = true
            acceptedByShipmentLine.set(row.shipmentLineId, row.acceptedQuantity)
        }
    }

    if (!anyRecorded) return null

    const shipmentLines = shipments.flatMap((s) => s.lines)
    const resolved: PodAcceptedInvoiceLine[] = []

    for (const line of shipmentLines) {
        const accepted =
            acceptedByShipmentLine.get(line.id) ?? line.quantity
        const salesOrderLineId = await resolveSalesOrderLineId(
            client,
            salesOrderId,
            line.packageItemId,
        )
        if (!salesOrderLineId) continue
        resolved.push({
            salesOrderLineId,
            acceptedQuantity: accepted,
            shippedQuantity: line.quantity,
        })
    }

    if (!resolved.length && codAmountDue == null) return null

    const partial = resolved.some((l) => l.acceptedQuantity < l.shippedQuantity)
    if (!partial && codAmountDue == null) return null

    return { codAmountDue, lines: resolved }
}

export function isPartialPodAcceptance(acceptance: PodInvoiceAcceptance): boolean {
    if (acceptance.lines.some((l) => l.acceptedQuantity < l.shippedQuantity)) {
        return true
    }
    return acceptance.codAmountDue != null
}

/**
 * Same reservation-chain resolution as damage-report handoff:
 * package item → material → MM reservation line → SdSalesOrderLine.
 */
async function resolveSalesOrderLineId(
    client: Client,
    salesOrderId: string,
    packageItemId: string | null,
): Promise<string | null> {
    if (!packageItemId) return null
    const item = await client.wmPackageItem.findUnique({
        where: { id: packageItemId },
        select: { materialId: true },
    })
    if (!item?.materialId) return null

    const header = await client.mmInventoryReservationHeader.findFirst({
        where: {
            sourceModule: 'SD',
            sourceDocumentType: 'SALES_ORDER',
            sourceDocumentId: salesOrderId,
        },
        select: { id: true },
    })
    if (!header) return null

    const reservationLines = await client.mmInventoryReservationLine.findMany({
        where: { headerId: header.id, materialId: item.materialId },
        select: { demandReferenceLineId: true },
    })
    const orderLineIds = [
        ...new Set(
            reservationLines
                .map((l) => l.demandReferenceLineId)
                .filter((id): id is string => !!id),
        ),
    ]
    return orderLineIds.length === 1 ? orderLineIds[0] : null
}

/** Money helpers for invoice rewrite. */
export const money = {
    mul(qty: number | Decimal, price: number | Decimal): Decimal {
        return new Decimal(qty.toString()).mul(price.toString()).toDecimalPlaces(2)
    },
    sum(values: Decimal[]): Decimal {
        return values
            .reduce((a, b) => a.plus(b), new Decimal(0))
            .toDecimalPlaces(2)
    },
}
