'use client'

import { useEffect, useMemo, useState } from 'react'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import FormDialog from '@/components/shared/FormDialog'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import { notifyError, notifySuccess } from './FicoCompanySelect'
import { ficoGlAccountService } from '../services/ficoService'
import type { FicoChart, FicoGlImportReport, FicoGlImportRow, FicoGlImportStatus } from '../types'
import { downloadGlImportTemplate, parseGlImportCsv } from '../utils/glAccountCsv'

type Props = {
    isOpen: boolean
    charts: FicoChart[]
    defaultChartId?: string
    onClose: () => void
    onImported: () => void
}

const STATUS_LABEL: Record<FicoGlImportStatus, string> = {
    CREATE: 'Will create',
    DUPLICATE_EXISTING: 'Already exists',
    DUPLICATE_IN_FILE: 'Duplicate in file',
    ERROR: 'Error',
}

const STATUS_TONE: Record<FicoGlImportStatus, 'success' | 'default' | 'warning' | 'danger'> = {
    CREATE: 'success',
    DUPLICATE_EXISTING: 'default',
    DUPLICATE_IN_FILE: 'warning',
    ERROR: 'danger',
}

type ReportRow = FicoGlImportReport['rows'][number] & { accountName?: string }

const GlAccountImportDialog = ({
    isOpen,
    charts,
    defaultChartId,
    onClose,
    onImported,
}: Props) => {
    const [chartId, setChartId] = useState('')
    const [fileName, setFileName] = useState('')
    const [rows, setRows] = useState<FicoGlImportRow[]>([])
    const [report, setReport] = useState<FicoGlImportReport | null>(null)
    const [checking, setChecking] = useState(false)
    const [committing, setCommitting] = useState(false)

    useEffect(() => {
        if (!isOpen) return
        setChartId(defaultChartId || charts.find((c) => c.status === 'ACTIVE')?.id || '')
        setFileName('')
        setRows([])
        setReport(null)
    }, [isOpen, defaultChartId, charts])

    const chartOptions = charts
        .filter((chart) => chart.status === 'ACTIVE')
        .map((chart) => ({ value: chart.id, label: `${chart.code} — ${chart.name}` }))

    const validate = async (nextRows: FicoGlImportRow[], nextChartId: string) => {
        if (!nextChartId || !nextRows.length) return
        setChecking(true)
        try {
            setReport(
                await ficoGlAccountService.importAccounts({
                    chartOfAccountsId: nextChartId,
                    rows: nextRows,
                    dryRun: true,
                }),
            )
        } catch (error) {
            setReport(null)
            notifyError(error, 'Unable to validate the import file.')
        } finally {
            setChecking(false)
        }
    }

    const onFile = async (file: File | undefined) => {
        if (!file) return
        setFileName(file.name)
        setReport(null)
        const parsed = parseGlImportCsv(await file.text())
        if (parsed.missingColumns.length) {
            setRows([])
            notifyError(
                null,
                `The file is missing required column(s): ${parsed.missingColumns.join(', ')}.`,
            )
            return
        }
        if (!parsed.rows.length) {
            setRows([])
            notifyError(null, 'The file contains no account rows.')
            return
        }
        setRows(parsed.rows)
        await validate(parsed.rows, chartId)
    }

    const commit = async () => {
        if (!report || !chartId) return
        setCommitting(true)
        try {
            const result = await ficoGlAccountService.importAccounts({
                chartOfAccountsId: chartId,
                rows,
                dryRun: false,
            })
            notifySuccess(
                `${result.summary.CREATE} account(s) imported; ${result.summary.DUPLICATE_EXISTING} already existed and were left unchanged.`,
            )
            onImported()
            onClose()
        } catch (error) {
            notifyError(error, 'The import failed; nothing was imported.')
        } finally {
            setCommitting(false)
        }
    }

    const blocked = report
        ? report.summary.ERROR + report.summary.DUPLICATE_IN_FILE
        : 0
    const canCommit = Boolean(report) && blocked === 0 && (report?.summary.CREATE ?? 0) > 0

    const reportRows = useMemo<ReportRow[]>(
        () =>
            (report?.rows ?? []).map((row) => ({
                ...row,
                accountName: rows[row.rowNumber - 1]?.accountName,
            })),
        [report, rows],
    )

    const columns = useMemo<ColumnDef<ReportRow>[]>(
        () => [
            { header: 'Row', accessorKey: 'rowNumber', size: 60 },
            {
                header: 'Account',
                accessorKey: 'accountCode',
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold">
                            {row.original.accountCode || '—'}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                            {row.original.accountName}
                        </p>
                    </div>
                ),
            },
            {
                header: 'Result',
                accessorKey: 'status',
                cell: ({ row }) => (
                    <StatusBadge tone={STATUS_TONE[row.original.status]}>
                        {STATUS_LABEL[row.original.status]}
                    </StatusBadge>
                ),
            },
            {
                header: 'Details',
                accessorKey: 'message',
                cell: ({ row }) => (
                    <span className="text-xs text-gray-600 dark:text-gray-300">
                        {row.original.message ?? ''}
                    </span>
                ),
            },
        ],
        [],
    )

    return (
        <FormDialog
            isOpen={isOpen}
            onClose={onClose}
            size="xl"
            title="Import G/L accounts"
            description="Upload a CSV. Every row is validated before anything is saved; existing account codes are skipped, never overwritten."
            footer={
                <>
                    <Button size="sm" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        variant="solid"
                        disabled={!canCommit}
                        loading={committing}
                        onClick={commit}
                    >
                        {report
                            ? `Import ${report.summary.CREATE} account(s)`
                            : 'Import'}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem label="Chart of accounts" asterisk>
                        <Select
                            options={chartOptions}
                            value={chartOptions.find((option) => option.value === chartId) ?? null}
                            onChange={(option) => {
                                const next = (option as { value: string } | null)?.value ?? ''
                                setChartId(next)
                                void validate(rows, next)
                            }}
                        />
                    </FormItem>
                    <FormItem
                        label="CSV file"
                        asterisk
                        extra={
                            <button
                                type="button"
                                className="text-xs font-medium text-primary hover:underline"
                                onClick={downloadGlImportTemplate}
                            >
                                Download template
                            </button>
                        }
                    >
                        <input
                            type="file"
                            accept=".csv,text/csv"
                            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium dark:text-gray-300 dark:file:bg-gray-700"
                            onChange={(event) => void onFile(event.target.files?.[0])}
                        />
                        {fileName ? (
                            <p className="mt-1 text-xs text-gray-500">
                                {fileName} · {rows.length} row(s)
                            </p>
                        ) : null}
                    </FormItem>
                </div>

                {report ? (
                    <div className="flex flex-wrap gap-2 text-xs">
                        {(Object.keys(STATUS_LABEL) as FicoGlImportStatus[]).map((status) => (
                            <StatusBadge key={status} tone={STATUS_TONE[status]}>
                                {STATUS_LABEL[status]}: {report.summary[status]}
                            </StatusBadge>
                        ))}
                    </div>
                ) : null}
                {blocked > 0 ? (
                    <p className="text-sm text-red-600 dark:text-red-400">
                        Fix the {blocked} highlighted row(s) in the file and upload it again — nothing is imported while errors remain.
                    </p>
                ) : null}

                {report || checking ? (
                    <div className="max-h-80 overflow-y-auto">
                        <DataTable
                            columns={columns}
                            data={reportRows}
                            compact
                            loading={checking}
                            hidePagination
                            getRowId={(row) => String(row.rowNumber)}
                        />
                    </div>
                ) : null}
            </div>
        </FormDialog>
    )
}

export default GlAccountImportDialog
