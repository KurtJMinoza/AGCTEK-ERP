import type { Shipment } from '../types'
import { sumQty } from './capacity'

export type LoadPlanStopPreview = {
    key: string
    kind: 'pickup' | 'deliver'
    name: string
    address: string
    lat: number | null
    lng: number | null
    windowStart: string | null
    windowEnd: string | null
    shipmentIds: string[]
    quantity: number
    missingWindow: boolean
}

/**
 * Client-side preview of stop sequence for Step 3.3–3.5 review
 * (mirrors server buildAssignStops grouping by ship-to).
 */
export function buildLoadPlanPreview(
    shipments: Shipment[],
    deliverOrderKeys?: string[],
): LoadPlanStopPreview[] {
    if (shipments.length === 0) return []

    const destGroups = new Map<string, Shipment[]>()
    for (const shipment of shipments) {
        const key = shipment.destAddress.trim().toLowerCase()
        const group = destGroups.get(key) ?? []
        group.push(shipment)
        destGroups.set(key, group)
    }

    const normalized = (deliverOrderKeys ?? []).map((key) =>
        key.trim().toLowerCase(),
    )
    const orderedKeys =
        normalized.length > 0
            ? [
                  ...normalized.filter((key) => destGroups.has(key)),
                  ...[...destGroups.keys()].filter(
                      (key) => !normalized.includes(key),
                  ),
              ]
            : [...destGroups.keys()]

    const stops: LoadPlanStopPreview[] = []
    const origin = shipments.find((s) => s.originAddress?.trim()) ?? shipments[0]
    const originAddress = origin.originAddress?.trim() ?? ''

    if (originAddress) {
        stops.push({
            key: `pickup:${originAddress.toLowerCase()}`,
            kind: 'pickup',
            name: 'Pickup',
            address: originAddress,
            lat: origin.originLat,
            lng: origin.originLng,
            windowStart: null,
            windowEnd: null,
            shipmentIds: shipments.map((s) => s.id),
            quantity: sumQty(shipments),
            missingWindow: false,
        })
    }

    for (const key of orderedKeys) {
        const group = destGroups.get(key)
        if (!group?.length) continue
        const dest = group[0]
        const starts = group
            .map((s) => s.earliestDeliveryAt)
            .filter((d): d is string => Boolean(d))
        const ends = group
            .map((s) => s.latestDeliveryAt)
            .filter((d): d is string => Boolean(d))
        const windowStart =
            starts.length > 0
                ? starts.reduce((a, b) => (a < b ? a : b))
                : null
        const windowEnd =
            ends.length > 0 ? ends.reduce((a, b) => (a > b ? a : b)) : null

        stops.push({
            key,
            kind: 'deliver',
            name: dest.customerName
                ? `Deliver · ${dest.customerName}`
                : 'Deliver',
            address: dest.destAddress,
            lat: dest.destLat,
            lng: dest.destLng,
            windowStart,
            windowEnd,
            shipmentIds: group.map((s) => s.id),
            quantity: sumQty(group),
            missingWindow: !windowStart && !windowEnd,
        })
    }

    return stops
}

export function formatWindowRange(
    start: string | null | undefined,
    end: string | null | undefined,
): string {
    if (!start && !end) return 'No time window'
    const fmt = (value: string) => {
        try {
            return new Date(value).toLocaleString()
        } catch {
            return value
        }
    }
    if (start && end) return `${fmt(start)} → ${fmt(end)}`
    if (start) return `From ${fmt(start)}`
    return `Until ${fmt(end!)}`
}
