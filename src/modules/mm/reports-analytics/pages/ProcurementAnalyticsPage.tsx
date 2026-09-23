'use client'

import { useState } from 'react'
import Tabs from '@/components/ui/Tabs'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import { AnalyticsReportPage, DataTable } from './AnalyticsReportShell'

type SpendTab = 'supplier' | 'category' | 'material'

const { TabList, TabNav, TabContent } = Tabs

const ProcurementAnalyticsTables = ({ data }: { data: any }) => {
    const [tab, setTab] = useState<SpendTab>('supplier')

    return (
        <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3 text-sm">
                <div>PO count: {data?.poCount ?? 0}</div>
                <div>Total spend: {Number(data?.totalSpend ?? 0).toLocaleString()}</div>
                <div>Avg lead days: {data?.avgLeadDays ?? 0}</div>
            </div>
            <AdaptiveCard>
                <Tabs value={tab} onChange={(v) => setTab(v as SpendTab)}>
                    <TabList>
                        <TabNav value="supplier">By supplier</TabNav>
                        <TabNav value="category">By category</TabNav>
                        <TabNav value="material">By material</TabNav>
                    </TabList>
                    <div className="mt-4">
                        <TabContent value="supplier">
                            <DataTable
                                columns={[
                                    { header: 'Supplier', accessorKey: 'name' },
                                    { header: 'Code', accessorKey: 'code' },
                                    { header: 'Amount', accessorKey: 'amount' },
                                ]}
                                data={data?.bySupplier ?? []}
                            />
                        </TabContent>
                        <TabContent value="category">
                            <DataTable
                                columns={[
                                    { header: 'Category', accessorKey: 'name' },
                                    { header: 'Amount', accessorKey: 'amount' },
                                ]}
                                data={data?.byCategory ?? []}
                            />
                        </TabContent>
                        <TabContent value="material">
                            <DataTable
                                columns={[
                                    { header: 'Material', accessorKey: 'code' },
                                    { header: 'Amount', accessorKey: 'amount' },
                                ]}
                                data={data?.byMaterial ?? []}
                            />
                        </TabContent>
                    </div>
                </Tabs>
            </AdaptiveCard>
        </div>
    )
}

const ProcurementAnalyticsPage = () => (
    <AnalyticsReportPage
        route="/modules/mm/reports-analytics/procurement-analytics"
        title="Procurement Analytics"
        description="Purchase spend, PO volume, lead time, and price trends"
        reportEndpoint="procurement"
        showDateRange
        showWarehouse={false}
        render={(data) => <ProcurementAnalyticsTables data={data} />}
    />
)

export default ProcurementAnalyticsPage
