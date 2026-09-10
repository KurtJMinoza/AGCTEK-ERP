'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Select from '@/components/ui/Select'
import Card from '@/components/ui/Card'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { planningService } from '../services/planningService'
import { warehouseService } from '../../warehouse/services/warehouseService'
import { orgService } from '../../material-master/services/referenceService'
import type { MaterialRequirement, PlanningDashboard } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/planning-mrp/shortage-monitor'
type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const ShortageMonitorPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<MaterialRequirement[]>([])
    const [dash, setDash] = useState<PlanningDashboard | null>(null)
    const [loading, setLoading] = useState(true)
    const [companies, setCompanies] = useState<Opt[]>([])
    const [warehouses, setWarehouses] = useState<Opt[]>([])
    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')

    useEffect(() => {
        Promise.all([
            orgService.companies(),
            warehouseService.list({ limit: 200 }),
        ]).then(([cos, wh]: any[]) => {
            const c = (Array.isArray(cos) ? cos : cos?.data ?? []).map(
                (x: any) => ({ value: x.id, label: x.name || x.code }),
            )
            setCompanies(c)
            setWarehouses(
                (wh?.data ?? []).map((x: any) => ({
                    value: x.id,
                    label: `${x.code} — ${x.name}`,
                })),
            )
            if (c[0]) setCompanyId(c[0].value)
        })
    }, [])

    const load = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        try {
            const [req, dashboard] = await Promise.all([
                planningService.listRequirements({
                    companyId,
                    warehouseId: warehouseId || undefined,
                    shortage: true,
                    limit: 100,
                }),
                planningService.dashboard({
                    companyId,
                    warehouseId: warehouseId || undefined,
                }),
            ])
            setRows(req.data)
            setDash(dashboard)
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Load failed')
        } finally {
            setLoading(false)
        }
    }, [companyId, warehouseId])

    useEffect(() => {
        load()
    }, [load])

    const columns: ColumnDef<MaterialRequirement>[] = useMemo(
        () => [
            {
                header: 'Material',
                cell: ({ row }) => row.original.material?.materialCode ?? '—',
            },
            {
                header: 'Warehouse',
                cell: ({ row }) => row.original.warehouse?.code ?? '—',
            },
            {
                header: 'Available',
                cell: ({ row }) => Number(row.original.availableQty),
            },
            {
                header: 'Demand',
                cell: ({ row }) => Number(row.original.demandQty),
            },
            {
                header: 'Incoming',
                cell: ({ row }) => Number(row.original.incomingQty),
            },
            {
                header: 'Net req',
                cell: ({ row }) => Number(row.original.netRequirement),
            },
            {
                header: 'Stockout',
                cell: ({ row }) =>
                    row.original.projectedStockoutDate
                        ? String(row.original.projectedStockoutDate).slice(0, 10)
                        : '—',
            },
            {
                header: 'Status',
                cell: () => <StatusBadge status="SHORTAGE" />,
            },
        ],
        [],
    )

    const s = dash?.summary

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Shortage Monitor"
                description="Materials with net requirement or below safety stock"
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                    { label: 'Shortages', value: s?.shortages ?? rows.length },
                    { label: 'Below ROP', value: s?.belowReorderPoint ?? 0 },
                    { label: 'Overdue inbound', value: s?.overdueInbound ?? 0 },
                    {
                        label: 'Open suggestions',
                        value: s?.openSuggestions ?? 0,
                    },
                ].map((c) => (
                    <Card key={c.label} className="p-4">
                        <div className="text-xs text-gray-500">{c.label}</div>
                        <div className="text-2xl font-semibold">{c.value}</div>
                    </Card>
                ))}
            </div>
            <AdaptiveCard className="mb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormItem label="Company">
                        <Select
                            options={companies}
                            value={companies.find((o) => o.value === companyId)}
                            onChange={(o: any) => setCompanyId(o?.value || '')}
                        />
                    </FormItem>
                    <FormItem label="Warehouse">
                        <Select
                            isClearable
                            options={warehouses}
                            value={
                                warehouses.find((o) => o.value === warehouseId) ||
                                null
                            }
                            onChange={(o: any) => setWarehouseId(o?.value || '')}
                        />
                    </FormItem>
                </div>
            </AdaptiveCard>
            <AdaptiveCard>
                <DataTable columns={columns} data={rows} loading={loading} />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default ShortageMonitorPage
