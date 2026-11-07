'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import FilterBar, { type FilterChip } from '@/components/shared/FilterBar'
import Button from '@/components/ui/Button'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    HiOutlineClipboardList,
    HiOutlineRefresh,
} from 'react-icons/hi'
import { notifyError } from '../components/FicoCompanySelect'
import { ficoTaxService } from '../services/ficoService'
import type {
    FicoTaxCode,
    FicoTaxCodeHistoryItem,
    FicoTaxCodeHistoryResponse,
} from '../types'
import FicoResponsiveTable, {
    type ColumnDef,
} from '../components/FicoResponsiveTable'
import { FicoTwoLineCell } from '../components/ficoTableUi'
import StatusBadge from '@/components/shared/StatusBadge'
import {
    AUDIT_ACTION_LABELS,
    AUDIT_ACTION_TONES,
    TAX_CODE_ROUTE,
    taxCodeHref,
} from '../components/taxCodeUi'

const FIELD_LABELS: Record<string, string> = {
    code: 'Tax code',
    name: 'Name',
    description: 'Description',
    taxCategory: 'Tax category',
    taxType: 'Tax type',
    taxJurisdiction: 'Jurisdiction',
    countryCode: 'Country code',
    calculationMethod: 'Calculation method',
    rateUnit: 'Rate unit',
    roundingMethod: 'Rounding method',
    decimalPrecision: 'Decimal precision',
    roundingLevel: 'Rounding level',
    calculationPriority: 'Calculation priority',
    isSalesApplicable: 'Sales applicable',
    isPurchaseApplicable: 'Purchase applicable',
    isServiceApplicable: 'Service applicable',
    isInventoryApplicable: 'Inventory applicable',
    isRecoverable: 'Recoverable',
    inputTaxGlAccountId: 'Input tax account',
    outputTaxGlAccountId: 'Output tax account',
    withholdingPayableGlAccountId: 'Withholding payable account',
    withholdingReceivableGlAccountId: 'Withholding receivable account',
    nonRecoverableTaxGlAccountId: 'Non-recoverable tax account',
    status: 'Status',
    remarks: 'Remarks',
    rate: 'Rate',
    effectiveFrom: 'Effective from',
    effectiveTo: 'Effective to',
}

function auditActionLabel(action: string): string {
    return AUDIT_ACTION_LABELS[action] ?? action.replace(/_/g, ' ')
}

function formatDateTime(value?: string | null): string {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

function displayValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
}

type ChangeLine = {
    key: string
    label: string
    previous: string
    next: string
    changed: boolean
}

function changeLines(item: FicoTaxCodeHistoryItem): ChangeLine[] {
    const previous = item.previousValues ?? {}
    const next = item.newValues ?? {}
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)])
    return [...keys].map((key) => ({
        key,
        label: FIELD_LABELS[key] ?? key,
        previous: displayValue(previous[key]),
        next: displayValue(next[key]),
        changed:
            JSON.stringify(previous[key] ?? null) !==
            JSON.stringify(next[key] ?? null),
    }))
}

function changedSummary(item: FicoTaxCodeHistoryItem): string {
    const lines = changeLines(item)
    if (!item.previousValues && !item.newValues) return 'No value changes'
    if (!item.previousValues) {
        return `Created · ${lines.length} field${lines.length === 1 ? '' : 's'} recorded`
    }
    if (!item.newValues) return 'Removed'
    const changed = lines.filter((line) => line.changed)
    if (!changed.length) return 'No field changes'
    return changed.map((line) => line.label).join(', ')
}

