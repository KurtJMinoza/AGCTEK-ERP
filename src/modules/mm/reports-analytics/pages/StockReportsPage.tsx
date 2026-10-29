'use client'

import { useEffect, useMemo, useState } from 'react'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import { AnalyticsReportPage } from './AnalyticsReportShell'
import StockReportsContent, {
    type StockGroupBy,
} from '../components/StockReportsContent'

const GROUP_BY_OPTIONS: { value: StockGroupBy; label: string }[] = [
    { value: 'material', label: 'Material' },
    { value: 'category', label: 'Category' },
    { value: 'warehouse', label: 'Warehouse' },
    { value: 'bin', label: 'Storage bin' },
    { value: 'batch', label: 'Batch' },
    { value: 'serial', label: 'Serial number' },
    { value: 'status', label: 'Stock status' },
]

const PAGE_SIZE = 25

const StockReportsPage = () => {
    const [groupBy, setGroupBy] = useState<StockGroupBy>('material')
    const [page, setPage] = useState(1)

    useEffect(() => {
        setPage(1)
    }, [groupBy])

    const extraParams = useMemo(
        () => ({ groupBy, page, limit: PAGE_SIZE }),
        [groupBy, page],
    )

    const selectedGroup = GROUP_BY_OPTIONS.find((o) => o.value === groupBy)

    return (
        <AnalyticsReportPage
            route="/modules/mm/reports-analytics/stock-reports"
            title="Stock Reports"
            description="On-hand balances by material, warehouse, bin, batch, serial, and status"
            reportEndpoint="stock"
            extraParams={extraParams}
            filterExtensions={
                <FormItem label="Group by">
                    <Select
                        options={GROUP_BY_OPTIONS}
                        value={selectedGroup}
                        onChange={(o: { value: StockGroupBy } | null) => {
                            if (o?.value) setGroupBy(o.value)
                        }}
                    />
                </FormItem>
            }
            render={(data, ctx) => (
                <StockReportsContent
                    data={data}
                    loading={ctx?.loading ?? false}
                    groupBy={groupBy}
                    page={page}
                    limit={PAGE_SIZE}
                    onPageChange={setPage}
                />
            )}
        />
    )
}

export default StockReportsPage
