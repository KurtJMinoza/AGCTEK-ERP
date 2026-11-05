'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import FormDialog from '@/components/shared/FormDialog'
import StatCard from '@/components/shared/StatCard'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Skeleton from '@/components/ui/Skeleton'
import Tabs from '@/components/ui/Tabs'
import {
    HiOutlineCheckCircle,
    HiOutlineClock,
    HiOutlineExclamationCircle,
    HiOutlineLightningBolt,
    HiOutlineRefresh,
    HiOutlineSearch,
} from 'react-icons/hi'
import type { ReactNode } from 'react'
import { notifyError } from './FicoCompanySelect'
import FicoResponsiveTable, { type ColumnDef } from './FicoResponsiveTable'
import { FicoTwoLineCell, formatFicoDate } from './ficoTableUi'
import { ficoAccountingEventService } from '../services/ficoService'
import type {
    FicoAccountingEvent,
    FicoAccountingEventDetail,
    FicoAccountingEventList,
    FicoAccountingEventStatus,
} from '../types'

type StatusTab = '' | FicoAccountingEventStatus

const STATUS_LABEL: Record<FicoAccountingEventStatus, string> = {
    CONSUMED: 'Posted',
    PENDING: 'Pending',
    FAILED: 'Failed',
}

const STATUS_TONE: Record<FicoAccountingEventStatus, 'success' | 'warning' | 'danger'> = {
    CONSUMED: 'success',
    PENDING: 'warning',
    FAILED: 'danger',
}

/** "InventoryValuationUpdated" → "Inventory valuation updated". */
function humanize(value: string) {
    const spaced = value
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
    return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function money(value: string | null, currency: string | null) {
    if (value === null) return '—'
    return `${currency ? `${currency} ` : ''}${Number(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`
}

function ResultCell({ event }: { event: FicoAccountingEvent }) {
    if (event.status === 'CONSUMED') {
        return event.journal ? (
            <FicoTwoLineCell
                mono
                primary={event.journal.documentNumber ?? event.journal.id.slice(0, 10)}
                secondary={`Journal · ${event.journal.status.toLowerCase()}`}
            />
        ) : (
            <span className="text-xs text-gray-500">Consumed — no FICO journal (legacy bridge)</span>
        )
    }
    if (event.status === 'FAILED') {
        return (
            <p
                className="line-clamp-2 max-w-[22rem] text-xs text-red-600 dark:text-red-400"
                title={event.errorSummary ?? undefined}
            >
                {event.errorSummary ?? 'Failed without an error message.'}
            </p>
        )
    }
    return <span className="text-xs text-gray-500">Waiting for FICO to post</span>
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
            <div className="mt-0.5 break-words text-sm text-gray-900 dark:text-gray-100">{children}</div>
        </div>
    )
}

