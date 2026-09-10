'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { planningService } from '../services/planningService'
import { warehouseService } from '../../warehouse/services/warehouseService'
import { orgService } from '../../material-master/services/referenceService'
import type { MaterialRequirement, MrpRun } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/planning-mrp/material-requirements'
type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const MaterialRequirementsPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<MaterialRequirement[]>([])
    const [runs, setRuns] = useState<Opt[]>([])
    const [loading, setLoading] = useState(true)
    const [companies, setCompanies] = useState<Opt[]>([])
    const [warehouses, setWarehouses] = useState<Opt[]>([])
    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [mrpRunId, setMrpRunId] = useState('')

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

    useEffect(() => {
        if (!companyId) return
        planningService
            .listMrpRuns({ companyId, limit: 50 })
            .then((res) => {
                const opts = res.data.map((r: MrpRun) => ({
                    value: r.id,
                    label: `${r.runNumber} (${r.status})`,
                }))
                setRuns(opts)
                if (opts[0] && !mrpRunId) setMrpRunId(opts[0].value)
            })
            .catch(() => undefined)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [companyId])

    const load = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        try {
            const res = await planningService.listRequirements({
                companyId,
                warehouseId: warehouseId || undefined,
                mrpRunId: mrpRunId || undefined,
                limit: 100,
            })
            setRows(res.data)
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Load failed')
        } finally {
            setLoading(false)
        }
    }, [companyId, warehouseId, mrpRunId])

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
                header: 'Required date',
                cell: ({ row }) =>
                    row.original.requiredDate
                        ? String(row.original.requiredDate).slice(0, 10)
                        : '—',
            },
            {
                header: 'Source',
                cell: ({ row }) =>
                    row.original.source ? (
                        <StatusBadge status={row.original.source} />
                    ) : (
                        '—'
                    ),
            },
            {
                header: 'Required qty',
                cell: ({ row }) => Number(row.original.demandQty),
            },
            {
                header: 'Available',
                cell: ({ row }) => Number(row.original.availableQty),
            },
            {
                header: 'Incoming',
                cell: ({ row }) => Number(row.original.incomingQty),
            },
            {
                header: 'Safety',
                cell: ({ row }) => Number(row.original.safetyStock),
            },
            {
                header: 'Net',
                cell: ({ row }) => Number(row.original.netRequirement),
            },
            {
                header: 'Recommended',
                cell: ({ row }) => Number(row.original.recommendedQty),
            },
            {
                header: 'Flags',
                cell: ({ row }) => (
                    <div className="flex gap-1 flex-wrap">
                        {row.original.shortage && (
                            <StatusBadge status="SHORTAGE" />
                        )}
                        {row.original.belowReorderPoint && (
                            <StatusBadge status="BELOW_ROP" />
                        )}
                    </div>
                ),
            },
            {
                header: 'Procure by',
                cell: ({ row }) =>
                    row.original.expectedProcurementDate
                        ? String(row.original.expectedProcurementDate).slice(0, 10)
                        : '—',
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Material Requirements"
                description="Netting results from MRP runs"
            />
            <AdaptiveCard className="mb-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormItem label="Company">
                        <Select
                            options={companies}
                            value={companies.find((o) => o.value === companyId)}
                            onChange={(o: any) => setCompanyId(o?.value || '')}
                        />
                    </FormItem>
                    <FormItem label="MRP Run">
                        <Select
                            isClearable
                            options={runs}
                            value={runs.find((o) => o.value === mrpRunId) || null}
                            onChange={(o: any) => setMrpRunId(o?.value || '')}
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

export default MaterialRequirementsPage
