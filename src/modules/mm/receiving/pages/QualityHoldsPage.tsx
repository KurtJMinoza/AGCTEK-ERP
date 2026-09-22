'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Tabs from '@/components/ui/Tabs'
import FormDialog from '@/components/shared/FormDialog'
import { FormItem } from '@/components/ui/Form'
import { HiOutlineLockClosed, HiOutlinePlus, HiOutlineSearch } from 'react-icons/hi'
import { qualityHoldService } from '../services/qualityHoldService'
import { qualityService } from '../services/qualityService'
import type { MmQualityHold } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/receiving/quality-holds'

const HOLD_TYPE_OPTIONS = [
    { value: 'QUALITY_HOLD', label: 'Quality hold' },
    { value: 'QUARANTINE', label: 'Quarantine' },
    { value: 'BLOCKED', label: 'Blocked' },
]

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger'> = {
    ACTIVE: 'warning',
    RELEASED: 'success',
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

const QualityHoldsPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [data, setData] = useState<MmQualityHold[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [search, setSearch] = useState('')
    const [statusTab, setStatusTab] = useState('ACTIVE')
    const [releasingId, setReleasingId] = useState<string | null>(null)
    const [createOpen, setCreateOpen] = useState(false)
    const [creating, setCreating] = useState(false)
    const [holdForm, setHoldForm] = useState({
        companyId: '',
        inspectionLotId: '',
        holdType: 'QUALITY_HOLD',
        reason: '',
        heldBy: '',
    })

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res = await qualityHoldService.list({
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

    const activeCount = useMemo(() => data.filter((h) => h.status === 'ACTIVE').length, [data])

    const createHold = async () => {
        if (!holdForm.companyId.trim() || !holdForm.reason.trim()) {
            pushToast('danger', 'Validation', 'Company and reason are required.')
            return
        }
        setCreating(true)
        try {
            await qualityService.createHold({
                companyId: holdForm.companyId.trim(),
                reason: holdForm.reason.trim(),
                inspectionLotId: holdForm.inspectionLotId.trim() || undefined,
                holdType: holdForm.holdType,
                heldBy: holdForm.heldBy.trim() || undefined,
            })
            pushToast('success', 'Hold created', 'Quality hold is active.')
            setCreateOpen(false)
            setHoldForm({
                companyId: '',
                inspectionLotId: '',
                holdType: 'QUALITY_HOLD',
                reason: '',
                heldBy: '',
            })
            fetchData()
        } catch (err: unknown) {
            const msg =
                (err as { response?: { data?: { message?: string | string[] } } })?.response?.data
                    ?.message || 'Create hold failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : String(msg))
        } finally {
            setCreating(false)
        }
    }

    const releaseHold = async (row: MmQualityHold) => {
        setReleasingId(row.id)
        try {
            await qualityHoldService.release(row.id, { releaseNotes: 'Released from holds queue' })
            pushToast('success', 'Released', `${row.holdNumber} released.`)
            fetchData()
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message || 'Release failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : String(msg))
        } finally {
            setReleasingId(null)
        }
    }

    const columns: ColumnDef<MmQualityHold>[] = useMemo(() => [
        { header: 'Hold #', accessorKey: 'holdNumber' },
        {
            header: 'Inspection lot',
            accessorKey: 'inspectionLot.lotNumber',
            cell: ({ row }) => row.original.inspectionLot?.lotNumber ?? '—',
        },
        {
            header: 'Type',
            accessorKey: 'holdType',
            cell: ({ row }) => row.original.holdType ?? 'QUALITY_HOLD',
        },
        {
            header: 'Reason',
            accessorKey: 'reason',
            cell: ({ row }) => row.original.reason,
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
            header: 'Held',
            accessorKey: 'heldAt',
            cell: ({ row }) => fmtDate(row.original.heldAt),
        },
        {
            header: '',
            id: 'actions',
            cell: ({ row }) =>
                row.original.status === 'ACTIVE' ? (
                    <Button
                        size="xs"
                        variant="solid"
                        loading={releasingId === row.original.id}
                        onClick={() => releaseHold(row.original)}
                    >
                        Release
                    </Button>
                ) : null,
        },
    ], [releasingId])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Quality Holds"
                description="Active holds block usage decisions until released."
                icon={<HiOutlineLockClosed />}
                actions={
                    <Button size="sm" icon={<HiOutlinePlus />} onClick={() => setCreateOpen(true)}>
                        Create hold
                    </Button>
                }
            />

            <AdaptiveCard className="mb-4">
                <p className="text-sm text-gray-500">Active holds (page)</p>
                <p className="text-2xl font-semibold">{activeCount}</p>
            </AdaptiveCard>

            <AdaptiveCard>
                <div className="mb-4 flex flex-wrap items-center gap-4">
                    <Input
                        prefix={<HiOutlineSearch />}
                        placeholder="Search hold #..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                        className="max-w-xs"
                    />
                </div>

                <Tabs value={statusTab} onChange={(val) => { setStatusTab(val as string); setPage(1) }}>
                    <Tabs.TabList>
                        <Tabs.TabNav value="ACTIVE">Active</Tabs.TabNav>
                        <Tabs.TabNav value="RELEASED">Released</Tabs.TabNav>
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
                isOpen={createOpen}
                title="Create quality hold"
                onClose={() => setCreateOpen(false)}
                icon={<HiOutlineLockClosed />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={creating} onClick={createHold}>
                            Create hold
                        </Button>
                    </>
                }
            >
                <FormItem label="Company ID" asterisk>
                    <Input
                        value={holdForm.companyId}
                        onChange={(e) => setHoldForm((f) => ({ ...f, companyId: e.target.value }))}
                        placeholder="Company UUID"
                    />
                </FormItem>
                <FormItem label="Inspection lot ID">
                    <Input
                        value={holdForm.inspectionLotId}
                        onChange={(e) =>
                            setHoldForm((f) => ({ ...f, inspectionLotId: e.target.value }))
                        }
                        placeholder="Optional lot UUID"
                    />
                </FormItem>
                <FormItem label="Hold type">
                    <Select
                        options={HOLD_TYPE_OPTIONS}
                        value={HOLD_TYPE_OPTIONS.find((o) => o.value === holdForm.holdType) ?? null}
                        onChange={(opt) =>
                            setHoldForm((f) => ({ ...f, holdType: opt?.value ?? 'QUALITY_HOLD' }))
                        }
                    />
                </FormItem>
                <FormItem label="Reason" asterisk>
                    <Input
                        value={holdForm.reason}
                        onChange={(e) => setHoldForm((f) => ({ ...f, reason: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Held by">
                    <Input
                        value={holdForm.heldBy}
                        onChange={(e) => setHoldForm((f) => ({ ...f, heldBy: e.target.value }))}
                    />
                </FormItem>
            </FormDialog>
        </PageContainer>
    )
}

export default QualityHoldsPage
