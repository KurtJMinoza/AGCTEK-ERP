'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import FicoResponsiveTable, { type ColumnDef } from '../FicoResponsiveTable'
import { FicoStatusCell, FicoTwoLineCell, formatFicoDate } from '../ficoTableUi'
import { notifyError, notifySuccess } from '../FicoCompanySelect'
import AccountDeterminationPanel from '../AccountDeterminationPanel'
import { ficoAccountDeterminationRuleService } from '../../services/accountDeterminationService'
import { ficoAccountingEventService } from '../../services/ficoService'
import type {
    FicoDeterminationException,
    FicoDeterminationModuleCoverage,
    TransactionKeyCatalogRow,
} from '../../accountDeterminationTypes'

export function DeterminationTransactionKeysPanel({
    catalog,
    loading,
}: {
    catalog: TransactionKeyCatalogRow[]
    loading?: boolean
}) {
    const columns = useMemo<ColumnDef<TransactionKeyCatalogRow>[]>(
        () => [
            {
                header: 'Key',
                id: 'code',
                cell: ({ row }) => (
                    <span className="font-mono text-xs font-semibold text-gray-800 dark:text-gray-100">
                        {row.original.code}
                    </span>
                ),
            },
            {
                header: 'Accounting purpose',
                id: 'name',
                cell: ({ row }) => (
                    <FicoTwoLineCell
                        primary={row.original.name}
                        secondary={row.original.accountingCategory}
                    />
                ),
            },
            {
                header: 'Owner',
                id: 'module',
                cell: ({ row }) => (
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                        {row.original.owningModule}
                    </span>
                ),
            },
            {
                header: 'Integration',
                id: 'integration',
                cell: ({ row }) => (
                    <FicoStatusCell status={row.original.integrationStatus} />
                ),
            },
        ],
        [],
    )

    return (
        <div className="mt-4">
            <p className="mb-3 text-xs text-gray-500">
                LIVE keys resolve during automatic posting today. CONFIG_ONLY keys can be
                configured and simulated, but no operational module posts them yet.
            </p>
            <FicoResponsiveTable
                columns={columns}
                data={catalog}
                compact
                loading={loading}
                noData={!loading && !catalog.length}
                hidePagination
                getRowId={(row) => row.code}
                instanceId="fico-determination-transaction-keys"
            />
        </div>
    )
}

const CATEGORY_OPTIONS = [
    { value: '', label: 'All exception categories' },
    { value: 'MISSING_TRANSACTION_KEY', label: 'Missing transaction key' },
    { value: 'MISSING_DETERMINATION_RULE', label: 'Missing determination rule' },
    { value: 'AMBIGUOUS_RULE', label: 'Ambiguous rule' },
    { value: 'EXPIRED_RULE', label: 'Expired rule' },
    { value: 'INVALID_GL_ACCOUNT', label: 'Invalid G/L account' },
    { value: 'BLOCKED_GL_ACCOUNT', label: 'Blocked G/L account' },
    { value: 'INVALID_COMPANY_ASSIGNMENT', label: 'Invalid company assignment' },
    { value: 'MISSING_REQUIRED_DIMENSION', label: 'Missing required dimension' },
    { value: 'UNSUPPORTED_SCENARIO', label: 'Unsupported scenario' },
    { value: 'LEGACY_MIGRATION_DISCREPANCY', label: 'Legacy migration discrepancy' },
    { value: 'FAILED_AUTOMATIC_POSTING', label: 'Failed automatic posting' },
]

