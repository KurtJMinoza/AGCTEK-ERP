'use client'

import { AnalyticsReportPage, DataTable } from './AnalyticsReportShell'

const ProcurementAnalyticsPage = () => (
    <AnalyticsReportPage
        route="/modules/mm/reports-analytics/procurement-analytics"
        title="Procurement Analytics"
        description="Purchase spend, PO volume, lead time, and price trends"
        reportEndpoint="procurement"
        showDateRange
        showWarehouse={false}
        render={(data) => (
            <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-3 text-sm">
                    <div>PO count: {data?.poCount ?? 0}</div>
                    <div>Total spend: {Number(data?.totalSpend ?? 0).toLocaleString()}</div>
                    <div>Avg lead days: {data?.avgLeadDays ?? 0}</div>
                </div>
                <div>
                    <h6 className="mb-2 font-semibold">By Supplier</h6>
                    <DataTable
                        columns={[
                            { header: 'Supplier', accessorKey: 'name' },
                            { header: 'Code', accessorKey: 'code' },
                            { header: 'Amount', accessorKey: 'amount' },
                        ]}
                        data={data?.bySupplier ?? []}
                    />
                </div>
                <div>
                    <h6 className="mb-2 font-semibold">By Category</h6>
                    <DataTable
                        columns={[
                            { header: 'Category', accessorKey: 'name' },
                            { header: 'Amount', accessorKey: 'amount' },
                        ]}
                        data={data?.byCategory ?? []}
                    />
                </div>
                <div>
                    <h6 className="mb-2 font-semibold">By Material</h6>
                    <DataTable
                        columns={[
                            { header: 'Material', accessorKey: 'code' },
                            { header: 'Amount', accessorKey: 'amount' },
                        ]}
                        data={data?.byMaterial ?? []}
                    />
                </div>
            </div>
        )}
    />
)

export default ProcurementAnalyticsPage