/** Read-only MM → FICO Posting Monitor tab; the host page owns the company. */
const AccountingEventsPanel = ({ companyId }: { companyId: string }) => {
    const [status, setStatus] = useState<StatusTab>('FAILED')
    const [sourceModule, setSourceModule] = useState('')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(25)
    const [data, setData] = useState<FicoAccountingEventList | null>(null)
    const [loading, setLoading] = useState(false)

    const [detailId, setDetailId] = useState<string | null>(null)
    const [detail, setDetail] = useState<FicoAccountingEventDetail | null>(null)
    const [detailLoading, setDetailLoading] = useState(false)

    const load = useCallback(() => {
        if (!companyId) return
        setLoading(true)
        ficoAccountingEventService
            .list({
                companyId,
                status: status || undefined,
                sourceModule: sourceModule || undefined,
                search: search.trim() || undefined,
                page,
                pageSize,
            })
            .then(setData)
            .catch((error) => {
                setData(null)
                notifyError(error, 'Unable to load accounting events.')
            })
            .finally(() => setLoading(false))
    }, [companyId, status, sourceModule, search, page, pageSize])

    useEffect(() => {
        const handle = window.setTimeout(load, search ? 300 : 0)
        return () => window.clearTimeout(handle)
    }, [load, search])

    const openDetail = (id: string) => {
        setDetail(null)
        setDetailLoading(true)
        setDetailId(id)
    }

    useEffect(() => {
        if (!detailId) return
        let cancelled = false
        ficoAccountingEventService
            .get(detailId)
            .then((value) => {
                if (!cancelled) setDetail(value)
            })
            .catch((error) => notifyError(error, 'Unable to load the event.'))
            .finally(() => {
                if (!cancelled) setDetailLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [detailId])

    const counts = data?.summary.byStatus ?? {}
    const totalCount = (counts.CONSUMED ?? 0) + (counts.PENDING ?? 0) + (counts.FAILED ?? 0)

    const sourceOptions = useMemo(
        () => [
            { value: '', label: 'All sources' },
            ...(data?.summary.bySource ?? []).map((row) => ({
                value: row.sourceModule,
                label: `${humanize(row.sourceModule)} (${row.count})`,
            })),
        ],
        [data],
    )

    const columns = useMemo<ColumnDef<FicoAccountingEvent>[]>(
        () => [
            {
                header: 'Event',
                id: 'event',
                cell: ({ row }) => (
                    <button
                        type="button"
                        onClick={() => openDetail(row.original.id)}
                        className="max-w-[16rem] text-left hover:text-primary"
                    >
                        <FicoTwoLineCell
                            primary={humanize(row.original.eventType)}
                            secondary={`${humanize(row.original.sourceModule)} · ${humanize(row.original.documentType)}`}
                        />
                    </button>
                ),
            },
            {
                header: 'Source document',
                id: 'document',
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-gray-600 dark:text-gray-300" title={row.original.documentId}>
                        {row.original.documentId.slice(0, 12)}…
                    </span>
                ),
            },
            {
                header: 'Posting date',
                id: 'postingDate',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-sm">
                        {row.original.postingDate ? formatFicoDate(row.original.postingDate) : '—'}
                    </span>
                ),
            },
            {
                header: 'Value',
                id: 'value',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-sm font-medium tabular-nums">
                        {money(row.original.totalValue, row.original.currencyCode)}
                    </span>
                ),
            },
            {
                header: 'Status',
                id: 'status',
                cell: ({ row }) => (
                    <StatusBadge tone={STATUS_TONE[row.original.status]}>
                        {STATUS_LABEL[row.original.status]}
                    </StatusBadge>
                ),
            },
            {
                header: 'Result',
                id: 'result',
                cell: ({ row }) => <ResultCell event={row.original} />,
            },
        ],
        [],
    )

    const mobile = useMemo(
        () => ({
            title: (event: FicoAccountingEvent) => humanize(event.eventType),
            subtitle: (event: FicoAccountingEvent) => humanize(event.sourceModule),
            status: (event: FicoAccountingEvent) => ({
                text: STATUS_LABEL[event.status],
                tone: STATUS_TONE[event.status],
            }),
            onPress: (event: FicoAccountingEvent) => openDetail(event.id),
            fields: [
                {
                    label: 'Posting date',
                    value: (event: FicoAccountingEvent) =>
                        event.postingDate ? formatFicoDate(event.postingDate) : '—',
                },
                {
                    label: 'Value',
                    value: (event: FicoAccountingEvent) => money(event.totalValue, event.currencyCode),
                },
                {
                    label: 'Journal',
                    value: (event: FicoAccountingEvent) => event.journal?.documentNumber ?? '—',
                },
                {
                    label: 'Error',
                    value: (event: FicoAccountingEvent) => event.errorSummary ?? '—',
                },
            ],
        }),
        [],
    )

    const changeTab = (value: StatusTab) => {
        setStatus(value)
        setPage(1)
    }

    return (
        <>
            <div className="mb-4">
                <h6 className="font-semibold heading-text">MM → FICO Posting Monitor</h6>
                <p className="mt-1 text-sm text-gray-500">
                    Track whether financially relevant MM movements are posted, pending, or failed in FICO.
                </p>
            </div>
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="Posted to FICO"
                    value={data ? counts.CONSUMED ?? 0 : '—'}
                    icon={<HiOutlineCheckCircle />}
                    tone="success"
                    loading={loading && !data}
                />
                <StatCard
                    label="Pending"
                    value={data ? counts.PENDING ?? 0 : '—'}
                    icon={<HiOutlineClock />}
                    tone="warning"
                    loading={loading && !data}
                    badge={
                        data?.summary.oldestPendingAt
                            ? {
                                  tone: 'warning',
                                  label: `oldest ${formatFicoDate(data.summary.oldestPendingAt)}`,
                              }
                            : undefined
                    }
                />
                <StatCard
                    label="Failed"
                    value={data ? counts.FAILED ?? 0 : '—'}
                    icon={<HiOutlineExclamationCircle />}
                    tone={counts.FAILED ? 'danger' : 'default'}
                    loading={loading && !data}
                />
                <StatCard
                    label="All events"
                    value={data ? totalCount : '—'}
                    icon={<HiOutlineLightningBolt />}
                    loading={loading && !data}
                />
            </div>

            <AdaptiveCard>
                <Tabs value={status} onChange={(value) => changeTab(value as StatusTab)}>
                    <Tabs.TabList className="flex flex-wrap gap-1">
                        {(['FAILED', 'PENDING', 'CONSUMED', ''] as StatusTab[]).map((value) => (
                            <Tabs.TabNav key={value || 'all'} value={value}>
                                {value ? STATUS_LABEL[value] : 'All'}
                                <span
                                    className={`ml-1.5 text-xs ${value === 'FAILED' && counts.FAILED ? 'text-red-500' : 'text-gray-400'}`}
                                >
                                    {value ? counts[value] ?? 0 : totalCount}
                                </span>
                            </Tabs.TabNav>
                        ))}
                    </Tabs.TabList>
                </Tabs>

                <div className="mb-4 mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,14rem)_minmax(0,18rem)_1fr] md:items-center">
                    <Select
                        size="sm"
                        options={sourceOptions}
                        value={sourceOptions.find((option) => option.value === sourceModule) ?? sourceOptions[0]}
                        onChange={(option) => {
                            setSourceModule((option as { value: string } | null)?.value ?? '')
                            setPage(1)
                        }}
                    />
                    <Input
                        prefix={<HiOutlineSearch className="text-lg" />}
                        placeholder="Search event or document ID"
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value)
                            setPage(1)
                        }}
                    />
                    <div className="flex justify-end">
                        <Button
                            size="sm"
                            variant="plain"
                            icon={<HiOutlineRefresh />}
                            loading={loading}
                            onClick={load}
                        >
                            Refresh
                        </Button>
                    </div>
                </div>

                <p className="mb-3 text-xs text-gray-500">
                    Read-only. MM records an event for each financially relevant movement; FICO turns it
                    into a journal. Failed events are not retried from here.
                </p>

                <FicoResponsiveTable<FicoAccountingEvent>
                    columns={columns}
                    data={data?.items ?? []}
                    compact
                    loading={loading}
                    noData={!loading && !(data?.items.length ?? 0)}
                    customNoDataIcon={
                        <p className="py-8 text-center text-sm text-gray-500">
                            {status === 'FAILED'
                                ? 'No failed events — every MM posting reached FICO.'
                                : 'No events match these filters.'}
                        </p>
                    }
                    getRowId={(row) => row.id}
                    pagingData={{ total: data?.total ?? 0, pageIndex: page, pageSize }}
                    onPaginationChange={setPage}
                    onSelectChange={(size) => {
                        setPageSize(size)
                        setPage(1)
                    }}
                    pageSizes={[25, 50, 100]}
                    tableMinWidthClass="min-w-[1040px]"
                    mobile={mobile}
                    instanceId="fico-accounting-events"
                />
            </AdaptiveCard>

            <FormDialog
                isOpen={detailId !== null}
                onClose={() => setDetailId(null)}
                size="lg"
                icon={<HiOutlineLightningBolt />}
                title={detail ? humanize(detail.eventType) : 'Accounting event'}
                description={
                    detail
                        ? `${humanize(detail.sourceModule)} · ${humanize(detail.documentType)}`
                        : undefined
                }
                footer={
                    <Button size="sm" onClick={() => setDetailId(null)}>
                        Close
                    </Button>
                }
            >
                {detailLoading || !detail ? (
                    <div className="space-y-3">
                        <Skeleton height={88} className="rounded-xl" />
                        <Skeleton height={120} className="rounded-xl" />
                    </div>
                ) : (
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-100 bg-gray-50/80 p-4 sm:grid-cols-2 dark:border-gray-700 dark:bg-gray-800/40">
                            <DetailItem label="Status">
                                <StatusBadge tone={STATUS_TONE[detail.status]}>
                                    {STATUS_LABEL[detail.status]}
                                </StatusBadge>
                            </DetailItem>
                            <DetailItem label="Value">
                                {money(detail.totalValue, detail.currencyCode)}
                            </DetailItem>
                            <DetailItem label="Posting date">
                                {detail.postingDate ? formatFicoDate(detail.postingDate) : '—'}
                            </DetailItem>
                            <DetailItem label="Recorded">
                                {formatFicoDate(detail.createdAt)}
                                {detail.consumedAt ? ` · posted ${formatFicoDate(detail.consumedAt)}` : ''}
                            </DetailItem>
                            <DetailItem label="Source document ID">
                                <span className="font-mono text-xs">{detail.documentId}</span>
                            </DetailItem>
                            <DetailItem label="FICO journal">
                                {detail.journal
                                    ? `${detail.journal.documentNumber ?? detail.journal.id} (${detail.journal.status.toLowerCase()})`
                                    : '—'}
                            </DetailItem>
                            <DetailItem label="Accounting effects">
                                {detail.accountingEffects?.length
                                    ? detail.accountingEffects.map(humanize).join(', ')
                                    : '—'}
                            </DetailItem>
                            <DetailItem label="Idempotency key">
                                <span className="font-mono text-xs">{detail.idempotencyKey ?? '—'}</span>
                            </DetailItem>
                        </div>

                        {detail.status === 'FAILED' ? (
                            <section>
                                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-500">
                                    Why it failed
                                </p>
                                <p className="text-sm font-medium text-red-700 dark:text-red-300">
                                    {detail.errorSummary}
                                </p>
                                {detail.lastError && detail.lastError.trim() !== detail.errorSummary ? (
                                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-900 p-3 text-[11px] leading-5 text-gray-100">
                                        {detail.lastError.trim()}
                                    </pre>
                                ) : null}
                            </section>
                        ) : null}

                        <section>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                                Source lines ({detail.lines.length})
                            </p>
                            {detail.lines.length ? (
                                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
                                    {detail.lines.map((line, index) => (
                                        <li
                                            key={`${line.materialId ?? 'line'}-${index}`}
                                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                                        >
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                    {line.movementType ? humanize(line.movementType) : 'Movement'}
                                                    {line.valuationClassCode ? ` · ${line.valuationClassCode}` : ''}
                                                </p>
                                                <p className="truncate font-mono text-[11px] text-gray-500">
                                                    {line.materialId ?? '—'}
                                                </p>
                                            </div>
                                            <p className="text-sm tabular-nums text-gray-700 dark:text-gray-200">
                                                {line.quantity ?? 0} × {Number(line.unitCost ?? 0).toLocaleString()} ={' '}
                                                <span className="font-semibold">
                                                    {Number(line.totalCost ?? 0).toLocaleString(undefined, {
                                                        minimumFractionDigits: 2,
                                                    })}
                                                </span>
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-gray-500">No line details on this event.</p>
                            )}
                        </section>
                    </div>
                )}
            </FormDialog>
        </>
    )
}

export default AccountingEventsPanel
