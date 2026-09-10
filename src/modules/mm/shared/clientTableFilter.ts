function collectSearchableValues(value: unknown, depth = 0): string[] {
    if (value == null || depth > 2) return []
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return [String(value)]
    }
    if (Array.isArray(value)) {
        return value.flatMap((item) => collectSearchableValues(item, depth + 1))
    }
    if (typeof value === 'object') {
        return Object.values(value as Record<string, unknown>).flatMap((item) =>
            collectSearchableValues(item, depth + 1),
        )
    }
    return []
}

/** Client-side table search across primitive and shallow nested row values. */
export function filterTableRows<T>(rows: T[], search: string): T[] {
    const q = search.trim().toLowerCase()
    if (!q) return rows

    return rows.filter((row) =>
        collectSearchableValues(row).some((value) => value.toLowerCase().includes(q)),
    )
}
