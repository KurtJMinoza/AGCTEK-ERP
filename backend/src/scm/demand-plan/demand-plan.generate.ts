export const GENERATION_METHODS = ['MOVING_AVERAGE'] as const
export type GenerationMethod = (typeof GENERATION_METHODS)[number]
export const MOVING_AVERAGE_WINDOWS = [4, 12] as const
export type MovingAverageWindow = (typeof MOVING_AVERAGE_WINDOWS)[number]

/**
 * Simple moving average over the last `window` complete periods, already
 * aggregated to the plan bucket. Periods before the first actual are ignored
 * (new item); gaps after it count as zero sales. Null when there is no history.
 */
export function movingAverage(
    history: Array<number | null>,
    window: number,
): number | null {
    const last = history.slice(-window)
    const first = last.findIndex((v) => v != null)
    if (first < 0) return null
    const used = last.slice(first)
    return used.reduce<number>((s, v) => s + (v ?? 0), 0) / used.length
}

/**
 * Splits a bucket total into `parts` whole-unit weekly quantities that sum exactly
 * to the rounded total (largest remainder; earlier weeks take the extra units).
 */
export function splitAcrossWeeks(total: number, parts: number): number[] {
    if (parts <= 0) return []
    const units = Math.max(0, Math.round(total))
    const base = Math.floor(units / parts)
    const extra = units - base * parts
    return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0))
}
