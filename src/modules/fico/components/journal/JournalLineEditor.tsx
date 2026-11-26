'use client'

import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import type { FicoGlAccount } from '../../types'
import { journalPortalSelectProps, sumLineTotals } from './journalUi'

export type JournalEditorLine = {
    key: string
    glAccountId: string
    accountCode?: string
    accountName?: string
    debit: string
    credit: string
    description: string
}

type AccountOption = {
    value: string
    label: string
    accountCode: string
    accountName: string
}

type Props = {
    lines: JournalEditorLine[]
    accounts: FicoGlAccount[]
    currency: string
    companyCode?: string
    companyName?: string
    onChange: (lines: JournalEditorLine[]) => void
    readOnly?: boolean
    showSummary?: boolean
    variant?: 'default' | 'workbench'
}

const emptyLine = (): JournalEditorLine => ({
    key: `${Date.now()}-${Math.random()}`,
    glAccountId: '',
    debit: '',
    credit: '',
    description: '',
})

function GlAccountSelect({
    options,
    value,
    onChange,
    placeholder = 'Search G/L account…',
}: {
    options: AccountOption[]
    value: string
    onChange: (glAccountId: string) => void
    placeholder?: string
}) {
    return (
        <div className="min-w-0 w-full max-w-full">
            <Select<AccountOption>
                size="sm"
                isSearchable
                placeholder={placeholder}
                options={options}
                value={options.find((o) => o.value === value) ?? null}
                noOptionsMessage={() => 'No matching accounts'}
                formatOptionLabel={(opt) => (
                    <div className="flex min-w-0 flex-col py-0.5 text-left">
                        <span className="font-mono text-xs font-semibold text-gray-800 dark:text-gray-100">
                            {opt.accountCode}
                        </span>
                        <span className="truncate text-xs font-normal text-gray-500 dark:text-gray-400">
                            {opt.accountName}
                        </span>
                    </div>
                )}
                onChange={(opt) =>
                    onChange((opt as AccountOption | null)?.value ?? '')
                }
                className="w-full min-w-0"
                {...journalPortalSelectProps}
            />
        </div>
    )
}

function CompanyCell({
    companyCode,
    companyName,
}: {
    companyCode?: string
    companyName?: string
}) {
    if (!companyCode) {
        return <span className="text-xs text-gray-400">—</span>
    }
    return (
        <div className="min-w-0">
            <Tag className="border-0 bg-gray-100 text-xs font-mono font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                {companyCode}
            </Tag>
            {companyName ? (
                <p className="mt-1 hidden truncate text-[10px] text-gray-500 xl:block">
                    {companyName}
                </p>
            ) : null}
        </div>
    )
}

