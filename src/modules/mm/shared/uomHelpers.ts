export type UomCategory = 'weight' | 'dimension' | 'volume'

export type UomMeasureFamily =
    | 'count'
    | 'packaging'
    | 'weight'
    | 'volume'
    | 'length'
    | 'area'
    | 'time'

export type UomLike = {
    id?: string
    code: string
    name: string
    sortOrder?: number
    isActive?: boolean
}

export type UomCodeOption = { value: string; label: string }

export type UomIdOption = { value: string; label: string }

export type UomConversionLike = {
    fromUomId: string
    toUomId: string
}

export type GroupedUomIdOption = {
    label: string
    options: UomIdOption[]
}

/** UOM codes grouped by physical attribute (matches seed catalog). */
export const UOM_CODE_GROUPS: Record<UomCategory, readonly string[]> = {
    weight: ['MG', 'G', 'KG', 'TON', 'LB', 'OZ'],
    dimension: ['MM', 'CM', 'M', 'KM', 'IN', 'FT', 'YD'],
    volume: ['ML', 'L', 'GAL', 'QT', 'PT', 'CBM'],
}

/** Inventory / transactional UOM families for base-unit selection. */
export const UOM_MEASURE_FAMILIES: Record<
    UomMeasureFamily,
    { label: string; codes: readonly string[] }
> = {
    count: { label: 'Count / discrete', codes: ['PCS', 'EA', 'DZ', 'GRO', 'PR', 'SET'] },
    packaging: {
        label: 'Packaging',
        codes: ['BOX', 'CTN', 'CASE', 'PAL', 'BAG', 'BTL', 'CAN', 'DRM', 'PACK', 'ROLL', 'BDL', 'REAM'],
    },
    weight: { label: 'Weight', codes: ['MG', 'G', 'KG', 'TON', 'LB', 'OZ'] },
    volume: { label: 'Volume', codes: ['ML', 'L', 'GAL', 'QT', 'PT', 'CBM'] },
    length: { label: 'Length', codes: ['MM', 'CM', 'M', 'KM', 'IN', 'FT', 'YD'] },
    area: { label: 'Area', codes: ['SQM', 'SQFT'] },
    time: { label: 'Time', codes: ['HR', 'DAY', 'WK', 'MO'] },
}

const FAMILY_ORDER: UomMeasureFamily[] = [
    'count',
    'packaging',
    'weight',
    'volume',
    'length',
    'area',
    'time',
]

export const UOM_SELECT_PORTAL = {
    menuPortalTarget: typeof document !== 'undefined' ? document.body : undefined,
    menuPosition: 'fixed' as const,
    styles: {
        menuPortal: (base: Record<string, unknown>) => ({ ...base, zIndex: 9999 }),
    },
}

export function getUomMeasureFamily(code: string): UomMeasureFamily | null {
    const upper = code.toUpperCase()
    for (const family of FAMILY_ORDER) {
        if (UOM_MEASURE_FAMILIES[family].codes.includes(upper)) {
            return family
        }
    }
    return null
}

/** UOM ids reachable from base via global conversion rules (bidirectional). */
export function getConvertibleUomIds(
    baseUomId: string,
    conversions: UomConversionLike[],
): Set<string> {
    const graph = new Map<string, Set<string>>()
    const addEdge = (from: string, to: string) => {
        if (!graph.has(from)) graph.set(from, new Set())
        graph.get(from)!.add(to)
    }

    for (const c of conversions) {
        addEdge(c.fromUomId, c.toUomId)
        addEdge(c.toUomId, c.fromUomId)
    }

    const reachable = new Set<string>([baseUomId])
    const queue = [baseUomId]
    while (queue.length > 0) {
        const current = queue.shift()!
        for (const next of graph.get(current) ?? []) {
            if (!reachable.has(next)) {
                reachable.add(next)
                queue.push(next)
            }
        }
    }

    return reachable
}

export function buildGroupedBaseUomOptions(uoms: UomLike[]): GroupedUomIdOption[] {
    const active = uoms.filter((u) => u.isActive !== false && u.id)
    const groups = new Map<UomMeasureFamily | 'other', UomIdOption[]>()

    for (const uom of active) {
        const family = getUomMeasureFamily(uom.code) ?? 'other'
        const option = { value: uom.id!, label: `${uom.code} — ${uom.name}` }
        const bucket = groups.get(family) ?? []
        bucket.push(option)
        groups.set(family, bucket)
    }

    const result: GroupedUomIdOption[] = []
    for (const family of FAMILY_ORDER) {
        const options = groups.get(family)
        if (!options?.length) continue
        options.sort((a, b) => a.label.localeCompare(b.label))
        result.push({ label: UOM_MEASURE_FAMILIES[family].label, options })
    }

    const other = groups.get('other')
    if (other?.length) {
        other.sort((a, b) => a.label.localeCompare(b.label))
        result.push({ label: 'Other', options: other })
    }

    return result
}

/** Purchase / sales UOMs: convertible to base, excluding base itself. */
export function buildAlternateUomOptions(
    uoms: UomLike[],
    baseUomId: string,
    conversions: UomConversionLike[],
    keepIds: string[] = [],
): UomIdOption[] {
    if (!baseUomId) return []

    const allowed = getConvertibleUomIds(baseUomId, conversions)
    const keep = new Set(keepIds.filter(Boolean))

    return uoms
        .filter((u) => {
            if (!u.id || u.isActive === false) return false
            if (u.id === baseUomId) return false
            return allowed.has(u.id) || keep.has(u.id)
        })
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((u) => ({ value: u.id!, label: `${u.code} — ${u.name}` }))
}

export function buildUomCodeOptions(
    uoms: UomLike[],
    category: UomCategory,
    currentValue?: string,
): UomCodeOption[] {
    const allowed = new Set(UOM_CODE_GROUPS[category].map((c) => c.toUpperCase()))
    const current = currentValue?.trim().toUpperCase()

    const filtered = uoms.filter((u) => {
        if (u.isActive === false) return false
        const code = u.code.toUpperCase()
        return allowed.has(code) || (current !== undefined && current !== '' && code === current)
    })

    filtered.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

    return filtered.map((u) => ({
        value: u.code,
        label: `${u.code} — ${u.name}`,
    }))
}
