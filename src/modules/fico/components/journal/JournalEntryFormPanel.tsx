'use client'

import { useMemo, type ReactNode } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatCard from '@/components/shared/StatCard'
import StatusBadge from '@/components/shared/StatusBadge'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlineCalculator,
    HiOutlineCalendar,
    HiOutlineClipboardList,
    HiOutlineCollection,
    HiOutlineDocumentText,
    HiOutlineOfficeBuilding,
    HiOutlineShieldCheck,
} from 'react-icons/hi'
import { useSupplierOptions } from '@/modules/mm/shared/useEntityOptions'
import JournalLineEditor, {
    type JournalEditorLine,
} from './JournalLineEditor'
import type { FicoGlAccount, FicoJournalSimulateResult } from '../../types'
import { sumLineTotals } from './journalUi'

type SupplierOption = { value: string; label: string }

function formatAmount(currency: string, amount: string) {
    const n = Number(amount)
    if (Number.isNaN(n) || !amount) return `${currency} 0.00`
    return `${currency} ${n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`
}

function FormMetaBlock({
    title,
    icon,
    children,
}: {
    title: string
    icon: ReactNode
    children: ReactNode
}) {
    return (
        <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-800/30">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-primary shadow-sm dark:bg-gray-900">
                    {icon}
                </span>
                {title}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
        </div>
    )
}

type Props = {
    postingDate: string
    documentDate: string
    currencyCode: string
    description: string
    supplierId: string
    companyId?: string
    periodLabel: string | null
    periodStatus: string | null
    companyCode?: string
    companyName?: string
    lines: JournalEditorLine[]
    accounts: FicoGlAccount[]
    simulation: FicoJournalSimulateResult | null
    onPostingDate: (v: string) => void
    onDocumentDate: (v: string) => void
    onDescription: (v: string) => void
    onSupplierId: (v: string) => void
    onLinesChange: (lines: JournalEditorLine[]) => void
}

