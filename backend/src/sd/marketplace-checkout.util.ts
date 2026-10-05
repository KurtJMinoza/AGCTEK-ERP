/**
 * Splits a mixed marketplace cart into one group per selling division, keeping
 * the cart order of lines within each group and of divisions (first seen first).
 */
export function groupLinesByDivision<T extends { divisionId: string }>(
    lines: readonly T[],
): Map<T['divisionId'], T[]> {
    const groups = new Map<T['divisionId'], T[]>()
    for (const line of lines) {
        const group = groups.get(line.divisionId)
        if (group) group.push(line)
        else groups.set(line.divisionId, [line])
    }
    return groups
}
