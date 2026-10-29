'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import MrpResponsiveTable, { type ColumnDef } from '../components/MrpResponsiveTable'
import {
    MrpAnimatedStatus,
    MrpDocNumberCell,
    MrpPlainCell,
    MRP_RUN_STATUS,
    mrpStatusTone,
} from '../components/mrpTableUi'
import { mrpParentBreadcrumbs } from '../utils/mrpPageUi'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Checkbox from '@/components/ui/Checkbox'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import Card from '@/components/ui/Card'
import Link from 'next/link'
import { HiOutlinePlus, HiOutlinePlay, HiOutlineChartBar } from 'react-icons/hi'
import { planningService } from '../services/planningService'
import { useDeferredFilterRefs, useLazyMmRefs } from '@/modules/mm/shared/useLazyMmRefs'
import type { MrpRun, PlanningDashboard } from '../types'

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
    const parentBreadcrumbs = mrpParentBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<MrpRun[]>([])
    const [dash, setDash] = useState<PlanningDashboard | null>(null)
    const [loading, setLoading] = useState(true)
    const { companies, loadFilterRefs } = useDeferredFilterRefs('companies')
    const { ensure: ensureFormRefs, warehouses } = useLazyMmRefs()
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
        if (!companyId && companies[0]) setCompanyId(companies[0].value)
    }, [companies, companyId])

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
        const t = window.setTimeout(() => loadFilterRefs(), 0)
        return () => window.clearTimeout(t)
    }, [load, loadFilterRefs])

    const openCreate = useCallback(async () => {
        await ensureFormRefs('warehouses')
        setOpen(true)
    }, [ensureFormRefs])

    const columns: ColumnDef<MrpRun>[] = useMemo(
        () => [
            {
                header: 'MRP run',
                accessorKey: 'runNumber',
                cell: ({ row }) => (
                    <MrpDocNumberCell
                        icon="run"
                        primary={row.original.runNumber}
                        secondary={
                            row.original.executionTime
                                ? String(row.original.executionTime).slice(0, 19).replace('T', ' ')
                                : 'Not executed'
                        }
                    />
                ),
            },
            {
                header: 'Warehouse',
                cell: ({ row }) => (
                    <MrpPlainCell mono>{row.original.warehouse?.code ?? 'All'}</MrpPlainCell>
                ),
            },
            {
                header: 'Horizon',
                cell: ({ row }) => (
                    <MrpPlainCell>{`${row.original.planningHorizonDays} days`}</MrpPlainCell>
                ),
            },
            {
                header: 'Open receipts',
                cell: ({ row }) => (
                    <MrpPlainCell>{row.original.includeOpenReceipts ? 'Included' : 'Excluded'}</MrpPlainCell>
                ),
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <MrpAnimatedStatus
                        status={row.original.status}
                        tone={mrpStatusTone(row.original.status, MRP_RUN_STATUS)}
                    />
                ),
            },
            {
                header: 'Req / sug',
                cell: ({ row }) => (
                    <MrpPlainCell mono>
                        {`${row.original._count?.requirements ?? 0} / ${row.original._count?.suggestions ?? 0}`}
                    </MrpPlainCell>
                ),
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
            <PageHeader
                breadcrumbs={parentBreadcrumbs}
                title="MRP Runs"
                description="Execute material requirements planning and review dashboard signals"
                actions={
                    <div className="flex gap-2">
                        <Link href="/modules/mm/planning-mrp/projected-stock">
                            <Button
                                variant="plain"
                                icon={<HiOutlineChartBar />}
                            >
                                Projected Stock
                            </Button>
                        </Link>
                        <Button
                            variant="solid"
                            icon={<HiOutlinePlus />}
                            onClick={openCreate}
                        >
                            New MRP Run
                        </Button>
                    </div>
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
                <MrpResponsiveTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    getRowId={(row) => row.id}
                    tableMinWidthClass="min-w-[960px]"
                />
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
