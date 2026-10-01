export type DemandDelta = {
    abs: number
    pct: number | null
    direction: 'up' | 'down' | 'flat'
}

const qtyFmt = (n: number) =>
    Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })

export function computeDelta(
    value: number | null | undefined,
    base: number | null | undefined,
): DemandDelta | null {
    if (value == null || base == null) return null
    const abs = value - base
    const rounded = Math.round(abs)
    return {
        abs,
        pct: base === 0 ? null : (abs / base) * 100,
        direction: rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat',
    }
}

export function deltaFromParts(abs: number, pct: number | null): DemandDelta {
    const rounded = Math.round(abs)
    return {
        abs,
        pct,
        direction: rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat',
    }
}

/**
 * Chevrons are never shown alone: always `+308 units (+23.8%) ▲` / `-185 units (-14.2%) ▼`.
 */
export function formatDelta(d: DemandDelta, unit = 'units'): string {
    const sign = d.direction === 'up' ? '+' : d.direction === 'down' ? '-' : ''
    const pct =
        d.pct == null
            ? ''
            : ` (${d.pct > 0 && d.direction === 'up' ? '+' : ''}${d.direction === 'flat' ? '0.0' : d.pct.toFixed(1)}%)`
    const chevron =
        d.direction === 'up' ? ' ▲' : d.direction === 'down' ? ' ▼' : ''
    return `${sign}${qtyFmt(d.abs)}${unit ? ` ${unit}` : ''}${pct}${chevron}`
}

export function deltaToneClass(d: DemandDelta): string {
    if (d.direction === 'up') return 'text-emerald-600'
    if (d.direction === 'down') return 'text-red-500'
    return 'text-gray-400'
}
