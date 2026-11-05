'use client'

import { useEffect, useState } from 'react'
import FormDialog from '@/components/shared/FormDialog'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import { HiOutlineDocumentText, HiOutlineLink, HiOutlineSearchCircle } from 'react-icons/hi'
import type { ReactNode } from 'react'
import { notifyError } from './FicoCompanySelect'
import { formatFicoDate } from './ficoTableUi'
import { ficoGlAccountService } from '../services/ficoService'
import type { FicoGlAccount, FicoGlAccountUsage } from '../types'

type Props = {
    account: FicoGlAccount | null
    onClose: () => void
}

const JOURNAL_STATUS_TONE: Record<string, 'success' | 'warning' | 'default' | 'danger'> = {
    POSTED: 'success',
    REVERSED: 'warning',
    DRAFT: 'default',
    LEGACY: 'default',
}

const money = (value: string | number, currency?: string) => {
    const amount = Number(value)
    if (!amount) return '—'
    return `${currency ? `${currency} ` : ''}${amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`
}

function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
    return (
        <div className="min-w-0 rounded-xl border border-gray-100 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-800/40">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
            <p className="mt-1 truncate text-base font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {value}
            </p>
            {hint ? <p className="truncate text-xs text-gray-500">{hint}</p> : null}
        </div>
    )
}

function sourceLabel(entry: FicoGlAccountUsage['journalLines']['items'][number]['journalEntry']) {
    if (entry.sourceDocumentType === 'JOURNAL_REVERSAL') return 'Reversal'
    if (entry.sourceModule) {
        return [entry.sourceModule, entry.sourceDocumentType].filter(Boolean).join(' · ')
    }
    return 'Manual journal'
}

const GlAccountUsageDialog = ({ account, onClose }: Props) => {
    const [usage, setUsage] = useState<FicoGlAccountUsage | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!account) return
        setUsage(null)
        setLoading(true)
        ficoGlAccountService
            .usage(account.id)
            .then(setUsage)
            .catch((error) => notifyError(error, 'Unable to load where this account is used.'))
            .finally(() => setLoading(false))
    }, [account])

    const lines = usage?.journalLines
    const currency = lines?.items[0]?.currency

    return (
        <FormDialog
            isOpen={Boolean(account)}
            onClose={onClose}
            size="lg"
            icon={<HiOutlineSearchCircle />}
            title="Where this account is used"
            description={
                account ? (
                    <span className="block break-words">
                        <span className="font-mono font-semibold text-gray-700 dark:text-gray-200">
                            {account.accountCode}
                        </span>{' '}
                        {account.accountName}
                    </span>
                ) : undefined
            }
            footer={
                <Button size="sm" onClick={onClose}>
                    Close
                </Button>
            }
        >
            {loading ? (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <Skeleton key={index} height={72} className="rounded-xl" />
                        ))}
                    </div>
                    {Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton key={index} height={64} className="rounded-xl" />
                    ))}
                </div>
            ) : usage && lines ? (
                <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Metric label="Journal lines" value={lines.total} />
                        <Metric label="Debits" value={money(lines.debitTotal, currency)} />
                        <Metric label="Credits" value={money(lines.creditTotal, currency)} />
                        <Metric label="Mappings" value={usage.mappings.length} hint="Account determination" />
                    </div>

                    {lines.hiddenByCompanyScope > 0 ? (
                        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                            {lines.hiddenByCompanyScope} more journal line
                            {lines.hiddenByCompanyScope === 1 ? '' : 's'} belong to companies you are
                            not a member of and are not shown.
                        </p>
                    ) : null}

                    <section>
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                            <HiOutlineDocumentText /> Journal lines
                        </p>
                        {lines.items.length ? (
                            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
                                {lines.items.map((line) => {
                                    const entry = line.journalEntry
                                    const debit = Number(line.debitAmount) > 0
                                    return (
                                        <li
                                            key={line.id}
                                            className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                                        >
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-mono text-xs font-semibold text-primary">
                                                        {entry.documentNumber ?? entry.id.slice(0, 10)}
                                                    </span>
                                                    <StatusBadge tone={JOURNAL_STATUS_TONE[entry.status] ?? 'default'}>
                                                        {entry.status.toLowerCase()}
                                                    </StatusBadge>
                                                </div>
                                                <p className="mt-0.5 truncate text-xs text-gray-500">
                                                    {formatFicoDate(entry.postingDate)} · {sourceLabel(entry)}
                                                    {line.company ? ` · ${line.company.code}` : ''}
                                                </p>
                                                {line.description || entry.description ? (
                                                    <p className="truncate text-xs text-gray-600 dark:text-gray-300">
                                                        {line.description || entry.description}
                                                    </p>
                                                ) : null}
                                            </div>
                                            <div className="shrink-0 text-left sm:text-right">
                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                                    {debit ? 'Debit' : 'Credit'}
                                                </p>
                                                <p
                                                    className={`text-sm font-semibold tabular-nums ${
                                                        debit
                                                            ? 'text-gray-900 dark:text-gray-100'
                                                            : 'text-emerald-700 dark:text-emerald-300'
                                                    }`}
                                                >
                                                    {money(debit ? line.debitAmount : line.creditAmount, line.currency)}
                                                </p>
                                            </div>
                                        </li>
                                    )
                                })}
                            </ul>
                        ) : (
                            <p className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-sm text-gray-500 dark:border-gray-700">
                                No journal lines have posted to this account.
                            </p>
                        )}
                        {lines.total > lines.shown ? (
                            <p className="mt-2 text-xs text-gray-500">
                                Showing the latest {lines.shown} of {lines.total} lines.
                            </p>
                        ) : null}
                    </section>

                    <section>
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                            <HiOutlineLink /> Account determination mappings
                        </p>
                        {usage.mappings.length ? (
                            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
                                {usage.mappings.map((mapping) => (
                                    <li
                                        key={mapping.id}
                                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="font-mono text-xs font-semibold text-gray-800 dark:text-gray-100">
                                                {mapping.transactionKeyCode}
                                            </p>
                                            <p className="truncate text-xs text-gray-500">
                                                {mapping.transactionKey?.name ?? '—'}
                                                {mapping.company ? ` · ${mapping.company.code}` : ''}
                                                {mapping.profile ? ` · ${mapping.profile.code}` : ''}
                                            </p>
                                        </div>
                                        <StatusBadge tone={mapping.side === 'CREDIT' ? 'info' : 'default'}>
                                            {mapping.side === 'BOTH' ? 'Debit & credit' : `${mapping.side.toLowerCase()} side`}
                                        </StatusBadge>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-sm text-gray-500 dark:border-gray-700">
                                No automatic account-determination mapping uses this account.
                            </p>
                        )}
                    </section>
                </div>
            ) : null}
        </FormDialog>
    )
}

export default GlAccountUsageDialog