const TaxCodeAuditHistoryPage = () => {
    const params = useParams()
    const router = useRouter()
    const idParam = params?.id
    const taxCodeId = Array.isArray(idParam) ? idParam[0] : idParam

    const [taxCode, setTaxCode] = useState<FicoTaxCode | null>(null)
    const [entries, setEntries] = useState<FicoTaxCodeHistoryItem[]>([])
    const [loading, setLoading] = useState(true)
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(25)
    const [actions, setActions] = useState<string[]>([])
    const [actors, setActors] = useState<
        NonNullable<FicoTaxCodeHistoryResponse['actors']>
    >([])

    const [search, setSearch] = useState('')
    const [action, setAction] = useState('')
    const [actorId, setActorId] = useState('')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')

    const loadTaxCode = useCallback(async () => {
        if (!taxCodeId) return
        try {
            const detail = await ficoTaxService.get(taxCodeId)
            setTaxCode(detail)
        } catch (error) {
            notifyError(error, 'Unable to load the tax code.')
        }
    }, [taxCodeId])

    const loadHistory = useCallback(() => {
        if (!taxCodeId) return
        setLoading(true)
        ficoTaxService
            .history(taxCodeId, {
                search: search.trim() || undefined,
                action: action || undefined,
                actorId: actorId || undefined,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
                page,
                pageSize,
            })
            .then((response) => {
                setEntries(response.items)
                setTotal(response.total)
                setActions(response.actions ?? [])
                setActors(response.actors ?? [])
            })
            .catch((error) =>
                notifyError(error, 'Unable to load the tax code audit history.'),
            )
            .finally(() => setLoading(false))
    }, [
        taxCodeId,
        search,
        action,
        actorId,
        dateFrom,
        dateTo,
        page,
        pageSize,
    ])

    useEffect(() => {
        // Initial data fetch; loading state is updated after the request resolves.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadTaxCode()
    }, [loadTaxCode])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadHistory()
    }, [loadHistory])

    const actionOptions = useMemo(
        () =>
            (actions.length ? actions : Object.keys(AUDIT_ACTION_LABELS)).map(
                (value) => ({
                    value,
                    label: auditActionLabel(value),
                }),
            ),
        [actions],
    )

    const columns = useMemo<ColumnDef<FicoTaxCodeHistoryItem>[]>(
        () => [
            {
                header: 'When',
                accessorKey: 'createdAt',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-xs text-gray-900 dark:text-gray-100">
                        {formatDateTime(row.original.createdAt)}
                    </span>
                ),
            },
            {
                header: 'Action',
                accessorKey: 'action',
                cell: ({ row }) => (
                    <StatusBadge
                        tone={
                            AUDIT_ACTION_TONES[row.original.action] ?? 'default'
                        }
                    >
                        {auditActionLabel(row.original.action)}
                    </StatusBadge>
                ),
            },
            {
                header: 'Performer',
                accessorKey: 'performer',
                cell: ({ row }) => {
                    const performer = row.original.performer
                    if (!performer) {
                        return (
                            <span className="text-xs text-gray-400">
                                System / unknown
                            </span>
                        )
                    }
                    return (
                        <FicoTwoLineCell
                            primary={
                                performer.name ||
                                performer.userName ||
                                performer.email ||
                                'Unknown user'
                            }
                            secondary={
                                performer.email ??
                                performer.userName ??
                                undefined
                            }
                        />
                    )
                },
            },
            {
                header: 'Change',
                accessorKey: 'newValues',
                cell: ({ row }) => (
                    <span className="line-clamp-2 max-w-[22rem] text-xs text-gray-600 dark:text-gray-300">
                        {changedSummary(row.original)}
                    </span>
                ),
            },
            {
                header: 'Reason',
                accessorKey: 'reason',
                cell: ({ row }) => (
                    <span className="line-clamp-2 max-w-[18rem] text-xs text-gray-600 dark:text-gray-300">
                        {row.original.reason || '—'}
                    </span>
                ),
            },
        ],
        [],
    )

    const hasFilters = Boolean(
        search || action || actorId || dateFrom || dateTo,
    )

    if (!taxCodeId) {
        return (
            <PageContainer>
                <PageHeader
                    title="Tax Code Audit History"
                    breadcrumbs={buildErpBreadcrumbs(TAX_CODE_ROUTE)}
                />
                <AdaptiveCard>
                    <p className="py-10 text-center text-sm text-gray-500">
                        No tax code was selected.
                    </p>
                </AdaptiveCard>
            </PageContainer>
        )
    }

    return (
        <PageContainer>
            <PageHeader
                title="Tax Code Audit History"
                description={
                    taxCode
                        ? `${taxCode.code} — ${taxCode.name}. Read-only record of tax code, rate, activation, and duplication changes.`
                        : 'Read-only record of tax code changes.'
                }
                breadcrumbs={buildErpBreadcrumbs(
                    taxCodeHref(taxCodeId, 'history'),
                    { detailLabel: taxCode?.code ?? 'Audit history' },
                )}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="plain"
                            onClick={() => router.push(taxCodeHref(taxCodeId))}
                        >
                            Back to details
                        </Button>
                        <Button
                            variant="default"
                            onClick={() => {
                                loadTaxCode()
                                loadHistory()
                            }}
                            disabled={loading}
                        >
                            <HiOutlineRefresh className="mr-1.5 h-4 w-4" />
                            Refresh
                        </Button>
                    </div>
                }
            />

            <AdaptiveCard className="mb-6">
                <FilterBar
                    fields={[
                        {
                            key: 'search',
                            label: 'Search',
                            kind: 'text',
                            inputType: 'search',
                            value: search,
                            placeholder: 'Action, reason, or entity',
                            silent: true,
                            onChange: (value) => {
                                setSearch(value)
                                setPage(1)
                            },
                        },
                        {
                            key: 'action',
                            label: 'Action',
                            kind: 'select',
                            value: action,
                            options: actionOptions,
                            onChange: (value) => {
                                setAction(value)
                                setPage(1)
                            },
                        },
                        {
                            key: 'actorId',
                            label: 'Performer',
                            kind: 'select',
                            value: actorId,
                            options: actors.map((actor) => ({
                                value: actor.id,
                                label:
                                    actor.name ||
                                    actor.userName ||
                                    actor.email ||
                                    actor.id,
                            })),
                            onChange: (value) => {
                                setActorId(value)
                                setPage(1)
                            },
                        },
                        {
                            key: 'dateFrom',
                            label: 'From',
                            kind: 'text',
                            inputType: 'date',
                            value: dateFrom,
                            onChange: (value) => {
                                setDateFrom(value)
                                setPage(1)
                            },
                        },
                        {
                            key: 'dateTo',
                            label: 'To',
                            kind: 'text',
                            inputType: 'date',
                            value: dateTo,
                            onChange: (value) => {
                                setDateTo(value)
                                setPage(1)
                            },
                        },
                    ]}
                    chips={[
                        search
                            ? {
                                  key: 'search',
                                  label: `Search: ${search}`,
                                  onRemove: () => {
                                      setSearch('')
                                      setPage(1)
                                  },
                              }
                            : null,
                        action
                            ? {
                                  key: 'action',
                                  label: `Action: ${auditActionLabel(action)}`,
                                  onRemove: () => {
                                      setAction('')
                                      setPage(1)
                                  },
                              }
                            : null,
                        actorId
                            ? {
                                  key: 'actorId',
                                  label: `Performer: ${
                                      actors.find(
                                          (actor) => actor.id === actorId,
                                      )?.name ??
                                      actors.find(
                                          (actor) => actor.id === actorId,
                                      )?.email ??
                                      actorId
                                  }`,
                                  onRemove: () => {
                                      setActorId('')
                                      setPage(1)
                                  },
                              }
                            : null,
                        dateFrom
                            ? {
                                  key: 'dateFrom',
                                  label: `From: ${dateFrom}`,
                                  onRemove: () => {
                                      setDateFrom('')
                                      setPage(1)
                                  },
                              }
                            : null,
                        dateTo
                            ? {
                                  key: 'dateTo',
                                  label: `To: ${dateTo}`,
                                  onRemove: () => {
                                      setDateTo('')
                                      setPage(1)
                                  },
                              }
                            : null,
                    ].filter(Boolean) as FilterChip[]}
                    onClear={
                        hasFilters
                            ? () => {
                                  setSearch('')
                                  setAction('')
                                  setActorId('')
                                  setDateFrom('')
                                  setDateTo('')
                                  setPage(1)
                              }
                            : undefined
                    }
                />
            </AdaptiveCard>

            <FicoResponsiveTable<FicoTaxCodeHistoryItem>
                title="Tax Code Audit Log"
                columns={columns}
                data={entries}
                loading={loading}
                pagingData={{ pageIndex: page, pageSize, total }}
                onPaginationChange={setPage}
                onSelectChange={(size) => {
                    setPageSize(size)
                    setPage(1)
                }}
                getRowId={(row) => row.id}
                renderSubRow={(row) => (
                    <AuditEntryDetail entry={row} />
                )}
                tableMinWidthClass="min-w-[860px]"
                noData={!loading && !entries.length}
                mobile={{
                    title: (row) => auditActionLabel(row.action),
                    subtitle: (row) =>
                        `${
                            row.performer?.name ||
                            row.performer?.userName ||
                            row.performer?.email ||
                            'System / unknown'
                        } · ${formatDateTime(row.createdAt)}`,
                    fields: [
                        {
                            label: 'Change',
                            value: (row) => changedSummary(row),
                        },
                        {
                            label: 'Reason',
                            value: (row) => row.reason || '—',
                        },
                    ],
                }}
            />
        </PageContainer>
    )
}

