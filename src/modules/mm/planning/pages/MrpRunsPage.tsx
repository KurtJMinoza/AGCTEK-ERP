'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import FormDialog from '@/components/shared/FormDialog'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Checkbox from '@/components/ui/Checkbox'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import Card from '@/components/ui/Card'
import { HiOutlinePlus, HiOutlinePlay } from 'react-icons/hi'
import { planningService } from '../services/planningService'
import { warehouseService } from '../../warehouse/services/warehouseService'
import { orgService } from '../../material-master/services/referenceService'
import type { MrpRun, PlanningDashboard } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/planning-mrp/mrp-runs'
type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const MrpRunsPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<MrpRun[]>([])
    const [dash, setDash] = useState<PlanningDashboard | null>(null)
    const [loading, setLoading] = useState(true)
    const [companies, setCompanies] = useState<Opt[]>([])
    const [warehouses, setWarehouses] = useState<Opt[]>([])
    const [companyId, setCompanyId] = useState('')
    const [open, setOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [form, setForm] = useState({
        warehouseId: '',
        planningHorizonDays: 30,
        includeOpenReceipts: true,
        executeImmediately: true,
    })

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
            const [runs, dashboard] = await Promise.all([
                planningService.listMrpRuns({ companyId, limit: 50 }),
                planningService.dashboard({ companyId }),
            ])
            setRows(runs.data)
            setDash(dashboard)
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Load failed')
        } finally {
            setLoading(false)
        }
    }, [companyId])

    useEffect(() => {
        load()
    }, [load])

    const columns: ColumnDef<MrpRun>[] = useMemo(
        () => [
            { header: 'Run #', accessorKey: 'runNumber' },
            {
                header: 'Warehouse',
                cell: ({ row }) => row.original.warehouse?.code ?? 'All',
            },
            {
                header: 'Horizon',
                cell: ({ row }) => `${row.original.planningHorizonDays}d`,
            },
            {
                header: 'Open receipts',
                cell: ({ row }) =>
                    row.original.includeOpenReceipts ? 'Yes' : 'No',
            },
            {
                header: 'Status',
                cell: ({ row }) => <StatusBadge status={row.original.status} />,
            },
            {
                header: 'Req / Sug',
                cell: ({ row }) =>
                    `${row.original._count?.requirements ?? 0} / ${row.original._count?.suggestions ?? 0}`,
            },
            {
                header: 'Executed',
                cell: ({ row }) =>
                    row.original.executionTime
                        ? String(row.original.executionTime).slice(0, 19).replace('T', ' ')
                        : '—',
            },
            {
                header: 'Actions',
                cell: ({ row }) =>
                    row.original.status !== 'RUNNING' ? (
                        <Button
                            size="xs"
                            icon={<HiOutlinePlay />}
                            onClick={async () => {
                                try {
                                    await planningService.executeMrpRun(
                                        row.original.id,
                                    )
                                    pushToast('success', 'Done', 'MRP executed')
                                    load()
                                } catch (e: any) {
                                    pushToast(
                                        'danger',
                                        'Error',
                                        e?.response?.data?.message ||
                                            'Execute failed',
                                    )
                                }
                            }}
                        >
                            Execute
                        </Button>
                    ) : null,
            },
        ],
        [load],
    )

    const submit = async () => {
        setSubmitting(true)
        try {
            await planningService.createMrpRun({
                companyId,
                warehouseId: form.warehouseId || undefined,
                planningHorizonDays: Number(form.planningHorizonDays),
                includeOpenReceipts: form.includeOpenReceipts,
                executeImmediately: form.executeImmediately,
            })
            pushToast('success', 'Created', 'MRP run created')
            setOpen(false)
            load()
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Create failed')
        } finally {
            setSubmitting(false)
        }
    }

    const s = dash?.summary

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="MRP Runs"
                description="Execute material requirements planning and review dashboard signals"
                actions={
                    <Button
                        variant="solid"
                        icon={<HiOutlinePlus />}
                        onClick={() => setOpen(true)}
                    >
                        New MRP Run
                    </Button>
                }
            />

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                {[
                    { label: 'Below ROP', value: s?.belowReorderPoint ?? 0 },
                    { label: 'Shortages', value: s?.shortages ?? 0 },
                    { label: 'Open suggestions', value: s?.openSuggestions ?? 0 },
                    { label: 'Overdue inbound', value: s?.overdueInbound ?? 0 },
                    { label: 'Stockouts', value: s?.projectedStockouts ?? 0 },
                ].map((c) => (
                    <Card key={c.label} className="p-4">
                        <div className="text-xs text-gray-500">{c.label}</div>
                        <div className="text-2xl font-semibold">{c.value}</div>
                    </Card>
                ))}
            </div>

            <AdaptiveCard className="mb-4">
                <FormItem label="Company">
                    <Select
                        options={companies}
                        value={companies.find((o) => o.value === companyId)}
                        onChange={(o: any) => setCompanyId(o?.value || '')}
                    />
                </FormItem>
            </AdaptiveCard>

            <AdaptiveCard>
                <DataTable columns={columns} data={rows} loading={loading} />
            </AdaptiveCard>

            <FormDialog
                isOpen={open}
                onClose={() => setOpen(false)}
                title="Create MRP Run"
                footer={
                    <>
                        <Button size="sm" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            loading={submitting}
                            onClick={submit}
                        >
                            Create
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <FormItem label="Warehouse (optional — all if empty)">
                        <Select
                            isClearable
                            options={warehouses}
                            value={
                                warehouses.find((o) => o.value === form.warehouseId) ||
                                null
                            }
                            onChange={(o: any) =>
                                setForm((f) => ({
                                    ...f,
                                    warehouseId: o?.value || '',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Planning horizon (days)">
                        <Input
                            type="number"
                            min={1}
                            value={form.planningHorizonDays}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    planningHorizonDays: Number(e.target.value),
                                }))
                            }
                        />
                    </FormItem>
                    <Checkbox
                        checked={form.includeOpenReceipts}
                        onChange={(checked) =>
                            setForm((f) => ({
                                ...f,
                                includeOpenReceipts: !!checked,
                            }))
                        }
                    >
                        Include open PO receipts in projected available
                    </Checkbox>
                    <Checkbox
                        checked={form.executeImmediately}
                        onChange={(checked) =>
                            setForm((f) => ({
                                ...f,
                                executeImmediately: !!checked,
                            }))
                        }
                    >
                        Execute immediately
                    </Checkbox>
                </div>
            </FormDialog>
        </PageContainer>
    )
}

export default MrpRunsPage