export default function JournalLineEditor({
    lines,
    accounts,
    currency,
    companyCode,
    companyName,
    onChange,
    readOnly = false,
    showSummary = true,
    variant = 'default',
}: Props) {
    const totals = sumLineTotals(lines)
    const accountOptions: AccountOption[] = accounts.map((a) => ({
        value: a.id,
        label: `${a.accountCode} — ${a.accountName}`,
        accountCode: a.accountCode,
        accountName: a.accountName,
    }))

    const updateLine = (index: number, patch: Partial<JournalEditorLine>) => {
        const next = lines.map((line, i) => {
            if (i !== index) return line
            const merged = { ...line, ...patch }
            if (patch.glAccountId) {
                const acct = accounts.find((a) => a.id === patch.glAccountId)
                merged.accountCode = acct?.accountCode
                merged.accountName = acct?.accountName
            }
            return merged
        })
        onChange(next)
    }

    const tableWrap =
        variant === 'workbench'
            ? 'overflow-x-auto rounded-xl border border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900/40'
            : 'overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg'
    const rowClass =
        variant === 'workbench'
            ? 'border-t border-gray-100 transition-colors hover:bg-gray-50/80 dark:border-gray-800 dark:hover:bg-gray-800/40'
            : 'border-t border-gray-100 dark:border-gray-800'

    const lineActions = (
        <div className="flex flex-wrap gap-2">
            <Button
                size="sm"
                variant={variant === 'workbench' ? 'twoTone' : 'solid'}
                onClick={() => onChange([...lines, emptyLine()])}
            >
                Add line
            </Button>
            <Button
                size="sm"
                variant="plain"
                onClick={() =>
                    onChange([
                        ...lines,
                        {
                            ...emptyLine(),
                            ...lines[lines.length - 1],
                            key: emptyLine().key,
                            debit: '',
                            credit: '',
                        },
                    ])
                }
                disabled={!lines.length}
            >
                Duplicate last
            </Button>
        </div>
    )

    return (
        <div className="flex flex-col gap-3">
            <div className="space-y-3 md:hidden">
                {lines.map((line, index) => (
                    <div
                        key={line.key}
                        className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-800/30"
                    >
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-gray-500">
                                Line {index + 1}
                            </span>
                            {!readOnly ? (
                                <Button
                                    size="xs"
                                    variant="plain"
                                    onClick={() =>
                                        onChange(
                                            lines.filter((_, i) => i !== index),
                                        )
                                    }
                                >
                                    Remove
                                </Button>
                            ) : null}
                        </div>
                        <dl className="mb-3 grid grid-cols-2 gap-2 text-xs">
                            <div>
                                <dt className="text-gray-500">Company</dt>
                                <dd className="mt-1">
                                    <CompanyCell
                                        companyCode={companyCode}
                                        companyName={companyName}
                                    />
                                </dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Currency</dt>
                                <dd className="mt-1 font-mono font-semibold text-gray-800 dark:text-gray-100">
                                    {currency}
                                </dd>
                            </div>
                        </dl>
                        <div className="space-y-2">
                            {readOnly ? (
                                <p className="text-sm">
                                    {line.accountCode} · {line.accountName}
                                </p>
                            ) : (
                                <GlAccountSelect
                                    options={accountOptions}
                                    value={line.glAccountId}
                                    onChange={(id) =>
                                        updateLine(index, { glAccountId: id })
                                    }
                                />
                            )}
                            <Input
                                size="sm"
                                placeholder="Line description"
                                value={line.description}
                                readOnly={readOnly}
                                onChange={(e) =>
                                    updateLine(index, {
                                        description: e.target.value,
                                    })
                                }
                            />
                            <div className="grid grid-cols-2 gap-2">
                                <Input
                                    size="sm"
                                    placeholder="Debit"
                                    className="text-right tabular-nums"
                                    value={line.debit}
                                    readOnly={readOnly}
                                    onChange={(e) =>
                                        updateLine(index, {
                                            debit: e.target.value,
                                            credit:
                                                e.target.value && line.credit
                                                    ? ''
                                                    : line.credit,
                                        })
                                    }
                                />
                                <Input
                                    size="sm"
                                    placeholder="Credit"
                                    className="text-right tabular-nums"
                                    value={line.credit}
                                    readOnly={readOnly}
                                    onChange={(e) =>
                                        updateLine(index, {
                                            credit: e.target.value,
                                            debit:
                                                e.target.value && line.debit
                                                    ? ''
                                                    : line.debit,
                                        })
                                    }
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className={`hidden md:block ${tableWrap}`}>
                <table className="w-full min-w-[920px] text-sm">
                    <thead className="bg-gray-50/90 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800/80 dark:text-gray-400">
                        <tr>
                            <th className="w-10 px-3 py-2.5">#</th>
                            <th className="min-w-[96px] px-3 py-2.5">Company</th>
                            <th className="min-w-[220px] px-3 py-2.5">G/L account</th>
                            <th className="min-w-[140px] px-3 py-2.5">
                                Description
                            </th>
                            <th className="w-28 px-3 py-2.5 text-right">
                                Debit
                            </th>
                            <th className="w-28 px-3 py-2.5 text-right">
                                Credit
                            </th>
                            <th className="w-20 px-3 py-2.5" />
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((line, index) => (
                            <tr key={line.key} className={rowClass}>
                                <td className="px-3 py-2 text-gray-500 tabular-nums">
                                    {index + 1}
                                </td>
                                <td className="px-3 py-2 align-top">
                                    <CompanyCell
                                        companyCode={companyCode}
                                        companyName={companyName}
                                    />
                                </td>
                                <td className="max-w-[280px] px-3 py-2 align-top">
                                    {readOnly ? (
                                        <span className="text-sm">
                                            <span className="font-mono font-semibold">
                                                {line.accountCode}
                                            </span>
                                            <span className="text-gray-500">
                                                {' '}
                                                · {line.accountName}
                                            </span>
                                        </span>
                                    ) : (
                                        <GlAccountSelect
                                            options={accountOptions}
                                            value={line.glAccountId}
                                            onChange={(id) =>
                                                updateLine(index, {
                                                    glAccountId: id,
                                                })
                                            }
                                        />
                                    )}
                                </td>
                                <td className="px-3 py-2 align-top">
                                    <Input
                                        size="sm"
                                        value={line.description}
                                        readOnly={readOnly}
                                        onChange={(e) =>
                                            updateLine(index, {
                                                description: e.target.value,
                                            })
                                        }
                                    />
                                </td>
                                <td className="px-3 py-2 align-top">
                                    <Input
                                        size="sm"
                                        className="text-right tabular-nums"
                                        value={line.debit}
                                        readOnly={readOnly}
                                        onChange={(e) =>
                                            updateLine(index, {
                                                debit: e.target.value,
                                                credit:
                                                    e.target.value && line.credit
                                                        ? ''
                                                        : line.credit,
                                            })
                                        }
                                    />
                                </td>
                                <td className="px-3 py-2 align-top">
                                    <Input
                                        size="sm"
                                        className="text-right tabular-nums"
                                        value={line.credit}
                                        readOnly={readOnly}
                                        onChange={(e) =>
                                            updateLine(index, {
                                                credit: e.target.value,
                                                debit:
                                                    e.target.value && line.debit
                                                        ? ''
                                                        : line.debit,
                                            })
                                        }
                                    />
                                </td>
                                <td className="px-3 py-2 align-top">
                                    {!readOnly ? (
                                        <Button
                                            size="xs"
                                            variant="plain"
                                            onClick={() =>
                                                onChange(
                                                    lines.filter(
                                                        (_, i) => i !== index,
                                                    ),
                                                )
                                            }
                                        >
                                            Remove
                                        </Button>
                                    ) : null}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {!readOnly ? lineActions : null}

            {showSummary ? (
                <div className="flex flex-wrap gap-4 border-t border-gray-200 pt-3 text-sm dark:border-gray-700">
                    <span>
                        Total debit:{' '}
                        <strong className="tabular-nums">
                            {currency} {totals.debit || '0'}
                        </strong>
                    </span>
                    <span>
                        Total credit:{' '}
                        <strong className="tabular-nums">
                            {currency} {totals.credit || '0'}
                        </strong>
                    </span>
                    <span>
                        Difference:{' '}
                        <strong
                            className={
                                totals.balanced
                                    ? 'text-emerald-600 tabular-nums'
                                    : 'text-red-600 tabular-nums'
                            }
                        >
                            {currency} {totals.difference}
                        </strong>
                    </span>
                    <span>{lines.length} lines</span>
                    <span>
                        {totals.balanced
                            ? 'Balanced'
                            : 'Unbalanced — cannot submit'}
                    </span>
                </div>
            ) : null}
        </div>
    )
}