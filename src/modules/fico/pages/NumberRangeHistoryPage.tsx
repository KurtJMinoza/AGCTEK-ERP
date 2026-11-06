'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import FilterBar from '@/components/shared/FilterBar'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    HiOutlineCalendar,
    HiOutlineClipboardList,
    HiOutlineLockOpen,
    HiOutlinePlus,
} from 'react-icons/hi'
import { notifyError } from '../components/FicoCompanySelect'
import { ficoNumberRangeService } from '../services/ficoService'
import type { FicoNumberRangeLog } from '../types'
import FicoResponsiveTable, { type ColumnDef } from '../components/FicoResponsiveTable'

const ROUTE = '/modules/fico/number-ranges'

const NumberRangeHistoryPage = () => {
    const params = useParams()
    const rangeId = String(params?.id ?? '')
    const [logs, setLogs] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [summary, setSummary] = useState<{
        total: number
        page: number
        pageSize: number
    }>({ total: 0, page: 1, pageSize: 20 })
    const [search, setSearch] = useState('')
    const [assignmentMethod, setAssignmentMethod] = useState('')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [fiscalYearId, setFiscalYearId] = useState('')

    const loadHistory = useCallback(() => {
        if (!rangeId) return
        setLoading(true)
        ficoNumberRangeService
            .history({
                numberRangeId: rangeId,
                companyId: undefined,
                assignmentMethod: assignmentMethod || undefined,
                fiscalYearId: fiscalYearId || undefined,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
                page: summary.page,
                pageSize: summary.pageSize,
            })
            .then(({ items, total }) => {
                setLogs(items)
                setSummary((prev) => ({
                    ...prev,
                    total,
                }))
            })
            .catch((error) =>
                notifyError(error, 'Unable to load assignment history.'),
            )
            .finally(() => setLoading(false))
    }, [
        rangeId,
        assignmentMethod,
        fiscalYearId,
        dateFrom,
        dateTo,
        summary.page,
        summary.pageSize,
    ])

    useEffect(() => {
        loadHistory()
    }, [loadHistory])

    const columns = useMemo<ColumnDef<any>[]>(
        () => [
            {
                header: 'Document Number',
                accessorKey: 'generatedNumber',
                cell: ({ row }) => (
                    <span className="text-sm font-mono text-gray-900 dark:text-gray-100">
                        {row.original.generatedNumber}
                    </span>
                ),
            },
            {
                header: 'Numeric Sequence',
                accessorKey: 'numericSequence',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-900 dark:text-gray-100 tabular-nums">
                        {row.original.numericSequence}
                    </span>
                ),
            },
            {
                header: 'Assignment Method',
                accessorKey: 'assignmentMethod',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-900 dark:text-gray-100 capitalize">
                        {row.original.assignmentMethod}
                    </span>
                ),
            },
            {
                header: 'Document Reference',
                accessorKey: 'documentReference',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-900 dark:text-gray-100 truncate max-w-[200px]">
                        {row.original.documentReference || '—'}
                    </span>
                ),
            },
            {
                header: 'Assigned By',
                accessorKey: 'assignedBy',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                        {row.original.assignedBy || '—'}
                    </span>
                ),
            },
            {
                header: 'Assigned At',
                accessorKey: 'assignedAt',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                        {new Date(row.original.assignedAt).toLocaleDateString()}
                    </span>
                ),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Number Range Assignment History"
                description="Read-only audit trail of all numbers issued from this range."
                breadcrumbs={buildErpBreadcrumbs(`${ROUTE}/${rangeId}/history`, {
                    detailLabel: 'Assignment History',
                })}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Link
                            href={`${ROUTE}/${rangeId}`}
                            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary hover:underline rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
                        >
                            <HiOutlineLockOpen className="w-4 h-4" />{' '}
                            Back to Range
                        </Link>
                        <Link
                            href={ROUTE}
                            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary hover:underline rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
                        >
                            <HiOutlinePlus className="w-4 h-4" />{' '}
                            Back to Ranges
                        </Link>
                    </div>
                }
            />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                <StatCard
                    label="Total Assignments"
                    value={summary.total}
                    tone="default"
                />
                <StatCard
                    label="Current Page"
                    value={summary.page}
                    tone="info"
                />
                <StatCard
                    label="Page Size"
                    value={summary.pageSize}
                    tone="default"
                />
                <StatCard
                    label="Records Shown"
                    value={logs.length}
                    tone="default"
                />
            </div>

            <AdaptiveCard className="mb-6">
                <FilterBar
                    fields={[
                        {
                            key: 'assignmentMethod',
                            label: 'Assignment Method',
                            kind: 'select',
                            value: assignmentMethod,
                            options: [
                                { value: '', label: 'All' },
                                { value: 'INTERNAL', label: 'Internal' },
                                { value: 'EXTERNAL', label: 'External' },
                            ],
                            onChange: setAssignmentMethod,
                        },
                        {
                            key: 'dateFrom',
                            label: 'From Date',
                            kind: 'text',
                            inputType: 'date',
                            value: dateFrom,
                            onChange: setDateFrom,
                        },
                        {
                            key: 'dateTo',
                            label: 'To Date',
                            kind: 'text',
                            inputType: 'date',
                            value: dateTo,
                            onChange: setDateTo,
                        },
                    ]}
                    chips={[
                        ...(assignmentMethod
                            ? [
                                  {
                                      key: 'assignmentMethod',
                                      label: `Method: ${assignmentMethod}`,
                                      onRemove: () => setAssignmentMethod(''),
                                  },
                              ]
                            : []),
                        ...(dateFrom
                            ? [
                                  {
                                      key: 'dateFrom',
                                      label: `From: ${dateFrom}`,
                                      onRemove: () => setDateFrom(''),
                                  },
                              ]
                            : []),
                        ...(dateTo
                            ? [
                                  {
                                      key: 'dateTo',
                                      label: `To: ${dateTo}`,
                                      onRemove: () => setDateTo(''),
                                  },
                              ]
                            : []),
                    ]}
                    onClear={() => {
                        setAssignmentMethod('')
                        setDateFrom('')
                        setDateTo('')
                    }}
                    actions={
                        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                            <Button
                                onClick={loadHistory}
                                loading={loading}
                                variant="solid"
                                className="w-full sm:w-auto"
                            >
                                <HiOutlineClipboardList className="w-4 h-4 mr-1.5" />
                                Apply filters
                            </Button>
                            <Button
                                variant="default"
                                onClick={() => {
                                    setAssignmentMethod('')
                                    setDateFrom('')
                                    setDateTo('')
                                    setFiscalYearId('')
                                    loadHistory()
                                }}
                                className="w-full sm:w-auto"
                            >
                                Reset filters
                            </Button>
                        </div>
                    }
                />
                <FicoResponsiveTable<any>
                    columns={columns}
                    data={logs}
                    compact
                    loading={loading}
                    noData={!loading && !logs.length}
                    getRowId={(row) => row.id}
                    tableMinWidthClass="min-w-[950px]"
                    hidePagination
                    instanceId="fico-number-range-history"
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default NumberRangeHistoryPage
