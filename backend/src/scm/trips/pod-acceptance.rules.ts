import { BadRequestException } from '@nestjs/common'

/** One DROPOFF shipment line the customer accepted at POD. */
export type AcceptedLineInput = {
    shipmentLineId: string
    acceptedQuantity: number
}

export type ShipmentLineQty = {
    id: string
    shipmentId: string
    quantity: number
}

export type AcceptedLineResolved = AcceptedLineInput & {
    shippedQuantity: number
    rejectedQuantity: number
}

/**
 * Parse driver `acceptedLines`. Empty / omitted → full accept (caller treats as no partial).
 * Rejected qty = shipped − accepted; keep-damaged-and-pay-less is not expressible here.
 */
export function parseAcceptedLines(
    value: unknown,
    lines: ShipmentLineQty[],
): AcceptedLineResolved[] | null {
    if (value == null) return null
    if (!Array.isArray(value)) {
        throw new BadRequestException('acceptedLines must be an array')
    }
    if (value.length === 0) return null

    const byId = new Map(lines.map((l) => [l.id, l]))
    const seen = new Set<string>()
    const resolved: AcceptedLineResolved[] = []

    for (const raw of value) {
        if (!raw || typeof raw !== 'object') {
            throw new BadRequestException('Each acceptedLines entry must be an object')
        }
        const row = raw as Record<string, unknown>
        const shipmentLineId =
            typeof row.shipmentLineId === 'string' ? row.shipmentLineId.trim() : ''
        if (!shipmentLineId) {
            throw new BadRequestException('acceptedLines[].shipmentLineId is required')
        }
        if (seen.has(shipmentLineId)) {
            throw new BadRequestException(
                `acceptedLines lists shipmentLineId ${shipmentLineId} more than once`,
            )
        }
        seen.add(shipmentLineId)
        const line = byId.get(shipmentLineId)
        if (!line) {
            throw new BadRequestException(
                `shipmentLineId ${shipmentLineId} is not on a DROPOFF shipment at this stop`,
            )
        }
        const acceptedQuantity = Number(row.acceptedQuantity)
        if (!Number.isInteger(acceptedQuantity) || acceptedQuantity < 0) {
            throw new BadRequestException(
                'acceptedQuantity must be a non-negative integer',
            )
        }
        if (acceptedQuantity > line.quantity) {
            throw new BadRequestException(
                `acceptedQuantity ${acceptedQuantity} exceeds the line quantity (${line.quantity})`,
            )
        }
        resolved.push({
            shipmentLineId,
            acceptedQuantity,
            shippedQuantity: line.quantity,
            rejectedQuantity: line.quantity - acceptedQuantity,
        })
    }

    // Lines omitted from the payload are treated as fully accepted.
    for (const line of lines) {
        if (!seen.has(line.id)) {
            resolved.push({
                shipmentLineId: line.id,
                acceptedQuantity: line.quantity,
                shippedQuantity: line.quantity,
                rejectedQuantity: 0,
            })
        }
    }

    return resolved
}

export function hasPartialReject(lines: AcceptedLineResolved[]): boolean {
    return lines.some((l) => l.rejectedQuantity > 0)
}

export function hasAnyAccept(lines: AcceptedLineResolved[]): boolean {
    return lines.some((l) => l.acceptedQuantity > 0)
}

/** Proportional COD due from full payment amount (includes shipping share). */
export function proportionalCodDue(
    fullAmountDue: number,
    lines: AcceptedLineResolved[],
): number {
    const shipped = lines.reduce((n, l) => n + l.shippedQuantity, 0)
    const accepted = lines.reduce((n, l) => n + l.acceptedQuantity, 0)
    if (shipped <= 0) return 0
    if (accepted <= 0) return 0
    if (accepted >= shipped) return fullAmountDue
    return Math.round((fullAmountDue * accepted * 100) / shipped) / 100
}
