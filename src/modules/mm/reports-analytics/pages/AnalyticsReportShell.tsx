'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import Chart from '@/components/shared/Chart'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import { orgService } from '../../material-master/services/referenceService'
import {
    fetchReport,
    type ReportEndpoint,
    type ReportParams,
} from '../services/reportsAnalyticsService'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

type Props = {
    route: string
    title: string
    description: string
    reportEndpoint: ReportEndpoint
    showWarehouse?: boolean
    showDateRange?: boolean
    showDeadStockDays?: boolean
    showAgingBuckets?: boolean
    extraParams?: Partial<ReportParams>
    render: (data: any) => ReactNode
}

type Opt = { value: string; label: string }

export function AnalyticsReportPage({
    route,
    title,
    description,
    reportEndpoint,
    showWarehouse = true,
    showDateRange = false,
    showDeadStockDays = false,
    showAgingBuckets = false,
    extraParams,
    render,
}: Props) {
    const breadcrumbItems = buildErpBreadcrumbs(route)
    const [companies, setCompanies] = useState<Opt[]>([])
    const [warehouses, setWarehouses] = useState<Opt[]>([])
    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [deadStockDays, setDeadStockDays] = useState('90')
    const [agingBuckets, setAgingBuckets] = useState('0-30|31-60|61-90|90+')
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        orgService.companies().then((cos: any) => {
            const c = (Array.isArray(cos) ? cos : cos?.data ?? []).map((x: any) => ({
                value: x.id,
                label: x.name || x.code,
            }))
            setCompanies(c)
            if (c[0]) setCompanyId(c[0].value)
        })
    }, [])

    useEffect(() => {
        if (!companyId) return
        orgService
            .warehouses(companyId)
            .then((list: any) => {
                const w = (Array.isArray(list) ? list : []).map((x: any) => ({
                    value: x.id,
                    label: x.name || x.code,
                }))
                setWarehouses(w)
            })
            .catch(() => setWarehouses([]))
    }, [companyId])

    const params = useMemo<ReportParams>(
        () => ({
            companyId,
            ...(warehouseId ? { warehouseId } : {}),
            ...(dateFrom ? { dateFrom } : {}),
            ...(dateTo ? { dateTo } : {}),
            ...(showDeadStockDays && deadStockDays
                ? { deadStockDays: Number(deadStockDays) }
                : {}),
            ...(showAgingBuckets && agingBuckets ? { agingBuckets } : {}),
            ...extraParams,
        }),
        [
            companyId,
            warehouseId,
            dateFrom,
            dateTo,
            deadStockDays,
            agingBuckets,
            showDeadStockDays,
            showAgingBuckets,
            extraParams,
        ],
    )

    const load = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        try {
            setData(await fetchReport(reportEndpoint, params))
        } finally {
            setLoading(false)
        }
    }, [companyId, reportEndpoint, params])

    useEffect(() => {
        load()
    }, [load])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title={title}
                description={description}
                actions={
                    <Button loading={loading} onClick={load}>
                        Refresh
                    </Button>
                }
            />
            <AdaptiveCard className="mb-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <FormItem label="Company">
                        <Select
                            options={companies}
                            value={companies.find((o) => o.value === companyId)}
                            onChange={(o: any) => {
                                setCompanyId(o?.value ?? '')
                                setWarehouseId('')
                            }}
                        />
                    </FormItem>
                    {showWarehouse && (
                        <FormItem label="Warehouse">
                            <Select
                                isClearable
                                placeholder="All warehouses"
                                options={warehouses}
                                value={
                                    warehouseId
                                        ? warehouses.find((o) => o.value === warehouseId)
                                        : null
                                }
                                onChange={(o: any) => setWarehouseId(o?.value ?? '')}
                            />
                        </FormItem>
                    )}
                    {showDateRange && (
                        <>
                            <FormItem label="From">
                                <Input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                />
                            </FormItem>
                            <FormItem label="To">
                                <Input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                />
                            </FormItem>
                        </>
                    )}
                    {showDeadStockDays && (
                        <FormItem label="Dead stock days">
                            <Input
                                type="number"
                                min={1}
                                value={deadStockDays}
                                onChange={(e) => setDeadStockDays(e.target.value)}
                            />
                        </FormItem>
                    )}
                    {showAgingBuckets && (
                        <FormItem label="Aging buckets">
                            <Input
                                value={agingBuckets}
                                onChange={(e) => setAgingBuckets(e.target.value)}
                                placeholder="0-30|31-60|61-90|90+"
                            />
                        </FormItem>
                    )}
                </div>
            </AdaptiveCard>
            <AdaptiveCard>{render(data)}</AdaptiveCard>
        </PageContainer>
    )
}

export { DataTable, Chart }
