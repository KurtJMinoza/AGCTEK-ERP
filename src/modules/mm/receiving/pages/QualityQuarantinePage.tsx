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
import Input from '@/components/ui/Input'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Tabs from '@/components/ui/Tabs'
import { FormItem } from '@/components/ui/Form'
import { HiOutlineClipboardCheck, HiOutlineSearch } from 'react-icons/hi'
import { inboundService } from '../services/inboundService'
import type { MmQualityInspection, MmQualityInspectionLine } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    firstError,
    nonNegativeNumber,
    visibleError,
    type FieldErrors,
} from '@/modules/mm/shared/formValidation'

const ROUTE = '/modules/mm/receiving/quality-quarantine'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    PENDING: 'warning',
    COMPLETED: 'success',
    CANCELLED: 'danger',
    PASS: 'success',
    FAIL: 'danger',
    PARTIAL_PASS: 'warning',
}

type DecideDraft = {
    lineId: string
    passQuantity: string
    failQuantity: string
    remarks: string
    quantity: number
    label: string
}

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>{msg}</Notification>,
        { placement: 'top-end' },
    )
}

function fmtDate(iso?: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function lineLabel(line: MmQualityInspectionLine) {
    const m = line.goodsReceiptLine?.material
    return m
        ? `${m.materialCode} — ${m.materialName}`
        : line.materialId
}

const QualityQuarantinePage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)

    const [data, setData] = useState<MmQualityInspection[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [search, setSearch] = useState('')
    const [statusTab, setStatusTab] = useState('PENDING')

    const [decideOpen, setDecideOpen] = useState(false)
    const [selected, setSelected] = useState<MmQualityInspection | null>(null)
    const [drafts, setDrafts] = useState<DecideDraft[]>([])
    const [inspectedBy, setInspectedBy] = useState('')
    const [remarks, setRemarks] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [touched, setTouched] = useState<Record<string, boolean>>({})
    const [forceValidate, setForceValidate] = useState(false)

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res = await inboundService.listQualityInspections({
                page,
                pageSize,
                search: search || undefined,
                status: statusTab || undefined,
            })
            setData(res.data)
            setTotal(res.total)
        } catch {
            setData([])
            setTotal(0)
        } finally {
            setLoading(false)
        }
    }, [page, pageSize, search, statusTab])

    useEffect(() => { fetchData() }, [fetchData])

    const openDecide = useCallback(async (row: MmQualityInspection) => {
        try {
            const full = await inboundService.getQualityInspection(row.id)
            setSelected(full)
            setDrafts(
                (full.lines ?? []).map((l) => {
                    const qty = Number(l.quantity)
                    return {
                        lineId: l.id,
                        passQuantity: String(qty),
                        failQuantity: '0',
                        remarks: '',
                        quantity: qty,
                        label: lineLabel(l),
                    }
                }),
            )
            setInspectedBy('')
            setRemarks('')
            setTouched({})
            setForceValidate(false)
            setDecideOpen(true)
        } catch {
            pushToast('danger', 'Error', 'Failed to load quality inspection')
        }
    }, [])

    const applyPreset = useCallback((mode: 'PASS' | 'FAIL' | 'PARTIAL') => {
        setDrafts((prev) =>
            prev.map((d) => {
                if (mode === 'PASS') {
                    return { ...d, passQuantity: String(d.quantity), failQuantity: '0' }
                }
                if (mode === 'FAIL') {
                    return { ...d, passQuantity: '0', failQuantity: String(d.quantity) }
                }
                const half = Math.floor(d.quantity / 2)
                return {
                    ...d,
                    passQuantity: String(half),
                    failQuantity: String(d.quantity - half),
                }
            }),
        )
    }, [])

    const errors = useMemo<FieldErrors>(() => {
        const e: FieldErrors = {}
        drafts.forEach((d, idx) => {
            const passErr = nonNegativeNumber(d.passQuantity, 'Pass qty')
            const failErr = nonNegativeNumber(d.failQuantity, 'Fail qty')
            if (passErr) e[`pass-${idx}`] = passErr
            if (failErr) e[`fail-${idx}`] = failErr
            const pass = Number(d.passQuantity) || 0
            const fail = Number(d.failQuantity) || 0
            if (Math.abs(pass + fail - d.quantity) > 0.0001) {
                e[`sum-${idx}`] = `Pass + fail must equal ${d.quantity}`
            }
        })
        return e
    }, [drafts])

    const handleDecide = useCallback(async () => {
        if (!selected) return
        setForceValidate(true)
        if (Object.values(errors).some(Boolean)) {
            pushToast('danger', 'Validation', 'Pass + fail must match inspected quantity on each line.')
            return
        }
        setSubmitting(true)
        try {
            await inboundService.decideQualityInspection(selected.id, {
                inspectedBy: inspectedBy.trim() || undefined,
                remarks: remarks.trim() || undefined,
                lines: drafts.map((d) => ({
                    lineId: d.lineId,
                    passQuantity: Number(d.passQuantity) || 0,
                    failQuantity: Number(d.failQuantity) || 0,
                    remarks: d.remarks.trim() || undefined,
                })),
            })
            pushToast('success', 'Decided', `${selected.inspectionNumber} decision recorded.`)
            setDecideOpen(false)
            fetchData()
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message || 'Decision failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : String(msg))
        } finally {
            setSubmitting(false)
        }
    }, [selected, drafts, inspectedBy, remarks, errors, fetchData])

    const columns: ColumnDef<MmQualityInspection>[] = useMemo(() => [
        { header: 'Inspection #', accessorKey: 'inspectionNumber' },
        {
            header: 'Goods receipt',
            accessorKey: 'goodsReceipt.documentNumber',
            cell: ({ row }) => row.original.goodsReceipt?.documentNumber ?? '—',
        },
        {
            header: 'Lines',
            accessorKey: 'lines',
            cell: ({ row }) => row.original.lines?.length ?? 0,
        },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: ({ row }) => (
                <StatusBadge tone={STATUS_TONE[row.original.status] ?? 'default'}>
                    {row.original.status}
                </StatusBadge>
            ),
        },
        {
            header: 'Result',
            accessorKey: 'result',
            cell: ({ row }) =>
                row.original.result ? (
                    <StatusBadge tone={STATUS_TONE[row.original.result] ?? 'default'}>
                        {row.original.result}
                    </StatusBadge>
                ) : (
                    '—'
                ),
        },
        {
            header: 'Created',
            accessorKey: 'createdAt',
            cell: ({ row }) => fmtDate(row.original.createdAt),
        },
        {
            header: '',
            id: 'actions',
            cell: ({ row }) =>
                row.original.status === 'PENDING' ? (
                    <Button
                        size="xs"
                        variant="solid"
                        icon={<HiOutlineClipboardCheck />}
                        onClick={() => openDecide(row.original)}
                    >
                        Decide
                    </Button>
                ) : null,
        },
    ], [openDecide])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Quality / Quarantine"
                description="QI stock stays in QUALITY_INSPECTION until decide. PARTIAL_PASS: pass qty → unrestricted (+ putaway); fail qty → blocked. No direct balance edits."
            />

            <AdaptiveCard>
                <div className="mb-4 flex flex-wrap items-center gap-4">
                    <Input
                        prefix={<HiOutlineSearch />}
                        placeholder="Search inspection #..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                        className="max-w-xs"
                    />
                </div>

                <Tabs value={statusTab} onChange={(val) => { setStatusTab(val as string); setPage(1) }}>
                    <Tabs.TabList>
                        <Tabs.TabNav value="PENDING">Pending</Tabs.TabNav>
                        <Tabs.TabNav value="COMPLETED">Completed</Tabs.TabNav>
                        <Tabs.TabNav value="">All</Tabs.TabNav>
                    </Tabs.TabList>
                </Tabs>

                <DataTable
                    columns={columns}
                    data={data}
                    loading={loading}
                    pagingData={{ total, pageIndex: page, pageSize }}
                    onPaginationChange={(p) => setPage(p)}
                    onSelectChange={(s) => { setPageSize(s); setPage(1) }}
                />
            </AdaptiveCard>

            <FormDialog
                isOpen={decideOpen}
                onClose={() => setDecideOpen(false)}
                size="xl"
                title={selected?.inspectionNumber ?? 'Quality decision'}
                description={
                    selected?.goodsReceipt?.documentNumber
                        ? `GR ${selected.goodsReceipt.documentNumber} · Pass qty → unrestricted (+ putaway); fail qty → blocked`
                        : 'Pass qty → unrestricted (+ putaway); fail qty → blocked'
                }
                icon={<HiOutlineClipboardCheck />}
                headerExtra={
                    <div className="flex flex-wrap gap-2">
                        <Button size="xs" onClick={() => applyPreset('PASS')}>All pass</Button>
                        <Button size="xs" onClick={() => applyPreset('FAIL')}>All fail</Button>
                        <Button size="xs" onClick={() => applyPreset('PARTIAL')}>Split half</Button>
                    </div>
                }
                footer={
                    <>
                        <Button size="sm" onClick={() => setDecideOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={submitting} onClick={handleDecide}>
                            Record decision
                        </Button>
                    </>
                }
            >
                <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem label="Inspected by">
                        <Input
                            value={inspectedBy}
                            onChange={(e) => setInspectedBy(e.target.value)}
                            placeholder="Optional"
                        />
                    </FormItem>
                    <FormItem label="Remarks">
                        <Input
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder="Optional"
                        />
                    </FormItem>
                </div>

                <div className="space-y-4">
                    {drafts.map((d, idx) => (
                        <div
                            key={d.lineId}
                            className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                        >
                            <div className="mb-2 flex justify-between text-sm">
                                <span className="font-medium">{d.label}</span>
                                <span className="text-gray-500">Inspected qty {d.quantity}</span>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <FormItem
                                    label="Pass qty"
                                    invalid={!!firstError(
                                        visibleError(errors, touched, `pass-${idx}`, forceValidate),
                                        visibleError(errors, touched, `sum-${idx}`, forceValidate),
                                    )}
                                    errorMessage={firstError(
                                        visibleError(errors, touched, `pass-${idx}`, forceValidate),
                                        visibleError(errors, touched, `sum-${idx}`, forceValidate),
                                    )}
                                >
                                    <Input
                                        type="number"
                                        min={0}
                                        value={d.passQuantity}
                                        onChange={(e) => {
                                            setTouched((t) => ({ ...t, [`pass-${idx}`]: true, [`sum-${idx}`]: true }))
                                            setDrafts((prev) =>
                                                prev.map((x, i) =>
                                                    i === idx ? { ...x, passQuantity: e.target.value } : x,
                                                ),
                                            )
                                        }}
                                    />
                                </FormItem>
                                <FormItem
                                    label="Fail qty"
                                    invalid={!!visibleError(errors, touched, `fail-${idx}`, forceValidate)}
                                    errorMessage={visibleError(errors, touched, `fail-${idx}`, forceValidate)}
                                >
                                    <Input
                                        type="number"
                                        min={0}
                                        value={d.failQuantity}
                                        onChange={(e) => {
                                            setTouched((t) => ({ ...t, [`fail-${idx}`]: true, [`sum-${idx}`]: true }))
                                            setDrafts((prev) =>
                                                prev.map((x, i) =>
                                                    i === idx ? { ...x, failQuantity: e.target.value } : x,
                                                ),
                                            )
                                        }}
                                    />
                                </FormItem>
                                <FormItem label="Line remarks">
                                    <Input
                                        value={d.remarks}
                                        onChange={(e) =>
                                            setDrafts((prev) =>
                                                prev.map((x, i) =>
                                                    i === idx ? { ...x, remarks: e.target.value } : x,
                                                ),
                                            )
                                        }
                                    />
                                </FormItem>
                            </div>
                        </div>
                    ))}
                </div>
            </FormDialog>
        </PageContainer>
    )
}

export default QualityQuarantinePage
