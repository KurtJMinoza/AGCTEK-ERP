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
        aging?: Record<string, unknown>
        turnover?: Record<string, unknown>
        deadStock?: Record<string, unknown>
        movement?: Record<string, unknown>
        spend?: Record<string, unknown>
        suppliers?: Record<string, unknown>
    } | null
}