export default function JournalEntryFormPanel({
    postingDate,
    documentDate,
    currencyCode,
    description,
    supplierId,
    companyId,
    periodLabel,
    periodStatus,
    companyCode,
    companyName,
    lines,
    accounts,
    simulation,
    onPostingDate,
    onDocumentDate,
    onDescription,
    onSupplierId,
    onLinesChange,
}: Props) {
    const totals = sumLineTotals(lines)
    const periodOpen =
        periodStatus === 'OPEN' || periodStatus === 'RESTRICTED'
    const { options: supplierOptions, loading: suppliersLoading } =
        useSupplierOptions({ enabled: Boolean(companyId), limit: 200 })
    const companySupplierOptions = useMemo<SupplierOption[]>(
        () =>
            supplierOptions
                .filter((o) => {
                    const meta = o.meta as { companyId?: string } | undefined
                    return !companyId || meta?.companyId === companyId
                })
                .map((o) => ({ value: o.value, label: o.label })),
        [supplierOptions, companyId],
    )
    const selectedSupplier =
        companySupplierOptions.find((o) => o.value === supplierId) ?? null

    return (
        <>
            <JournalBalanceSummary
                currencyCode={currencyCode}
                totals={totals}
                lineCount={lines.length}
            />

            <AdaptiveCard className="mb-4">
                <div className="mb-4 flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-start sm:justify-between dark:border-gray-800">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15">
                            <HiOutlineDocumentText className="text-xl" />
                        </span>
                        <div className="min-w-0">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                Document header
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Posting company, dates, and fiscal period for this
                                journal.
                            </p>
                            {companyCode ? (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <Tag className="border-0 bg-primary-subtle text-xs font-mono font-semibold text-primary-deep dark:bg-primary/15">
                                        {companyCode}
                                    </Tag>
                                    <span className="truncate text-xs text-gray-600 dark:text-gray-300">
                                        {companyName}
                                    </span>
                                    <Tag className="border-0 bg-gray-100 text-xs font-semibold dark:bg-gray-800">
                                        {currencyCode}
                                    </Tag>
                                </div>
                            ) : null}
                        </div>
                    </div>
                    {periodStatus ? (
                        <StatusBadge tone={periodOpen ? 'success' : 'danger'}>
                            Period {periodStatus.replace(/_/g, ' ')}
                        </StatusBadge>
                    ) : null}
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <FormMetaBlock
                        title="Dates"
                        icon={<HiOutlineCalendar className="text-lg" />}
                    >
                        <FormItem label="Posting date">
                            <Input
                                type="date"
                                size="sm"
                                value={postingDate}
                                onChange={(e) => onPostingDate(e.target.value)}
                            />
                        </FormItem>
                        <FormItem label="Document date">
                            <Input
                                type="date"
                                size="sm"
                                value={documentDate}
                                onChange={(e) => onDocumentDate(e.target.value)}
                            />
                        </FormItem>
                    </FormMetaBlock>
                    <FormMetaBlock
                        title="Reference & period"
                        icon={<HiOutlineClipboardList className="text-lg" />}
                    >
                        <FormItem label="Fiscal period" className="sm:col-span-2">
                            <Input
                                size="sm"
                                readOnly
                                value={
                                    periodLabel
                                        ? `${periodLabel} · ${periodStatus ?? '—'}`
                                        : 'Resolve posting date…'
                                }
                            />
                        </FormItem>
                        <FormItem
                            label="Supplier (optional)"
                            className="sm:col-span-2"
                        >
                            <Select<SupplierOption>
                                size="sm"
                                isClearable
                                isLoading={suppliersLoading}
                                placeholder="Link an MM supplier partner"
                                options={companySupplierOptions}
                                value={selectedSupplier}
                                onChange={(opt) =>
                                    onSupplierId(opt?.value ?? '')
                                }
                            />
                        </FormItem>
                        <FormItem
                            label="Header description"
                            className="sm:col-span-2"
                        >
                            <Input
                                size="sm"
                                value={description}
                                placeholder="External reference, customer, or narrative"
                                onChange={(e) => onDescription(e.target.value)}
                            />
                        </FormItem>
                    </FormMetaBlock>
                </div>
            </AdaptiveCard>

            <AdaptiveCard className="mb-4">
                <div className="mb-4 flex flex-col gap-2 border-b border-gray-100 pb-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
                    <div>
                        <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
                            <HiOutlineCollection className="text-lg text-primary" />
                            Accounting lines
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Each line posts to the selected company. Enter debit or
                            credit per line; totals must balance before posting.
                        </p>
                    </div>
                    {companyCode ? (
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <HiOutlineOfficeBuilding className="text-base" />
                            <span className="font-semibold text-gray-700 dark:text-gray-200">
                                {companyCode}
                            </span>
                            <span className="hidden sm:inline">· all lines</span>
                        </div>
                    ) : null}
                </div>
                <JournalLineEditor
                    lines={lines}
                    accounts={accounts}
                    currency={currencyCode}
                    companyCode={companyCode}
                    companyName={companyName}
                    onChange={onLinesChange}
                    showSummary={false}
                    variant="workbench"
                />
            </AdaptiveCard>

            {simulation && !simulation.valid ? (
                <AdaptiveCard className="mb-4 border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20">
                    <p className="mb-2 text-sm font-semibold text-red-700 dark:text-red-300">
                        Validation failed
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-red-600 dark:text-red-400">
                        {(simulation.errors ?? []).map((err, i) => (
                            <li key={i}>{err.message}</li>
                        ))}
                    </ul>
                </AdaptiveCard>
            ) : null}
        </>
    )
}

function JournalBalanceSummary({
    currencyCode,
    totals,
    lineCount,
}: {
    currencyCode: string
    totals: ReturnType<typeof sumLineTotals>
    lineCount: number
}) {
    return (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
                label="Total debit"
                value={formatAmount(currencyCode, totals.debit)}
                icon={<HiOutlineCollection />}
            />
            <StatCard
                label="Total credit"
                value={formatAmount(currencyCode, totals.credit)}
                icon={<HiOutlineCollection />}
            />
            <StatCard
                label="Difference"
                value={formatAmount(currencyCode, totals.difference)}
                icon={<HiOutlineCalculator />}
                tone={totals.balanced ? 'success' : 'danger'}
                badge={
                    totals.balanced
                        ? undefined
                        : { tone: 'danger', label: 'Unbalanced' }
                }
            />
            <StatCard
                label="Balance"
                value={totals.balanced ? 'Ready to post' : 'Add amounts'}
                icon={<HiOutlineShieldCheck />}
                tone={totals.balanced ? 'success' : 'warning'}
                badge={{ tone: 'default', label: `${lineCount} lines` }}
            />
        </div>
    )
}