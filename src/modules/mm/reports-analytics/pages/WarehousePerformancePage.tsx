'use client'

import AdaptiveCard from '@/components/shared/AdaptiveCard'
import { AnalyticsReportPage } from './AnalyticsReportShell'

const Stat = ({ label, value }: { label: string; value: string | number }) => (
    <AdaptiveCard className="p-4">
        <p className="text-xs uppercase text-gray-500">{label}</p>
        <p className="mt-1 text-xl font-semibold">{value}</p>
    </AdaptiveCard>
)

const WarehousePerformancePage = () => (
    <AnalyticsReportPage
        route="/modules/mm/reports-analytics/warehouse-performance"
        title="Warehouse Performance"
        description="Receiving, putaway, picking, packing, transfers, and bin utilization"
        reportEndpoint="warehouse-performance"
        showDateRange
        render={(data) => (
            <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Stat label="GR documents" value={data?.receiving?.documentCount ?? 0} />
                    <Stat label="Qty received" value={Number(data?.receiving?.quantityReceived ?? 0).toLocaleString()} />
                    <Stat
                        label="Putaway completion"
                        value={`${((data?.putaway?.completionRate ?? 0) * 100).toFixed(1)}%`}
                    />
                    <Stat
                        label="Bin utilization"
                        value={`${data?.binUtilization?.utilizationPct ?? 0}%`}
                    />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                    <AdaptiveCard className="p-4">
                        <h6 className="mb-2 font-semibold">Putaway</h6>
                        <p className="text-sm">Open: {data?.putaway?.open ?? 0}</p>
                        <p className="text-sm">Completed: {data?.putaway?.completed ?? 0}</p>
                        <p className="text-sm">Avg hours: {data?.putaway?.avgCompletionHours ?? 0}</p>
                    </AdaptiveCard>
                    <AdaptiveCard className="p-4">
                        <h6 className="mb-2 font-semibold">Picking</h6>
                        <p className="text-sm">Open: {data?.picking?.open ?? 0}</p>
                        <p className="text-sm">Completed: {data?.picking?.completed ?? 0}</p>
                        <p className="text-sm">Avg hours: {data?.picking?.avgCompletionHours ?? 0}</p>
                    </AdaptiveCard>
                    <AdaptiveCard className="p-4">
                        <h6 className="mb-2 font-semibold">Packing</h6>
                        <p className="text-sm">Open: {data?.packing?.open ?? 0}</p>
                        <p className="text-sm">Completed: {data?.packing?.completed ?? 0}</p>
                        <p className="text-sm">
                            Rate: {((data?.packing?.completionRate ?? 0) * 100).toFixed(1)}%
                        </p>
                    </AdaptiveCard>
                </div>
                <AdaptiveCard className="p-4">
                    <h6 className="mb-2 font-semibold">Transfers</h6>
                    <p className="text-sm">Bin transfers: {data?.transfers?.binTransferCount ?? 0}</p>
                    <p className="text-sm">
                        Warehouse transfers: {data?.transfers?.warehouseTransferCount ?? 0}
                    </p>
                </AdaptiveCard>
            </div>
        )}
    />
)

export default WarehousePerformancePage
