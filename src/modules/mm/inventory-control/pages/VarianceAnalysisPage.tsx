'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Tabs from '@/components/ui/Tabs'
import { FormItem } from '@/components/ui/Form'
import { inventoryControlService } from '../services/inventoryControlService'
import { useDeferredFilterRefs } from '@/modules/mm/shared/useLazyMmRefs'
import type { CountSession, CountVariance, InventoryCountLine } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import Iso9001WorkflowStrip from '../components/Iso9001WorkflowStrip'

const ROUTE = '/modules/mm/inventory-control/variance-analysis'
const { TabList, TabNav, TabContent } = Tabs

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const VarianceAnalysisPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [tab, setTab] = useState<'engine' | 'legacy'>('engine')
    const [sessions, setSessions] = useState<CountSession[]>([])
    const [sessionId, setSessionId] = useState('')
    const [variances, setVariances] = useState<CountVariance[]>([])
    const [legacyRows, setLegacyRows] = useState<InventoryCountLine[]>([])
    const [loading, setLoading] = useState(true)
    const [warehouseId, setWarehouseId] = useState('')
    const [investOpen, setInvestOpen] = useState(false)
    const [investTarget, setInvestTarget] = useState<CountVariance | null>(null)
    const [investForm, setInvestForm] = useState({
        rootCause: '',
        correctiveAction: '',
        investigatedBy: 'inventory-controller',
    })
    const [reportSummary, setReportSummary] = useState('')
    const [busy, setBusy] = useState(false)
    const { warehouses, loadFilterRefs } = useDeferredFilterRefs('warehouses')

    const selectedSession = sessions.find((s) => s.id === sessionId)

    const loadSessions = useCallback(async () => {
        const res = await inventoryControlService.listSessions({
            pageSize: 50,
            warehouseId: warehouseId || undefined,
            status: undefined,
        })
        const list = (res.data ?? []) as CountSession[]
        setSessions(list.filter((s) => !['CLOSED'].includes(s.status)))
        if (!sessionId && list[0]) setSessionId(list[0].id)
    }, [warehouseId, sessionId])

    const loadEngine = useCallback(async () => {
        if (!sessionId) {
            setVariances([])
            return
        }
        const res = await inventoryControlService.listVariances({
            sessionId,
            pageSize: 200,
        })
        const data = (res.data ?? []) as CountVariance[]
        setVariances(
            data.filter((v) => Number(v.varianceQuantity) !== 0 || v.status === 'RECOUNT_REQUIRED'),
        )
    }, [sessionId])

    const loadLegacy = useCallback(async () => {
        const statuses = ['COUNTED', 'REQUIRE_RECOUNT', 'RECOUNTED', 'APPROVED', 'ADJUSTED']
        const results = await Promise.all(
            statuses.map((status) =>
                inventoryControlService.listLines({
                    status,
                    warehouseId: warehouseId || undefined,
                    limit: 100,
                }),
            ),
        )
        const merged = results.flatMap((r) => r.data).filter((l) => {
            const v = Number(l.varianceQuantity ?? 0)
            return v !== 0 || ['REQUIRE_RECOUNT', 'RECOUNTED'].includes(l.status)
        })
        const map = new Map(merged.map((l) => [l.id, l]))
        setLegacyRows([...map.values()])
    }, [warehouseId])

    const load = useCallback(async () => {
        setLoading(true)
        try {
            await loadSessions()
            await Promise.all([loadEngine(), loadLegacy()])
        } catch (e: any) {
            pushToast('danger', 'Load failed', e?.response?.data?.message ?? e.message)
        } finally {
            setLoading(false)
        }
    }, [loadSessions, loadEngine, loadLegacy])

    useEffect(() => {
        load()
        const t = window.setTimeout(() => loadFilterRefs(), 0)
        return () => window.clearTimeout(t)
    }, [load, loadFilterRefs])

    useEffect(() => {
        if (tab === 'engine') loadEngine()
    }, [sessionId, tab, loadEngine])

    const openInvestigate = (row: CountVariance) => {
        setInvestTarget(row)
        setInvestForm({
            rootCause: row.rootCause ?? '',
            correctiveAction: row.correctiveAction ?? '',
            investigatedBy: row.investigatedBy ?? 'inventory-controller',
        })
        setInvestOpen(true)
    }

    const saveInvestigation = async () => {
        if (!investTarget || !investForm.rootCause.trim()) {
            pushToast('danger', 'Required', 'Root cause is mandatory for ISO 9001')
            return
        }
        setBusy(true)
        try {
            await inventoryControlService.investigateVariance(investTarget.id, investForm)
            pushToast('success', 'Saved', 'Variance investigation recorded')
            setInvestOpen(false)
            await loadEngine()
            await loadSessions()
        } catch (e: any) {
            pushToast('danger', 'Failed', e?.response?.data?.message ?? e.message)
        } finally {
            setBusy(false)
        }
    }

    const submitReport = async () => {
        if (!sessionId) return
        setBusy(true)
        try {
            await inventoryControlService.submitVarianceReport(sessionId, {
                summary: reportSummary || undefined,
                submittedBy: 'inventory-controller',
            })
            pushToast('success', 'Report submitted', 'Formal variance report registered')
            await loadSessions()
            await loadEngine()
        } catch (e: any) {
            pushToast('danger', 'Failed', e?.response?.data?.message ?? e.message)
        } finally {
            setBusy(false)
        }
    }

    const createAdjustmentRequest = async () => {
        if (!sessionId) return
        setBusy(true)
        try {
            await inventoryControlService.createAdjustmentRequest({
                sessionId,
                submittedBy: 'inventory-controller',
            })
            pushToast(
                'success',
                'Request created',
                'Sent to adjustment approval (step 4)',
            )
        } catch (e: any) {
            pushToast('danger', 'Failed', e?.response?.data?.message ?? e.message)
        } finally {
            setBusy(false)
        }
    }

    const varianceColumns: ColumnDef<CountVariance>[] = useMemo(
        () => [
            {
                header: 'Material',
                cell: ({ row }) =>
                    row.original.task?.material?.materialCode ??
                    row.original.taskId.slice(0, 8),
            },
            {
                header: 'System',
                cell: ({ row }) => Number(row.original.systemQuantity),
            },
            {
                header: 'Physical',
                cell: ({ row }) => Number(row.original.countQuantity),
            },
            {
                header: 'Variance',
                cell: ({ row }) => Number(row.original.varianceQuantity),
            },
            {
                header: 'Value',
                cell: ({ row }) => Number(row.original.estimatedValue).toFixed(2),
            },
            {
                header: 'Root cause',
                cell: ({ row }) =>
                    row.original.rootCause ? (
                        <span className="line-clamp-2 text-xs">{row.original.rootCause}</span>
                    ) : (
                        <span className="text-gray-400">—</span>
                    ),
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge
                        tone={
                            row.original.status === 'RECOUNT_REQUIRED'
                                ? 'warning'
                                : row.original.status === 'INVESTIGATED'
                                  ? 'success'
                                  : 'default'
                        }
                    >
                        {row.original.status.replaceAll('_', ' ')}
                    </StatusBadge>
                ),
            },
            {
                header: '',
                id: 'act',
                cell: ({ row }) =>
                    ['RECOUNT_REQUIRED', 'CLEARED', 'ADJUSTED'].includes(row.original.status) ? null : (
                        <Button size="xs" onClick={() => openInvestigate(row.original)}>
                            Investigate
                        </Button>
                    ),
            },
        ],
        [],
    )

    const legacyColumns: ColumnDef<InventoryCountLine>[] = useMemo(
        () => [
            {
                header: 'Count',
                cell: ({ row }) => row.original.count?.countNumber ?? '—',
            },
            {
                header: 'Material',
                cell: ({ row }) =>
                    row.original.material?.materialCode ??
                    row.original.materialId.slice(0, 8),
            },
            {
                header: 'System',
                cell: ({ row }) => Number(row.original.systemQuantity ?? 0),
            },
            {
                header: 'Physical',
                cell: ({ row }) =>
                    Number(
                        row.original.finalQuantity ??
                            row.original.recountQuantity ??
                            row.original.countedQuantity ??
                            0,
                    ),
            },
            {
                header: 'Variance qty',
                cell: ({ row }) => Number(row.original.varianceQuantity ?? 0),
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge tone="warning">{row.original.status}</StatusBadge>
                ),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Variance Analysis"
                description="Investigate count variances, document root cause, and issue the formal variance report before adjustment approval."
                actions={<Button onClick={load}>Refresh</Button>}
            />
            <Iso9001WorkflowStrip activeStep={3} />

            <AdaptiveCard className="mb-4">
                <div className="grid gap-4 p-4 md:grid-cols-2">
                    <FormItem label="Warehouse filter">
                        <Select
                            options={warehouses}
                            value={warehouses.find((o) => o.value === warehouseId) ?? null}
                            onChange={(o: { value?: string } | null) =>
                                setWarehouseId(o?.value ?? '')
                            }
                            isClearable
                        />
                    </FormItem>
                    {tab === 'engine' ? (
                        <FormItem label="Count session">
                            <Select
                                options={sessions.map((s) => ({
                                    value: s.id,
                                    label: `${s.sessionNumber} · ${s.countType.replaceAll('_', ' ')} · ${s.status}`,
                                }))}
                                value={
                                    sessionId
                                        ? {
                                              value: sessionId,
                                              label:
                                                  sessions.find((s) => s.id === sessionId)
                                                      ?.sessionNumber ?? sessionId,
                                          }
                                        : null
                                }
                                onChange={(o: { value?: string } | null) =>
                                    setSessionId(o?.value ?? '')
                                }
                            />
                        </FormItem>
                    ) : null}
                </div>
                {selectedSession?.varianceReportNumber ? (
                    <div className="border-t border-gray-200 px-4 py-3 text-sm dark:border-gray-700">
                        <span className="font-semibold text-primary">
                            {selectedSession.varianceReportNumber}
                        </span>
                        <span className="text-gray-500">
                            {' '}
                            — submitted{' '}
                            {selectedSession.varianceReportSubmittedAt
                                ? new Date(
                                      selectedSession.varianceReportSubmittedAt,
                                  ).toLocaleString()
                                : ''}{' '}
                            by {selectedSession.varianceReportSubmittedBy ?? '—'}
                        </span>
                        {selectedSession.varianceReportSummary ? (
                            <p className="mt-1 text-gray-600 dark:text-gray-400">
                                {selectedSession.varianceReportSummary}
                            </p>
                        ) : null}
                    </div>
                ) : null}
            </AdaptiveCard>

            <AdaptiveCard>
                <Tabs value={tab} onChange={(v) => setTab(v as 'engine' | 'legacy')}>
                    <TabList>
                        <TabNav value="engine">Count engine variances</TabNav>
                        <TabNav value="legacy">Legacy count lines</TabNav>
                    </TabList>
                    <TabContent value="engine">
                        <div className="mt-4 space-y-4">
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="solid"
                                    loading={busy}
                                    disabled={
                                        !sessionId ||
                                        !!selectedSession?.varianceReportSubmittedAt
                                    }
                                    onClick={submitReport}
                                >
                                    Submit formal variance report
                                </Button>
                                <Button
                                    loading={busy}
                                    disabled={
                                        !sessionId ||
                                        !selectedSession?.varianceReportSubmittedAt
                                    }
                                    onClick={createAdjustmentRequest}
                                >
                                    Create adjustment request
                                </Button>
                            </div>
                            <FormItem label="Report executive summary (optional)">
                                <Input
                                    textArea
                                    rows={2}
                                    value={reportSummary}
                                    onChange={(e) => setReportSummary(e.target.value)}
                                    placeholder="Summary for management review (ISO 9001 documented output)"
                                />
                            </FormItem>
                            <DataTable
                                columns={varianceColumns}
                                data={variances}
                                loading={loading}
                            />
                        </div>
                    </TabContent>
                    <TabContent value="legacy">
                        <div className="mt-4">
                            <DataTable
                                columns={legacyColumns}
                                data={legacyRows}
                                loading={loading}
                            />
                        </div>
                    </TabContent>
                </Tabs>
            </AdaptiveCard>

            <FormDialog
                isOpen={investOpen}
                onClose={() => setInvestOpen(false)}
                title="Variance investigation"
                onSubmit={saveInvestigation}
                confirmLoading={busy}
            >
                <FormItem label="Root cause (required)">
                    <Input
                        textArea
                        rows={3}
                        value={investForm.rootCause}
                        onChange={(e) =>
                            setInvestForm((f) => ({ ...f, rootCause: e.target.value }))
                        }
                    />
                </FormItem>
                <FormItem label="Corrective action">
                    <Input
                        textArea
                        rows={2}
                        value={investForm.correctiveAction}
                        onChange={(e) =>
                            setInvestForm((f) => ({
                                ...f,
                                correctiveAction: e.target.value,
                            }))
                        }
                    />
                </FormItem>
                <FormItem label="Investigated by">
                    <Input
                        value={investForm.investigatedBy}
                        onChange={(e) =>
                            setInvestForm((f) => ({
                                ...f,
                                investigatedBy: e.target.value,
                            }))
                        }
                    />
                </FormItem>
            </FormDialog>
        </PageContainer>
    )
}

export default VarianceAnalysisPage
