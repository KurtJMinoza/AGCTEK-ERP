'use client'

import { useMemo, type ReactNode } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatCard from '@/components/shared/StatCard'
import StatusBadge from '@/components/shared/StatusBadge'
import FicoResponsiveTable, { type ColumnDef } from '../FicoResponsiveTable'
import {
    FICO_TABLE_COL_RIGHT,
    FicoCodeCell,
    FicoTwoLineCell,
    formatFicoDate,
} from '../ficoTableUi'
import {
    JournalAccountingLinesTotals,
    JournalLineAmountCell,
    JournalPostingStatus,
    formatJournalDate,
    formatJournalMoney,
    journalAmountColumnHeader,
    sumLineTotals,
} from './journalUi'
import type { FicoAuditEntry, FicoJournalEntryDetail, FicoJournalLine } from '../../types'
import {
    HiOutlineCalendar,
    HiOutlineClipboardList,
    HiOutlineCollection,
    HiOutlineDocumentText,
    HiOutlineLibrary,
    HiOutlineShieldCheck,
} from 'react-icons/hi'

function humanizeDocType(value?: string) {
    if (!value) return 'Journal'
    return value.replace(/_/g, ' ')
}

function humanizeAuditAction(action: string) {
    return action
        .replace(/^JOURNAL_/, '')
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/^\w/, (c) => c.toUpperCase())
}

function sourceLabel(entry: FicoJournalEntryDetail) {
    if (!entry.sourceModule) {
        return { primary: 'Manual entry', secondary: undefined as string | undefined }
    }
    const ref =
        entry.description?.match(/POS-\d+/i)?.[0] ??
        entry.lines
            .find((l) => l.description?.includes('POS-'))
            ?.description?.match(/POS-\d+/i)?.[0]
    return {
        primary: entry.sourceModule,
        secondary: ref ?? (entry.sourceDocumentId ? 'Linked order' : undefined),
    }
}

function MetaBlock({
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
            <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">{children}</dl>
        </div>
    )
}

function MetaItem({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {label}
            </dt>
            <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{value}</dd>
        </div>
    )
}

type Props = {
    entry: FicoJournalEntryDetail
    companyLabel?: string
    audit: FicoAuditEntry[]
}

