'use client'

import { useCallback, useEffect, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Input from '@/components/ui/Input'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { inventoryControlService } from '../services/inventoryControlService'

const ROUTE = '/modules/mm/inventory-control/inventory-control-dashboard'

const Metric = ({ label, value }: { label: string; value: string | number }) => (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="text-sm text-gray-500">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
)

const InventoryControlDashboardPage = () => {
    const [companyId, setCompanyId] = useState('')
    const [metrics, setMetrics] = useState<any>(null)
    const [loading, setLoading] = useState(false)

    const load = useCallback(async () => {
        if (!companyId.trim()) return
        setLoading(true)
        try {
            setMetrics(await inventoryControlService.getDashboard(companyId.trim()))
        } finally {
            setLoading(false)
        }
    }, [companyId])

    useEffect(() => {
        load()
    }, [load])

    return (
        <PageContainer>
            <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
            <PageHeader
                title="Inventory Control Dashboard"
                description="Count compliance, variances, and adjustment pipeline — sourced from official MM count engine data."
            />
            <AdaptiveCard>
                <Input
                    className="mb-6 max-w-md"
                    placeholder="Company ID"
                    value={companyId}
                    onChange={(e: any) => setCompanyId(e.target.value)}
                />
                {loading && <p className="text-sm text-gray-500">Loading…</p>}
                {metrics && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <Metric
                            label="Inventory accuracy"
                            value={
                                metrics.inventoryAccuracyPercent != null
                                    ? `${metrics.inventoryAccuracyPercent}%`
                                    : '—'
                            }
                        />
                        <Metric label="Active count sessions" value={metrics.activeCountSessions} />
                        <Metric label="Open variances" value={metrics.openVariances} />
                        <Metric
                            label="Pending warehouse approvals"
                            value={metrics.pendingWarehouseApprovals}
                        />
                        <Metric
                            label="Pending finance approvals"
                            value={metrics.pendingFinanceApprovals}
                        />
                        <Metric label="Posted adjustments" value={metrics.postedAdjustments} />
                        <Metric
                            label="Open variance value"
                            value={metrics.openVarianceValue?.toFixed?.(2) ?? metrics.openVarianceValue}
                        />
                    </div>
                )}
            </AdaptiveCard>
        </PageContainer>
    )
}

export default InventoryControlDashboardPage
