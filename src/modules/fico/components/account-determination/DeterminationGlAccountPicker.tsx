'use client'

import Link from 'next/link'
import Select from '@/components/ui/Select'
import type { FicoDeterminationEligibleGlAccount } from '../../accountDeterminationTypes'
import { ficoAccountDeterminationRuleService } from '../../services/accountDeterminationService'
import { useCallback, useEffect, useMemo, useState } from 'react'

type Option = {
    value: string
    label: string
    account: FicoDeterminationEligibleGlAccount
}

export default function DeterminationGlAccountPicker({
    companyId,
    transactionKeyCode,
    value,
    onChange,
    placeholder = 'Search G/L account…',
}: {
    companyId: string
    transactionKeyCode?: string
    value: string
    onChange: (glAccountId: string) => void
    placeholder?: string
}) {
    const [accounts, setAccounts] = useState<FicoDeterminationEligibleGlAccount[]>([])
    const [loading, setLoading] = useState(false)
    const [search, setSearch] = useState('')

    const load = useCallback(
        async (term?: string) => {
            if (!companyId) return
            setLoading(true)
            try {
                const rows = await ficoAccountDeterminationRuleService.eligibleGlAccounts({
                    companyId,
                    search: term,
                    transactionKeyCode,
                })
                setAccounts(rows)
            } finally {
                setLoading(false)
            }
        },
        [companyId, transactionKeyCode],
    )

    useEffect(() => {
        void load()
    }, [load])

    const options = useMemo<Option[]>(
        () =>
            accounts.map((account) => ({
                value: account.id,
                label: `${account.accountCode} — ${account.accountName}`,
                account,
            })),
        [accounts],
    )

    const selected = options.find((option) => option.value === value)

    return (
        <div className="space-y-1">
            <Select<Option>
                size="sm"
                isSearchable
                isLoading={loading}
                placeholder={placeholder}
                options={options}
                value={selected ?? null}
                filterOption={() => true}
                onInputChange={(input) => {
                    setSearch(input)
                    void load(input)
                    return input
                }}
                formatOptionLabel={(opt) => (
                    <div className="py-0.5 text-left">
                        <div className="font-mono text-xs font-semibold text-gray-800 dark:text-gray-100">
                            {opt.account.accountCode}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-300">
                            {opt.account.accountName}
                        </div>
                        <div className="mt-0.5 text-[10px] text-gray-500">
                            {opt.account.accountType} · {opt.account.normalBalance} normal ·{' '}
                            {opt.account.postingEligible ? 'Postable' : 'Blocked'} ·{' '}
                            {opt.account.status}
                            {opt.account.reconciliationType
                                ? ` · Recon ${opt.account.reconciliationType}`
                                : ''}
                        </div>
                    </div>
                )}
                onChange={(opt) =>
                    onChange((opt as Option | null)?.value ?? '')
                }
            />
            {!loading && !options.length ? (
                <p className="text-[11px] text-gray-500">
                    No eligible accounts for this company/key.{' '}
                    <Link
                        href="/modules/fico/gl-accounts"
                        className="text-primary underline"
                    >
                        Open G/L Account Master
                    </Link>
                </p>
            ) : null}
            {search && !loading && options.length === 0 ? (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    No matches. Maintain the account in{' '}
                    <Link href="/modules/fico/gl-accounts" className="underline">
                        G/L Account Master
                    </Link>{' '}
                    and assign it to this company — accounts are not created from this form.
                </p>
            ) : null}
        </div>
    )
}