function AuditEntryDetail({ entry }: { entry: FicoTaxCodeHistoryItem }) {
    const lines = changeLines(entry).filter((line) => line.changed)
    const metadata =
        entry.metadata && Object.keys(entry.metadata).length
            ? entry.metadata
            : null

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <HiOutlineClipboardList className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                    {auditActionLabel(entry.action)}
                </span>
                <span className="text-[11px] text-gray-500">
                    {formatDateTime(entry.createdAt)}
                </span>
                {entry.entityType ? (
                    <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        {entry.entityType}
                    </span>
                ) : null}
            </div>

            {entry.reason ? (
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        Reason
                    </p>
                    <p className="mt-0.5 text-sm text-gray-900 dark:text-gray-100">
                        {entry.reason}
                    </p>
                </div>
            ) : null}

            {lines.length ? (
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-700">
                                <th className="pb-2 pr-4 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                    Field
                                </th>
                                <th className="pb-2 pr-4 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                    Previous
                                </th>
                                <th className="pb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                    New
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {lines.map((line) => (
                                <tr
                                    key={line.key}
                                    className="border-b border-gray-200/60 last:border-0 dark:border-gray-800/60"
                                >
                                    <td className="py-1.5 pr-4 text-xs font-medium text-gray-700 dark:text-gray-200">
                                        {line.label}
                                    </td>
                                    <td className="py-1.5 pr-4 font-mono text-xs text-gray-500 dark:text-gray-400">
                                        {line.previous}
                                    </td>
                                    <td className="py-1.5 font-mono text-xs text-gray-900 dark:text-gray-100">
                                        {line.next}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p className="text-xs text-gray-500">
                    No changed field values were recorded for this entry.
                </p>
            )}

            {metadata ? (
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        Metadata
                    </p>
                    <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-gray-100 p-3 text-[11px] leading-relaxed text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                        {JSON.stringify(metadata, null, 2)}
                    </pre>
                </div>
            ) : null}
        </div>
    )
}

export default TaxCodeAuditHistoryPage