/** Phase 04.25 — configuration exceptions with authorized retry. */
export function DeterminationExceptionsPanel({ companyId }: { companyId: string }) {
    const [rows, setRows] = useState<FicoDeterminationException[]>([])
    const [byCategory, setByCategory] = useState<Record<string, number>>({})
    const [category, setCategory] = useState('')
    const [loading, setLoading] = useState(false)
    const [retrying, setRetrying] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        try {
            const data = await ficoAccountDeterminationRuleService.exceptions({
                companyId,
                ...(category ? { category } : {}),
                pageSize: 100,
            })
            setRows(data.items)
            setByCategory(data.byCategory)
        } catch (error) {
            notifyError(error, 'Unable to load account determination exceptions.')
        } finally {
            setLoading(false)
        }
    }, [companyId, category])

    useEffect(() => {
        void load()
    }, [load])

    const retry = async (row: FicoDeterminationException) => {
        if (!row.accountingEventId) return
        setRetrying(row.id)
        try {
            const result = await ficoAccountingEventService.retry(row.accountingEventId)
            notifySuccess(`Accounting event retried — status ${result.status}.`)
            await load()
        } catch (error) {
            notifyError(error, 'Retry failed. Correct the configuration first.')
        } finally {
            setRetrying(null)
        }
    }

    const columns = useMemo<ColumnDef<FicoDeterminationException>[]>(
        () => [
            {
                header: 'Exception',
                id: 'category',
                cell: ({ row }) => (
                    <FicoTwoLineCell
                        primary={row.original.category.replaceAll('_', ' ')}
                        secondary={row.original.expectedHandling}
                    />
                ),
            },
            {
                header: 'Source',
                id: 'source',
                cell: ({ row }) => (
                    <FicoTwoLineCell
                        primary={row.original.sourceModule ?? '—'}
                        secondary={
                            row.original.sourceDocumentType
                                ? `${row.original.sourceDocumentType} · ${row.original.sourceDocumentId ?? ''}`
                                : 'Configuration'
                        }
                    />
                ),
            },
            {
                header: 'Transaction key',
                id: 'key',
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-gray-700 dark:text-gray-200">
                        {row.original.transactionKey ?? '—'}
                    </span>
                ),
            },
            {
                header: 'Error',
                id: 'error',
                cell: ({ row }) => (
                    <div className="max-w-[320px]">
                        <p className="font-mono text-[10px] uppercase text-gray-500">
                            {row.original.errorCode ?? '—'}
                        </p>
                        <p className="text-xs text-gray-700 dark:text-gray-200">
                            {row.original.errorDescription ?? '—'}
                        </p>
                    </div>
                ),
            },
            {
                header: 'Failures',
                id: 'failures',
                cell: ({ row }) => (
                    <div className="text-xs text-gray-600 dark:text-gray-300">
                        <p>Retries {row.original.retryCount}</p>
                        <p className="text-[11px] text-gray-500">
                            {row.original.firstFailureAt
                                ? `First ${formatFicoDate(row.original.firstFailureAt)}`
                                : '—'}
                        </p>
                        <p className="text-[11px] text-gray-500">
                            {row.original.lastFailureAt
                                ? `Last ${formatFicoDate(row.original.lastFailureAt)}`
                                : '—'}
                        </p>
                    </div>
                ),
            },
            {
                header: 'Status',
                id: 'status',
                cell: ({ row }) => <FicoStatusCell status={row.original.resolutionStatus} />,
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex items-center justify-end gap-2">
                        {row.original.configurationLink ? (
                            <Link
                                href={row.original.configurationLink}
                                className="text-xs text-primary underline"
                            >
                                Configure
                            </Link>
                        ) : null}
                        {row.original.accountingEventId ? (
                            <Button
                                size="xs"
                                variant="plain"
                                loading={retrying === row.original.id}
                                onClick={() => void retry(row.original)}
                            >
                                Retry
                            </Button>
                        ) : null}
                    </div>
                ),
            },
        ],
        // `retry` closes over `load`, which is stable per company/category.
        [retrying, load],
    )

    return (
        <div className="mt-4 space-y-3">
            <p className="text-xs text-gray-500">
                Configuration problems that block automatic journals. Retry is idempotent and
                posts through the central engine; it never marks an event consumed by hand.
            </p>
            <div className="flex flex-wrap items-end gap-3">
                <FormItem label="Category" className="mb-0 w-64">
                    <Select
                        options={CATEGORY_OPTIONS}
                        value={
                            CATEGORY_OPTIONS.find((option) => option.value === category) ??
                            CATEGORY_OPTIONS[0]
                        }
                        onChange={(option) =>
                            setCategory((option as { value: string } | null)?.value ?? '')
                        }
                    />
                </FormItem>
                <Button size="sm" variant="plain" loading={loading} onClick={() => void load()}>
                    Refresh
                </Button>
                <div className="flex flex-wrap gap-2 text-[11px] text-gray-500">
                    {Object.entries(byCategory).map(([key, count]) => (
                        <span
                            key={key}
                            className="rounded border border-gray-200 px-1.5 py-0.5 dark:border-gray-700"
                        >
                            {key.replaceAll('_', ' ')}: {count}
                        </span>
                    ))}
                </div>
            </div>
            <FicoResponsiveTable
                columns={columns}
                data={rows}
                compact
                loading={loading}
                noData={!loading && !rows.length}
                hidePagination
                getRowId={(row) => row.id}
                tableMinWidthClass="min-w-[1100px]"
                instanceId="fico-determination-exceptions"
            />
        </div>
    )
}

/** Phase 04.26 — module coverage: live keys vs active rules, plus legacy mappings. */
export function DeterminationModuleCoveragePanel({ companyId }: { companyId: string }) {
    const [coverage, setCoverage] = useState<FicoDeterminationModuleCoverage | null>(null)
    const [loading, setLoading] = useState(false)

    const load = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        try {
            setCoverage(
                await ficoAccountDeterminationRuleService.moduleCoverage(companyId),
            )
        } catch (error) {
            notifyError(error, 'Unable to load module coverage.')
        } finally {
            setLoading(false)
        }
    }, [companyId])

    useEffect(() => {
        void load()
    }, [load])

    return (
        <div className="mt-4 space-y-4">
            <div className="overflow-auto rounded-lg border border-gray-100 dark:border-gray-700">
                <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr>
                            <th className="px-2 py-1.5">Module</th>
                            <th className="px-2 py-1.5">Keys</th>
                            <th className="px-2 py-1.5">Live keys</th>
                            <th className="px-2 py-1.5">Live keys with active rule</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(coverage?.byModule ?? {}).map(([module, stats]) => (
                            <tr
                                key={module}
                                className="border-t border-gray-100 dark:border-gray-800"
                            >
                                <td className="px-2 py-1.5 font-semibold">{module}</td>
                                <td className="px-2 py-1.5">{stats.total}</td>
                                <td className="px-2 py-1.5">{stats.live}</td>
                                <td className="px-2 py-1.5">
                                    {stats.liveCovered} / {stats.live}
                                </td>
                            </tr>
                        ))}
                        {!loading && !coverage ? (
                            <tr>
                                <td className="px-2 py-4 text-gray-500" colSpan={4}>
                                    Select a company to see integration readiness.
                                </td>
                            </tr>
                        ) : null}
                    </tbody>
                </table>
            </div>
            <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Legacy MM mappings
                </p>
                <p className="mb-3 text-xs text-gray-500">
                    Legacy profile mappings remain the fallback until centralized rules are
                    active for each key.
                </p>
                <AccountDeterminationPanel key={companyId} companyId={companyId} />
            </div>
        </div>
    )
}