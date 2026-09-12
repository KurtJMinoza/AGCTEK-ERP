export type VarianceType =
    | 'UNDER_RECEIPT'
    | 'OVER_RECEIPT'
    | 'DAMAGED'
    | 'UNEXPECTED_ITEM'
    | 'BATCH_MISMATCH'
    | 'SERIAL_MISMATCH'
    | 'UOM_MISMATCH'

export type DetectedVariance = {
    varianceType: VarianceType
    quantity: number
    description: string
}

export function appendDiscrepancyFlag(existing: string | null, flag: string): string {
    if (!existing) return flag
    const parts = existing.split(',')
    if (parts.includes(flag)) return existing
    return `${existing},${flag}`
}

export function varianceFlagsToDiscrepancy(variances: DetectedVariance[]): string | undefined {
    const map: Record<VarianceType, string> = {
        UNDER_RECEIPT: 'SHORTAGE',
        OVER_RECEIPT: 'OVERAGE',
        DAMAGED: 'DAMAGE',
        UNEXPECTED_ITEM: 'WRONG_MATERIAL',
        BATCH_MISMATCH: 'WRONG_BATCH',
        SERIAL_MISMATCH: 'WRONG_SERIAL',
        UOM_MISMATCH: 'UOM_MISMATCH',
    }
    let flag: string | null = null
    for (const v of variances) {
        flag = appendDiscrepancyFlag(flag, map[v.varianceType] ?? v.varianceType)
    }
    return flag ?? undefined
}
