'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import FilterBar, { type FilterChip } from '@/components/shared/FilterBar'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Dropdown from '@/components/ui/Dropdown'
import EllipsisButton from '@/components/shared/EllipsisButton'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import usePermissions from '@/utils/hooks/usePermissions'
import {
    HiOutlineClipboardList,
    HiOutlineLockClosed,
    HiOutlineLockOpen,
    HiOutlinePlus,
    HiOutlineRefresh,
    HiOutlineViewList,
} from 'react-icons/hi'
import {
    notifyError,
    notifySuccess,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import {
    ficoJournalService,
} from '../services/ficoService'
import type {
    FicoJournalEntry,
    FicoJournalEntryList,
} from '../types'
import FicoResponsiveTable, { type ColumnDef } from '../components/FicoResponsiveTable'
import { FicoCodeCell, FicoStatusCell, FicoBadgeTone, formatFicoDate } from '../components/ficoTableUi'

const JOURNAL_ROUTE = '/modules/fico/journal-entries'

const APPROVAL_STATUS_TONES: Record<string, FicoBadgeTone> = {
    DRAFT: 'default',
    PENDING_APPROVAL: 'info',
    APPROVED: 'success',
    POSTED: 'success',
    REJECTED: 'danger',
    REVERSED: 'warning',
}

const EMPTY_LIST: FicoJournalEntryList = {
    items: [],
    total: 0,
    page: 1,
    pageSize: 25,
    totalPages: 0,
}

const JournalEntriesPage = () => {
    const router = useRouter()
    const {
        companies,
        companyId,
        setCompanyId,
        loading: companyLoading,
    } = useFicoCompanies()
    const { can } = usePermissions()
    const canCreate = can('fico.journal-entries', 'create')
    const canUpdate = can('fico.journal-entries', 'update')

    const [journalEntries, setJournalEntries] = useState<FicoJournalEntry[]>([])
    const [list, setList] = useState<FicoJournalEntryList>(EMPTY_LIST)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(25)

    const [search, setSearch] = useState('')
    const [status, setStatus] = useState('')

    const [actionTarget, setActionTarget] = useState<{
        action: 'SUBMIT' | 'APPROVE' | 'REJECT' | 'RESUBMIT' | 'POST'
        record: FicoJournalEntry
    } | null>(null)
    const [actionReason, setActionReason] = useState('')
    const [saving, setSaving] = useState(false)

    const resetPage = () => setPage(1)

    const load = useCallback(() => {
        if (!companyId) {
            setJournalEntries([])
            setTotal(0)
            setList(EMPTY_LIST)
            return
        }
        setLoading(true)
        setError(null)
        ficoJournalService
            .list({
                companyId,
                search: search.trim() || undefined,
                status: status || undefined,
                page,
                pageSize,
            })
            .then((result) => {
                setJournalEntries(result.items)
                setTotal(result.total)
                setList(result)
            })
            .catch((loadError) => {
                setError(
                    (loadError as { message?: string })?.message ??
                        'Unable to load journal entries.',
                )
                notifyError(loadError, 'Unable to load journal entries.')
            })
            .finally(() => setLoading(false))
    }, [companyId, search, status, page, pageSize])

    useEffect(() => {
        load()
    }, [load])

    const submitAction = async () => {
        if (!actionTarget) return
        setSaving(true)
        try {
            const payload =
                actionReason.trim() ? { reason: actionReason.trim() } : {}
            switch (actionTarget.action) {
                case 'SUBMIT':
                    await ficoJournalService.submit(
                        actionTarget.record.id,
                        payload.reason,
                    )
                    notifySuccess('Journal entry submitted for approval.')
                    break
                case 'APPROVE':
                    await ficoJournalService.approve(
                        actionTarget.record.id,
                        payload.reason,
                    )
                    notifySuccess('Journal entry approved.')
                    break
                case 'REJECT':
                    await ficoJournalService.reject(
                        actionTarget.record.id,
                        payload.reason ?? '',
                    )
                    notifySuccess('Journal entry rejected.')
                    break
                case 'RESUBMIT':
                    await ficoJournalService.resubmit(actionTarget.record.id)
                    notifySuccess('Journal entry resubmitted for approval.')
                    break
                case 'POST':
                    await ficoJournalService.post(actionTarget.record.id)
                    notifySuccess('Journal entry posted to the general ledger.')
                    break
            }
            setActionTarget(null)
            setActionReason('')
            load()
        } catch (actionError) {
            notifyError(
                actionError,
                'Unable to process the journal entry action.',
            )
        } finally {
            setSaving(false)
        }
    }

    const handleSort = () => {
        resetPage()
    }

    const columns = useMemo<ColumnDef<FicoJournalEntry>[]>(
        () => [
            {
                header: 'Journal Entry',
                accessorKey: 'documentNumber',
                cell: ({ row }) => (
                    <FicoCodeCell
                        icon="posting"
                        code={row.original.documentNumber ?? '—'}
                        name={row.original.description}
                        onClick={() =>
                            router.push(`${JOURNAL_ROUTE}/${row.original.id}`)
                        }
                    />
                ),
            },
            {
                header: 'Posting Date',
                accessorKey: 'postingDate',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">
                        {formatFicoDate(row.original.postingDate)}
                    </span>
                ),
            },
            {
                header: 'Description',
                accessorKey: 'description',
                cell: ({ row }) => (
                    <span className="line-clamp-1 max-w-[20rem] text-sm text-gray-700 dark:text-gray-300">
                        {row.original.description ?? '—'}
                    </span>
                ),
            },
            {
                header: 'Document Type',
                accessorKey: 'documentType',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                        {row.original.documentType}
                    </span>
                ),
            },
            {
                header: 'Amount',
                accessorKey: 'totalAmount',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-900 dark:text-gray-100 font-mono">
                        {row.original.totalAmount} {row.original.currencyCode}
                    </span>
                ),
            },
            {
                header: 'Approval',
                accessorKey: 'approvalStatus',
                enableSorting: false,
                cell: ({ row }) => (
                    <FicoStatusCell
                        status={row.original.approvalStatus}
                        map={APPROVAL_STATUS_TONES}
                    />
                ),
            },
            {
                header: 'Status',
                accessorKey: 'status',
                cell: ({ row }) => (
                    <FicoStatusCell
                        status={row.original.status}
                        map={
                            {
                                ACTIVE: 'success' as FicoBadgeTone,
                                INACTIVE: 'warning' as FicoBadgeTone,
                            }
                        }
                    />
                ),
            },
            {
                header: 'Posted At',
                accessorKey: 'postedAt',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-500 whitespace-nowrap">
                        {row.original.postedAt
                            ? formatFicoDate(row.original.postedAt)
                            : '—'}
                    </span>
                ),
            },
            {
                header: '',
                id: 'actions',
                size: 60,
                enableSorting: false,
                cell: ({ row }) => {
                    const record = row.original
                    return (
                        <Dropdown
                            renderTitle={<EllipsisButton />}
                            placement="bottom-end"
                        >
                            <Dropdown.Item
                                eventKey="view"
                                onClick={() =>
                                    router.push(`${JOURNAL_ROUTE}/${record.id}`)
                                }
                            >
                                <HiOutlineViewList className="text-base" />
                                <span>View</span>
                            </Dropdown.Item>
                            {canUpdate && record.approvalStatus === 'DRAFT' ? (
                                <Dropdown.Item
                                    eventKey="submit"
                                    onClick={() => {
                                        setActionTarget({
                                            action: 'SUBMIT',
                                            record,
                                        })
                                        setActionReason('')
                                    }}
                                >
                                    <HiOutlineClipboardList className="text-base" />
                                    <span>Submit for approval</span>
                                </Dropdown.Item>
                            ) : null}
                            {canUpdate &&
                            record.approvalStatus === 'PENDING_APPROVAL' ? (
                                <>
                                    <Dropdown.Item
                                        eventKey="approve"
                                        onClick={() => {
                                            setActionTarget({
                                                action: 'APPROVE',
                                                record,
                                            })
                                            setActionReason('')
                                        }}
                                    >
                                        <HiOutlineLockOpen className="text-base" />
                                        <span>Approve</span>
                                    </Dropdown.Item>
                                    <Dropdown.Item
                                        eventKey="reject"
                                        onClick={() => {
                                            setActionTarget({
                                                action: 'REJECT',
                                                record,
                                            })
                                            setActionReason('')
                                        }}
                                    >
                                        <HiOutlineLockClosed className="text-base" />
                                        <span>Reject</span>
                                    </Dropdown.Item>
                                </>
                            ) : null}
                            {canUpdate &&
                            record.approvalStatus === 'REJECTED' ? (
                                <Dropdown.Item
                                    eventKey="resubmit"
                                    onClick={() => {
                                        setActionTarget({
                                            action: 'RESUBMIT',
                                            record,
                                        })
                                        setActionReason('')
                                    }}
                                >
                                    <HiOutlineClipboardList className="text-base" />
                                    <span>Resubmit for approval</span>
                                </Dropdown.Item>
                            ) : null}
                            {canUpdate &&
                            record.approvalStatus === 'APPROVED' ? (
                                <Dropdown.Item
                                    eventKey="post"
                                    onClick={() => {
                                        setActionTarget({
                                            action: 'POST',
                                            record,
                                        })
                                        setActionReason('')
                                    }}
                                >
                                    <HiOutlinePlus className="text-base" />
                                    <span>Post to GL</span>
                                </Dropdown.Item>
                            ) : null}
                        </Dropdown>
                    )
                },
            },
        ],
        [router, canUpdate],
    )

    const hasFilters = Boolean(search || status)

    const clearFilters = () => {
        setSearch('')
        setStatus('')
        resetPage()
    }

    return (
        <PageContainer>
            <PageHeader
                title="Journal Entries"
                description="Create, approve, post, and reverse accounting journal entries. Posted entries update the general ledger and are immutable."
                breadcrumbs={buildErpBreadcrumbs(JOURNAL_ROUTE)}
                actions={
                    canCreate ? (
                        <Button
                            variant="solid"
                            onClick={() => router.push(`${JOURNAL_ROUTE}/create`)}
                            disabled={companyLoading}
                        >
                            <HiOutlinePlus className="mr-1.5 h-4 w-4" />
                            Create Journal Entry
                        </Button>
                    ) : null
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Total Entries" value={list.total} tone="default" />
                <StatCard label="Drafts" value={journalEntries.filter((e) => e.approvalStatus === 'DRAFT').length} tone="default" />
                <StatCard label="Pending Approval" value={journalEntries.filter((e) => e.approvalStatus === 'PENDING_APPROVAL').length} tone="info" />
                <StatCard label="Posted" value={journalEntries.filter((e) => e.status === 'POSTED').length} tone="success" />
            </div>

            <AdaptiveCard className="mb-6">
                <FilterBar
                    fields={[
                        {
                            key: 'companyId',
                            label: 'Company',
                            kind: 'select',
                            value: companyId,
                            options: companies.map((company) => ({
                                value: company.id,
                                label: `${company.code} — ${company.name}`,
                            })),
                            onChange: (value) => {
                                setCompanyId(value)
                                resetPage()
                            },
                        },
                        {
                            key: 'search',
                            label: 'Search',
                            kind: 'text',
                            inputType: 'search',
                            value: search,
                            placeholder: 'Document number or description',
                            onChange: (value) => {
                                setSearch(value)
                                resetPage()
                            },
                            silent: true,
                        },
                        {
                            key: 'status',
                            label: 'GL Status',
                            kind: 'select',
                            value: status,
                            options: [
                                { value: 'DRAFT', label: 'Draft' },
                                { value: 'POSTED', label: 'Posted' },
                                { value: 'REVERSED', label: 'Reversed' },
                            ],
                            onChange: (value) => {
                                setStatus(value)
                                resetPage()
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
                                      resetPage()
                                  },
                              }
                            : null,
                        status
                            ? {
                                  key: 'status',
                                  label: `Status: ${status}`,
                                  onRemove: () => {
                                      setStatus('')
                                      resetPage()
                                  },
                              }
                            : null,
                    ].filter(Boolean) as FilterChip[]}
                    onClear={hasFilters ? clearFilters : undefined}
                    actions={
                        <Button
                            size="sm"
                            variant="plain"
                            onClick={load}
                            disabled={loading}
                        >
                            <HiOutlineRefresh className="mr-1 h-4 w-4" />
                            Refresh
                        </Button>
                    }
                />
            </AdaptiveCard>

            {error ? (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                    {error}
                </div>
            ) : null}

            <FicoResponsiveTable<FicoJournalEntry>
                title="Journal Entries"
                columns={columns}
                data={journalEntries}
                loading={loading}
                pagingData={{ pageIndex: page, pageSize, total }}
                onPaginationChange={setPage}
                onSelectChange={(size) => {
                    setPageSize(size)
                    setPage(1)
                }}
                onSort={handleSort}
                noData={!loading && !journalEntries.length}
                fit
                mobile={{
                    title: (row) =>
                        `${row.documentNumber ?? '—'} — ${row.description ?? ''}`,
                    subtitle: (row) =>
                        `${row.currencyCode} ${
                            row.totalAmount
                        } · ${row.approvalStatus.replace(/_/g, ' ')}`,
                    status: (row) => ({
                        text: row.approvalStatus,
                        tone:
                            (APPROVAL_STATUS_TONES[row.approvalStatus] ??
                                'default') as never,
                    }),
                    fields: [
                        {
                            label: 'Posting date',
                            value: (row) => formatFicoDate(row.postingDate),
                        },
                        {
                            label: 'Document type',
                            value: (row) => row.documentType,
                        },
                    ],
                    onPress: (row) =>
                        router.push(`${JOURNAL_ROUTE}/${row.id}`),
                }}
            />

            <ConfirmDialog
                isOpen={Boolean(actionTarget)}
                type={
                    actionTarget?.action === 'REJECT'
                        ? 'warning'
                        : actionTarget?.action === 'POST'
                          ? 'success'
                          : 'info'
                }
                title={
                    actionTarget?.action === 'SUBMIT'
                        ? 'Submit for Approval'
                        : actionTarget?.action === 'APPROVE'
                          ? 'Approve Journal Entry'
                          : actionTarget?.action === 'REJECT'
                            ? 'Reject Journal Entry'
                            : actionTarget?.action === 'RESUBMIT'
                              ? 'Resubmit for Approval'
                              : 'Post to General Ledger'
                }
                confirmText={
                    actionTarget?.action === 'POST' ? 'Post' : 'Confirm'
                }
                confirmButtonProps={{ loading: saving }}
                onConfirm={submitAction}
                onCancel={() => {
                    setActionTarget(null)
                    setActionReason('')
                }}
            >
                <div className="space-y-3">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        {actionTarget
                            ? `${actionTarget.record.documentNumber ?? '—'} — ${
                                  actionTarget.record.description ?? ''
                              }`
                            : ''}
                    </p>
                    <p className="text-sm text-gray-500">
                        {actionTarget?.action === 'SUBMIT'
                            ? 'Submitting sends the entry to an approver. It cannot be edited after submission.'
                            : actionTarget?.action === 'APPROVE'
                              ? 'Approval authorizes posting to the general ledger.'
                              : actionTarget?.action === 'REJECT'
                                ? 'Rejection returns the entry to the preparer for correction.'
                                : actionTarget?.action === 'RESUBMIT'
                                  ? 'Resubmission places the entry back into the approval queue.'
                                  : 'Posting writes the entry to the general ledger. Posted entries are immutable.'}
                    </p>
                    {(actionTarget?.action === 'SUBMIT' ||
                        actionTarget?.action === 'APPROVE' ||
                        actionTarget?.action === 'REJECT') && (
                        <FormItem label="Reason (optional)">
                            <Input
                                textArea
                                rows={2}
                                maxLength={500}
                                value={actionReason}
                                placeholder="Explain the action"
                                onChange={(event) =>
                                    setActionReason(event.target.value)
                                }
                            />
                        </FormItem>
                    )}
                </div>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default JournalEntriesPage
