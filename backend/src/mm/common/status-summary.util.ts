/**
 * Shared read-side aggregation for MM list endpoints.
 *
 * The Inventory Management pages show summary tiles above their tables. Those
 * tiles must be backed by the database, never by counts derived from the
 * current page of rows in the browser, so every list endpoint can answer
 * "how many of each status are in scope?".
 */

export type StatusCount = {
    status: string
    count: number
}

/**
 * Turns a Prisma `groupBy` result on `status` into the shared summary shape.
 *
 * @example
 *   const summary = toStatusCounts(
 *       await this.prisma.mmGoodsIssue.groupBy({
 *           by: ['status'],
 *           where,
 *           _count: { _all: true },
 *       }),
 *   )
 */
export const toStatusCounts = (
    rows: { status: string; _count: { _all: number } }[],
): StatusCount[] =>
    rows
        .map((r) => ({ status: r.status, count: r._count._all }))
        .sort((a, b) => a.status.localeCompare(b.status))
