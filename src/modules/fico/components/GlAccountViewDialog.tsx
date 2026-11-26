'use client'

import { useEffect, useState, type ReactNode } from 'react'
import FormDialog from '@/components/shared/FormDialog'
import StatCard from '@/components/shared/StatCard'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import {
    HiOutlineArrowDown,
    HiOutlineArrowUp,
    HiOutlineClipboardList,
    HiOutlineDocumentText,
    HiOutlineLink,
} from 'react-icons/hi'
import { notifyError, useFicoCompanies } from './FicoCompanySelect'
import { formatJournalMoney } from './journal/journalUi'
import { ficoGlAccountService } from '../services/ficoService'
import type { FicoGlAccount, FicoGlAccountBalances, FicoGlAccountDependencies } from '../types'
import {
    FicoAccountTypeTag,
    FicoBalanceCell,
    FicoCodeCell,
    FicoControlFlags,
    accountTypeLabel,
    ficoStatusTone,
} from './ficoTableUi'

type Props = {
    account: FicoGlAccount | null
    onClose: () => void
    onEdit?: (account: FicoGlAccount) => void
    onCompanySettings?: (account: FicoGlAccount) => void
    onWhereUsed?: (account: FicoGlAccount) => void
}

function SectionTitle({
    icon,
    children,
}: {
    icon?: ReactNode
    children: ReactNode
}) {
    return (
        <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {icon}
            {children}
        </p>
    )
}

