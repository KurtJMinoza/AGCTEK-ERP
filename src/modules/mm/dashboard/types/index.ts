export type DashboardVisibility = {
    inventory: boolean
    procurement: boolean
    warehouse: boolean
    analytics: boolean
}

export type MmDashboard = {
    filters: Record<string, unknown>
    visibility: DashboardVisibility
    analytics: {
        aging?: { buckets?: unknown[] } & Record<string, unknown>
        turnover?: { rows?: unknown[] } & Record<string, unknown>
        deadStock?: { rows?: unknown[] } & Record<string, unknown>
        movement?: { series?: unknown[] } & Record<string, unknown>
        spend?: { bySupplier?: unknown[] } & Record<string, unknown>
        suppliers?: { top?: unknown[]; bottom?: unknown[] } & Record<string, unknown>
    } | null
}