export default function JournalEntryDetailView({ entry, companyLabel, audit }: Props) {
    const totals = useMemo(
        () =>
            sumLineTotals(
                entry.lines.map((l) => ({
                    debit: l.debitAmount,
                    credit: l.creditAmount,
                })),
            ),
        [entry.lines],
    )

    const source = sourceLabel(entry)

    const columns = useMemo<ColumnDef<FicoJournalLine>[]>(
        () => [
            {
                header: '#',
                accessorKey: 'lineNumber',
                size: 48,
                cell: ({ row }) => (
                    <span className="tabular-nums text-sm text-gray-500">
                        {row.original.lineNumber}
                    </span>
                ),
            },
            {
                header: 'G/L account',
                id: 'account',
                cell: ({ row }) => (
                    <FicoCodeCell
                        icon="account"
                        code={row.original.glAccount?.accountCode ?? '—'}
                        name={row.original.glAccount?.accountName}
                    />
                ),
            },
            {
                header: 'Line description',
                accessorKey: 'description',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                        {row.original.description ?? '—'}
                    </span>
                ),
            },
            {
                header: journalAmountColumnHeader.debit,
                id: 'debit',
                size: 132,
                minSize: 120,
                meta: FICO_TABLE_COL_RIGHT,
                cell: ({ row }) => (
                    <JournalLineAmountCell
                        currency={entry.currencyCode}
                        amount={row.original.debitAmount}
                    />
                ),
            },
            {
                header: journalAmountColumnHeader.credit,
                id: 'credit',
                size: 132,
                minSize: 120,
                meta: FICO_TABLE_COL_RIGHT,
                cell: ({ row }) => (
                    <JournalLineAmountCell
                        currency={entry.currencyCode}
                        amount={row.original.creditAmount}
                    />
                ),
            },
        ],
        [entry.currencyCode],
    )

    const mobile = useMemo(
        () => ({
            title: (row: FicoJournalLine) =>
                `${row.glAccount?.accountCode ?? '—'} · ${row.glAccount?.accountName ?? ''}`,
            subtitle: (row: FicoJournalLine) => row.description ?? undefined,
            fields: [
                {
                    label: 'Debit',
                    align: 'right' as const,
                    value: (row: FicoJournalLine) => (
                        <JournalLineAmountCell
                            currency={entry.currencyCode}
                            amount={row.debitAmount}
                        />
                    ),
                },
                {
                    label: 'Credit',
                    align: 'right' as const,
                    value: (row: FicoJournalLine) => (
                        <JournalLineAmountCell
                            currency={entry.currencyCode}
                            amount={row.creditAmount}
                        />
                    ),
                },
            ],
        }),
        [entry.currencyCode],
    )

    return (
        <>
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                    label="Document total"
                    value={formatJournalMoney(entry.currencyCode, entry.totalAmount)}
                    icon={<HiOutlineDocumentText />}
                />
                <StatCard
                    label="Total debit"
                    value={formatJournalMoney(entry.currencyCode, totals.debit)}
                    icon={<HiOutlineCollection />}
                />
                <StatCard
                    label="Total credit"
                    value={formatJournalMoney(entry.currencyCode, totals.credit)}
                    icon={<HiOutlineCollection />}
                />
                <StatCard
                    label="Balance check"
                    value={
                        totals.balanced ? (
                            <span className="text-emerald-600 dark:text-emerald-400">
                                Balanced
                            </span>
                        ) : (
                            formatJournalMoney(entry.currencyCode, totals.difference)
                        )
                    }
                    icon={<HiOutlineShieldCheck />}
                    tone={totals.balanced ? 'success' : 'danger'}
                    badge={
                        totals.balanced
                            ? { tone: 'success', label: `${entry.lines.length} lines` }
                            : { tone: 'danger', label: 'Out of balance' }
                    }
                />
            </div>

            <AdaptiveCard className="mb-4">
                <div className="grid gap-4 border-b border-gray-100 pb-4 dark:border-gray-800 lg:grid-cols-[1fr_auto]">
                    <FicoCodeCell
                        icon="posting"
                        code={entry.documentNumber ?? 'Draft'}
                        name={entry.description ?? humanizeDocType(entry.documentType)}
                    />
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end lg:pt-1">
                        <JournalPostingStatus status={entry.status} />
                        <StatusBadge tone="info">{humanizeDocType(entry.documentType)}</StatusBadge>
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <MetaBlock title="Dates & fiscal period" icon={<HiOutlineCalendar className="text-lg" />}>
                        <MetaItem label="Posting date" value={formatFicoDate(entry.postingDate)} />
                        <MetaItem
                            label="Document date"
                            value={formatFicoDate(entry.documentDate ?? entry.postingDate)}
                        />
                        <MetaItem
                            label="Fiscal period"
                            value={
                                entry.fiscalPeriod ? (
                                    <FicoTwoLineCell
                                        primary={`FY ${entry.fiscalPeriod.fiscalYear} · Period ${entry.fiscalPeriod.periodNumber}`}
                                        secondary={entry.fiscalPeriod.status.replace(/_/g, ' ')}
                                    />
                                ) : (
                                    '—'
                                )
                            }
                        />
                        <MetaItem label="Currency" value={entry.currencyCode} />
                    </MetaBlock>
                    <MetaBlock title="Company & origin" icon={<HiOutlineLibrary className="text-lg" />}>
                        <MetaItem label="Company" value={companyLabel ?? entry.companyId} />
                        <MetaItem
                            label="Source"
                            value={
                                <FicoTwoLineCell
                                    primary={source.primary}
                                    secondary={source.secondary}
                                    mono={Boolean(source.secondary && source.secondary.length <= 16)}
                                />
                            }
                        />
                        <MetaItem
                            label="Posted at"
                            value={
                                entry.postedAt
                                    ? formatJournalDate(entry.postedAt)
                                    : entry.status === 'POSTED'
                                      ? '—'
                                      : 'Not posted'
                            }
                        />
                        <MetaItem
                            label="Posted by"
                            value={
                                entry.postedByName ? (
                                    <FicoTwoLineCell
                                        primary={entry.postedByName}
                                        secondary={
                                            entry.postedByEmployeeCode
                                                ? `Employee ${entry.postedByEmployeeCode}`
                                                : undefined
                                        }
                                    />
                                ) : entry.status === 'POSTED' ? (
                                    'System / integration'
                                ) : (
                                    '—'
                                )
                            }
                        />
                        <MetaItem
                            label="Lines"
                            value={`${entry.lines.length} accounting line${entry.lines.length === 1 ? '' : 's'}`}
                        />
                    </MetaBlock>
                </div>
            </AdaptiveCard>

            <AdaptiveCard className="mb-4 animate-mm-row-in motion-reduce:animate-none">
                <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
                    <HiOutlineClipboardList className="text-lg text-primary" />
                    Accounting lines
                </h3>
                <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                    {entry.lines.length} line{entry.lines.length === 1 ? '' : 's'} ·{' '}
                    {entry.currencyCode}
                </p>
                <div className="mb-3">
                    <JournalAccountingLinesTotals
                        currency={entry.currencyCode}
                        debit={totals.debit}
                        credit={totals.credit}
                        balanced={totals.balanced}
                    />
                </div>
                <section
                    aria-label="Journal line items"
                    className="overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-sm dark:border-gray-700/80 dark:bg-gray-900/20"
                >
                    <FicoResponsiveTable
                        columns={columns}
                        data={entry.lines}
                        mobile={mobile}
                        compact
                        hoverable
                        overflow={false}
                        noData={entry.lines.length === 0}
                        tableMinWidthClass="min-w-[720px]"
                        pagingData={{
                            total: entry.lines.length,
                            pageIndex: 0,
                            pageSize: Math.max(entry.lines.length, 1),
                        }}
                        hidePagination
                    />
                </section>
            </AdaptiveCard>

            <AdaptiveCard>
                <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-gray-100">
                    Audit trail
                </h3>
                {audit.length === 0 ? (
                    <p className="text-sm text-gray-500">No audit events recorded.</p>
                ) : (
                    <ul className="relative space-y-0 border-l-2 border-gray-100 pl-4 dark:border-gray-800">
                        {audit.map((item) => (
                            <li key={item.id} className="relative pb-4 last:pb-0">
                                <span className="absolute -left-[calc(0.5rem+5px)] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-white dark:ring-gray-900" />
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {humanizeAuditAction(item.action)}
                                </p>
                                <p className="text-xs text-gray-500">
                                    {formatJournalDate(item.createdAt)}
                                    {item.reason ? ` · ${item.reason}` : ''}
                                </p>
                            </li>
                        ))}
                    </ul>
                )}
            </AdaptiveCard>
        </>
    )
}