const GlAccountViewDialog = ({
    account,
    onClose,
    onEdit,
    onCompanySettings,
    onWhereUsed,
}: Props) => {
    const { selectedRow } = useFicoCompanies()
    const currency = selectedRow?.settings?.baseCurrency ?? 'PHP'

    const [deps, setDeps] = useState<FicoGlAccountDependencies | null>(null)
    const [balances, setBalances] = useState<FicoGlAccountBalances | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!account) {
            setDeps(null)
            setBalances(null)
            return
        }
        setLoading(true)
        Promise.all([
            ficoGlAccountService.dependencies(account.id),
            ficoGlAccountService.balances(account.id),
        ])
            .then(([dependencyData, balanceData]) => {
                setDeps(dependencyData)
                setBalances(balanceData)
            })
            .catch((error) => notifyError(error, 'Unable to load account details.'))
            .finally(() => setLoading(false))
    }, [account])

    const row = account ?? deps?.account
    const dependencyRows =
        deps?.categories.filter((c) => c.count > 0) ?? []

    const headerExtra =
        row && !loading ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                <StatusBadge tone={ficoStatusTone(row.status)}>{row.status}</StatusBadge>
                <FicoAccountTypeTag type={row.accountType} />
                <FicoBalanceCell
                    normalBalance={row.normalBalance}
                    accountType={row.accountType}
                />
                <FicoControlFlags
                    flags={[
                        row.isPostingAccount && 'Posting',
                        row.allowManualPosting && 'Manual',
                        row.allowAutomaticPosting && 'Automatic',
                        row.isReconciliationAccount && 'Reconciliation',
                    ]}
                />
            </div>
        ) : null

    return (
        <FormDialog
            isOpen={Boolean(account)}
            onClose={onClose}
            size="lg"
            width={720}
            icon={<HiOutlineDocumentText />}
            title="View G/L account"
            description={
                row ? (
                    <span className="block break-words">
                        <span className="font-mono font-semibold text-gray-800 dark:text-gray-100">
                            {row.accountCode}
                        </span>{' '}
                        <span className="text-gray-600 dark:text-gray-300">
                            {row.accountName}
                        </span>
                    </span>
                ) : null
            }
            headerExtra={headerExtra}
            footer={
                <div className="flex w-full flex-wrap justify-end gap-2">
                    <Button size="sm" type="button" onClick={onClose}>
                        Close
                    </Button>
                    {row && onWhereUsed ? (
                        <Button size="sm" type="button" onClick={() => onWhereUsed(row)}>
                            Where used
                        </Button>
                    ) : null}
                    {row && onCompanySettings ? (
                        <Button size="sm" type="button" onClick={() => onCompanySettings(row)}>
                            Company settings
                        </Button>
                    ) : null}
                    {row && onEdit ? (
                        <Button
                            size="sm"
                            type="button"
                            variant="solid"
                            onClick={() => onEdit(row)}
                        >
                            Edit account
                        </Button>
                    ) : null}
                </div>
            }
        >
            {loading || !row ? (
                <div className="space-y-4">
                    <Skeleton height={88} className="rounded-xl" />
                    <div className="grid grid-cols-3 gap-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} height={96} className="rounded-xl" />
                        ))}
                    </div>
                    <Skeleton height={120} className="rounded-xl" />
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-gray-800/30">
                        <FicoCodeCell
                            icon="account"
                            code={row.accountCode}
                            name={row.accountName}
                        />
                        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                            <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                    Chart of accounts
                                </dt>
                                <dd className="font-medium text-gray-900 dark:text-gray-100">
                                    {row.chartOfAccounts?.code ?? '—'}
                                    {row.chartOfAccounts?.name
                                        ? ` · ${row.chartOfAccounts.name}`
                                        : ''}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                    Account group
                                </dt>
                                <dd className="font-medium text-gray-900 dark:text-gray-100">
                                    {row.accountGroup?.code ?? '—'}
                                    {row.accountGroup?.name
                                        ? ` · ${row.accountGroup.name}`
                                        : ''}
                                </dd>
                            </div>
                        </dl>
                        {row.description ? (
                            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                                {row.description}
                            </p>
                        ) : (
                            <p className="mt-3 text-sm text-gray-400">No description on file.</p>
                        )}
                    </div>

                    <section>
                        <SectionTitle icon={<HiOutlineClipboardList className="text-base" />}>
                            Posted balances (accessible companies)
                        </SectionTitle>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <StatCard
                                label="Total debit"
                                value={formatJournalMoney(
                                    currency,
                                    balances?.totals.debit ?? '0',
                                )}
                                icon={<HiOutlineArrowUp />}
                                tone="info"
                            />
                            <StatCard
                                label="Total credit"
                                value={formatJournalMoney(
                                    currency,
                                    balances?.totals.credit ?? '0',
                                )}
                                icon={<HiOutlineArrowDown />}
                            />
                            <StatCard
                                label="Journal lines"
                                value={(balances?.totals.lineCount ?? 0).toLocaleString()}
                            />
                        </div>
                        <p className="mt-2 text-xs text-gray-500">
                            {accountTypeLabel(row.accountType)} account · normal {row.normalBalance}{' '}
                            side. Amounts use company currency ({currency}) for display.
                        </p>
                    </section>

                    <section>
                        <SectionTitle icon={<HiOutlineLink className="text-base" />}>
                            Configuration dependencies
                        </SectionTitle>
                        {dependencyRows.length ? (
                            <ul className="grid gap-2 sm:grid-cols-2">
                                {dependencyRows.map((c) => (
                                    <li
                                        key={c.type}
                                        className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900/40"
                                    >
                                        <span className="min-w-0 flex-1 text-sm text-gray-700 dark:text-gray-200">
                                            {c.label}
                                            {c.hiddenByScope ? (
                                                <span className="ml-1 text-[10px] text-gray-400">
                                                    (+{c.hiddenByScope} hidden)
                                                </span>
                                            ) : null}
                                        </span>
                                        <span className="shrink-0 text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
                                            {c.count.toLocaleString()}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700">
                                No blocking dependencies in your current scope.
                            </p>
                        )}
                        {deps && !deps.canDelete && deps.reasons.length ? (
                            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                                {deps.reasons[0]}
                            </p>
                        ) : null}
                    </section>
                </div>
            )}
        </FormDialog>
    )
}

export default GlAccountViewDialog