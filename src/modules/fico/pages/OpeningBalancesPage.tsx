'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { HiOutlineDownload, HiOutlinePlus, HiOutlineUpload } from 'react-icons/hi'
import {
    FicoCompanySelect,
    notifyError,
    notifySuccess,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import FicoResponsiveTable, { type ColumnDef } from '../components/FicoResponsiveTable'
import { FicoStatusCell, formatFicoDate } from '../components/ficoTableUi'
import { ficoOpeningBalanceService } from '../services/ficoService'
import type { FicoOpeningBalanceBatch } from '../types'

const ROUTE = '/modules/fico/opening-balances'

function parseCsv(text: string) {
    const lines = text.trim().split(/\r?\n/)
    const rows: Array<{
        accountCode: string
        accountName?: string
        debitAmount?: number
        creditAmount?: number
    }> = []
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]
        if (!line.trim()) continue
        if (i === 0 && /account_code/i.test(line)) continue
        const parts = line.split(',')
        if (parts.length < 4) continue
        rows.push({
            accountCode: parts[0].trim(),
            accountName: parts[1]?.trim(),
            debitAmount: Number(parts[2]) || 0,
            creditAmount: Number(parts[3]) || 0,
        })
    }
    return rows
}

const OpeningBalancesPage = () => {
    const { companies, companyId, setCompanyId, loading: companyLoading } =
        useFicoCompanies()
    const [batches, setBatches] = useState<FicoOpeningBalanceBatch[]>([])
    const [loading, setLoading] = useState(false)
    const [createOpen, setCreateOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [importErrors, setImportErrors] = useState<string[]>([])
    const [form, setForm] = useState({
        batchReference: '',
        migrationDate: '',
        postingDate: '',
        fiscalYear: String(new Date().getFullYear()),
        currencyCode: 'PHP',
        sourceSystem: '',
        description: '',
    })

    const load = useCallback(() => {
        if (!companyId) return
        setLoading(true)
        ficoOpeningBalanceService
            .list(companyId)
            .then(setBatches)
            .catch((error) => notifyError(error, 'Unable to load opening balance batches.'))
            .finally(() => setLoading(false))
    }, [companyId])

    useEffect(() => {
        load()
    }, [load])

    const createBatch = async () => {
        if (!companyId) return
        setSaving(true)
        try {
            await ficoOpeningBalanceService.create({
                companyId,
                ...form,
                fiscalYear: Number(form.fiscalYear),
            })
            notifySuccess('Opening balance batch created.')
            setCreateOpen(false)
            load()
        } catch (error) {
            notifyError(error, 'Unable to create batch.')
        } finally {
            setSaving(false)
        }
    }

    const downloadTemplate = async () => {
        try {
            const tpl = await ficoOpeningBalanceService.template()
            const blob = new Blob([tpl.content], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = tpl.fileName
            a.click()
            URL.revokeObjectURL(url)
        } catch (error) {
            notifyError(error, 'Unable to download template.')
        }
    }

    const importFile = async (batchId: string, file: File) => {
        const text = await file.text()
        const rows = parseCsv(text)
        const result = await ficoOpeningBalanceService.import(batchId, { rows })
        if (!result.valid) {
            setImportErrors(result.errors)
            notifyError(
                new Error(result.errors.join('\n')),
                'Import validation failed.',
            )
            return
        }
        setImportErrors([])
        notifySuccess(`Imported ${rows.length} lines.`)
        load()
    }

    const runAction = async (
        batchId: string,
        action: 'submit' | 'approve' | 'post' | 'lock',
    ) => {
        setSaving(true)
        try {
            await ficoOpeningBalanceService[action](batchId)
            notifySuccess(`Batch ${action} completed.`)
            load()
        } catch (error) {
            notifyError(error, `Unable to ${action} batch.`)
        } finally {
            setSaving(false)
        }
    }

    const columns: ColumnDef<FicoOpeningBalanceBatch>[] = [
        {
            header: 'Batch',
            accessorKey: 'batchReference',
            cell: ({ row }) => (
                <div>
                    <div className="font-medium">{row.original.batchReference}</div>
                    <div className="text-xs text-gray-500">
                        {row.original.sourceSystem ?? '—'} · FY {row.original.fiscalYear}
                    </div>
                </div>
            ),
        },
        {
            header: 'Dates',
            id: 'dates',
            cell: ({ row }) => (
                <div className="text-sm">
                    <div>Migration {formatFicoDate(row.original.migrationDate)}</div>
                    <div>Posting {formatFicoDate(row.original.postingDate)}</div>
                </div>
            ),
        },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: ({ row }) => (
                <FicoStatusCell
                    status={row.original.status}
                    map={{
                        POSTED: 'success',
                        LOCKED: 'success',
                        DRAFT: 'default',
                        SUBMITTED: 'warning',
                        APPROVED: 'info',
                    }}
                />
            ),
        },
        {
            header: 'Lines',
            id: 'lines',
            cell: ({ row }) => String(row.original._count?.lines ?? 0),
        },
        {
            header: 'Workflow',
            id: 'actions',
            cell: ({ row }) => (
                <div className="flex flex-wrap gap-1">
                    {row.original.status === 'DRAFT' ? (
                        <label className="cursor-pointer">
                            <input
                                type="file"
                                accept=".csv"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) void importFile(row.original.id, file)
                                }}
                            />
                            <Button size="sm" icon={<HiOutlineUpload />} asElement="span">
                                Import
                            </Button>
                        </label>
                    ) : null}
                    {row.original.status === 'DRAFT' ? (
                        <Button
                            size="sm"
                            loading={saving}
                            onClick={() => runAction(row.original.id, 'submit')}
                        >
                            Submit
                        </Button>
                    ) : null}
                    {row.original.status === 'SUBMITTED' ? (
                        <Button
                            size="sm"
                            loading={saving}
                            onClick={() => runAction(row.original.id, 'approve')}
                        >
                            Approve
                        </Button>
                    ) : null}
                    {row.original.status === 'APPROVED' ? (
                        <Button
                            size="sm"
                            loading={saving}
                            onClick={() => runAction(row.original.id, 'post')}
                        >
                            Post journal
                        </Button>
                    ) : null}
                    {row.original.status === 'POSTED' ? (
                        <Button
                            size="sm"
                            loading={saving}
                            onClick={() => runAction(row.original.id, 'lock')}
                        >
                            Lock
                        </Button>
                    ) : null}
                    {row.original.journalEntryId ? (
                        <Link
                            href={`/modules/fico/journal-entries/${row.original.journalEntryId}`}
                        >
                            <Button size="sm" variant="plain">
                                Journal
                            </Button>
                        </Link>
                    ) : null}
                </div>
            ),
        },
    ]

    return (
        <PageContainer>
            <PageHeader
                title="Opening Balances"
                description="Migration batches import balance-sheet opening balances only. Posting uses the centralized financial engine — G/L balances are never updated directly."
                breadcrumbs={buildErpBreadcrumbs(ROUTE)}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <FicoCompanySelect
                            companies={companies}
                            value={companyId}
                            onChange={setCompanyId}
                            loading={companyLoading}
                        />
                        <Button
                            icon={<HiOutlineDownload />}
                            variant="twoTone"
                            onClick={downloadTemplate}
                        >
                            Template
                        </Button>
                        <Button icon={<HiOutlinePlus />} onClick={() => setCreateOpen(true)}>
                            New batch
                        </Button>
                    </div>
                }
            />

            <AdaptiveCard className="mb-4 p-4 text-sm text-gray-600 dark:text-gray-300">
                Revenue and expense accounts are blocked on import. AP/AR open-item migration is
                not supported until subledger open items exist — do not post aggregate
                reconciliation balances and detailed subledger items twice.
            </AdaptiveCard>

            {importErrors.length ? (
                <AdaptiveCard className="mb-4 border border-amber-300 p-4">
                    <p className="mb-2 font-medium">Import errors</p>
                    <ul className="list-inside list-disc text-sm">
                        {importErrors.map((err) => (
                            <li key={err}>{err}</li>
                        ))}
                    </ul>
                </AdaptiveCard>
            ) : null}

            <FicoResponsiveTable
                columns={columns}
                data={batches}
                loading={loading}
                noData={!loading && batches.length === 0}
            />

            <FormDialog
                isOpen={createOpen}
                title="Create opening balance batch"
                onClose={() => setCreateOpen(false)}
                onSubmit={createBatch}
                confirmText="Create"
                confirmLoading={saving}
            >
                <FormItem label="Batch reference">
                    <Input
                        value={form.batchReference}
                        onChange={(e) =>
                            setForm((f) => ({ ...f, batchReference: e.target.value }))
                        }
                    />
                </FormItem>
                <FormItem label="Migration date">
                    <Input
                        type="date"
                        value={form.migrationDate}
                        onChange={(e) =>
                            setForm((f) => ({ ...f, migrationDate: e.target.value }))
                        }
                    />
                </FormItem>
                <FormItem label="Opening balance posting date">
                    <Input
                        type="date"
                        value={form.postingDate}
                        onChange={(e) =>
                            setForm((f) => ({ ...f, postingDate: e.target.value }))
                        }
                    />
                </FormItem>
                <FormItem label="Fiscal year">
                    <Input
                        value={form.fiscalYear}
                        onChange={(e) =>
                            setForm((f) => ({ ...f, fiscalYear: e.target.value }))
                        }
                    />
                </FormItem>
                <FormItem label="Currency">
                    <Input
                        value={form.currencyCode}
                        onChange={(e) =>
                            setForm((f) => ({ ...f, currencyCode: e.target.value }))
                        }
                    />
                </FormItem>
                <FormItem label="Source system">
                    <Input
                        value={form.sourceSystem}
                        onChange={(e) =>
                            setForm((f) => ({ ...f, sourceSystem: e.target.value }))
                        }
                    />
                </FormItem>
                <FormItem label="Description">
                    <Input
                        value={form.description}
                        onChange={(e) =>
                            setForm((f) => ({ ...f, description: e.target.value }))
                        }
                    />
                </FormItem>
            </FormDialog>
        </PageContainer>
    )
}

export default OpeningBalancesPage