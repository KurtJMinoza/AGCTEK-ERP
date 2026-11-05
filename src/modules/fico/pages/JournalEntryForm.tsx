'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Breadcrumb from '@/components/shared/Breadcrumb'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import ErpBackLink from '@/components/erp/ErpBackLink'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    FicoCompanySelect,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import { useDocumentTypes } from '../hooks/useDocumentTypes'
import { useJournalEntryMutations } from '../hooks/useJournalEntries'
import { ficoErrorMessage, ficoGlAccountService } from '../services/ficoService'
import type { FicoGlAccount, FicoJournalEntryLineInput } from '../types'

const ROUTE = '/modules/fico/journal-entries'

const today = () => new Date().toISOString().slice(0, 10)
const emptyLine = (): FicoJournalEntryLineInput => ({
    glAccountId: '',
    debit: 0,
    credit: 0,
    text: '',
})

export default function JournalEntryFormPage() {
    const router = useRouter()
    const types = useDocumentTypes()
    const mutations = useJournalEntryMutations()
    const { companies, companyId, setCompanyId, loading: companyLoading } =
        useFicoCompanies()
    const breadcrumbs = buildErpBreadcrumbs(ROUTE)

    const [accounts, setAccounts] = useState<FicoGlAccount[]>([])
    const [accountsLoading, setAccountsLoading] = useState(false)
    const [accountsError, setAccountsError] = useState<string | null>(null)
    const [documentTypeId, setDocumentTypeId] = useState('')
    const [postingDate, setPostingDate] = useState(today())
    const [documentDate, setDocumentDate] = useState(today())
    const [reference, setReference] = useState('')
    const [headerText, setHeaderText] = useState('')
    const [currencyCode, setCurrencyCode] = useState('PHP')
    const [lines, setLines] = useState<FicoJournalEntryLineInput[]>([
        emptyLine(),
        emptyLine(),
    ])
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!companyId) return
        let cancelled = false
        const load = async () => {
            setAccountsLoading(true)
            setAccountsError(null)
            try {
                const rows = await ficoGlAccountService.list({
                    status: 'ACTIVE',
                    companyId,
                })
                if (cancelled) return
                setAccounts(
                    rows.filter(
                        (account) =>
                            account.isPostingAccount &&
                            account.allowManualPosting,
                    ),
                )
            } catch (loadError: unknown) {
                if (!cancelled) {
                    setAccountsError(
                        ficoErrorMessage(
                            loadError,
                            'Failed to load G/L accounts',
                        ),
                    )
                }
            } finally {
                if (!cancelled) setAccountsLoading(false)
            }
        }
        void load()
        return () => {
            cancelled = true
        }
    }, [companyId])

    const totals = useMemo(
        () =>
            lines.reduce(
                (total, line) => ({
                    debit: total.debit + Number(line.debit || 0),
                    credit: total.credit + Number(line.credit || 0),
                }),
                { debit: 0, credit: 0 },
            ),
        [lines],
    )
    const balanced =
        totals.debit > 0 && Math.abs(totals.debit - totals.credit) < 0.00001

    const visibleAccounts = companyId ? accounts : []
    const selectCompany = (nextCompanyId: string) => {
        setCompanyId(nextCompanyId)
        setLines((current) =>
            current.map((line) => ({ ...line, glAccountId: '' })),
        )
    }

    const update = (index: number, patch: Partial<FicoJournalEntryLineInput>) =>
        setLines((current) =>
            current.map((line, lineIndex) =>
                lineIndex === index ? { ...line, ...patch } : line,
            ),
        )
    const remove = (index: number) =>
        setLines((current) =>
            current.filter((_, lineIndex) => lineIndex !== index),
        )

    const submit = async (status: 'DRAFT' | 'POSTED') => {
        setError(null)
        try {
            const result = await mutations.create({
                companyId,
                documentTypeId,
                postingDate,
                documentDate,
                reference: reference || undefined,
                headerText: headerText || undefined,
                currencyCode,
                status,
                lines,
            })
            router.push(`${ROUTE}/${result.id}`)
        } catch (submitError) {
            setError(
                ficoErrorMessage(submitError, 'Unable to save journal entry'),
            )
        }
    }

    const canSubmit =
        Boolean(companyId) && Boolean(documentTypeId) && balanced && !mutations.saving

    return (
        <PageContainer>
            <ErpBackLink items={breadcrumbs} />
            <Breadcrumb items={breadcrumbs} className="mb-4" />
            <PageHeader
                title="New Journal Entry"
                description="Enter a balanced document. Posting validates the company configuration, fiscal period, and G/L accounts."
            />
            {(error || types.error || accountsError) && (
                <Alert showIcon type="danger" className="mb-4">
                    {error || types.error || accountsError}
                </Alert>
            )}
            <AdaptiveCard className="mb-4">
                <div className="grid gap-4 md:grid-cols-3">
                    <Label text="Company">
                        <FicoCompanySelect
                            companies={companies}
                            value={companyId}
                            onChange={selectCompany}
                            loading={companyLoading}
                            className="w-full"
                        />
                    </Label>
                    <Label text="Document type">
                        <select
                            className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2"
                            value={documentTypeId}
                            onChange={(event) =>
                                setDocumentTypeId(event.target.value)
                            }
                        >
                            <option value="">Select type</option>
                            {types.data
                                .filter(
                                    (type) =>
                                        type.isActive &&
                                        type.allowsManualEntry,
                                )
                                .map((type) => (
                                    <option key={type.id} value={type.id}>
                                        {type.code} — {type.name}
                                    </option>
                                ))}
                        </select>
                    </Label>
                    <Label text="Posting date">
                        <Input
                            type="date"
                            value={postingDate}
                            onChange={(event) =>
                                setPostingDate(event.target.value)
                            }
                        />
                    </Label>
                    <Label text="Document date">
                        <Input
                            type="date"
                            value={documentDate}
                            onChange={(event) =>
                                setDocumentDate(event.target.value)
                            }
                        />
                    </Label>
                    <Label text="Reference">
                        <Input
                            value={reference}
                            onChange={(event) =>
                                setReference(event.target.value)
                            }
                        />
                    </Label>
                    <Label text="Header text">
                        <Input
                            value={headerText}
                            onChange={(event) =>
                                setHeaderText(event.target.value)
                            }
                        />
                    </Label>
                    <Label text="Currency">
                        <Input
                            maxLength={3}
                            value={currencyCode}
                            onChange={(event) =>
                                setCurrencyCode(
                                    event.target.value.toUpperCase(),
                                )
                            }
                        />
                    </Label>
                </div>
            </AdaptiveCard>
            <AdaptiveCard>
                <div className="mb-4 flex items-center justify-between">
                    <h5>Entry lines</h5>
                    <Button
                        size="sm"
                        onClick={() =>
                            setLines((current) => [...current, emptyLine()])
                        }
                    >
                        Add line
                    </Button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[850px] text-sm">
                        <thead>
                            <tr className="border-b text-left">
                                <th className="p-2">#</th>
                                <th className="p-2">G/L Account</th>
                                <th className="p-2">Text</th>
                                <th className="p-2 text-right">Debit</th>
                                <th className="p-2 text-right">Credit</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {lines.map((line, index) => (
                                <tr key={index} className="border-b">
                                    <td className="p-2">{index + 1}</td>
                                    <td className="p-2">
                                        <select
                                            className="w-full rounded-md border border-gray-300 bg-transparent px-2 py-2"
                                            value={line.glAccountId}
                                            disabled={!companyId || accountsLoading}
                                            onChange={(event) =>
                                                update(index, {
                                                    glAccountId:
                                                        event.target.value,
                                                })
                                            }
                                        >
                                            <option value="">
                                                {accountsLoading
                                                    ? 'Loading accounts…'
                                                    : 'Select account'}
                                            </option>
                                            {visibleAccounts.map((account) => (
                                                <option
                                                    key={account.id}
                                                    value={account.id}
                                                >
                                                    {account.accountCode} —{' '}
                                                    {account.accountName}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="p-2">
                                        <Input
                                            value={line.text ?? ''}
                                            onChange={(event) =>
                                                update(index, {
                                                    text: event.target.value,
                                                })
                                            }
                                        />
                                    </td>
                                    <td className="p-2">
                                        <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={line.debit}
                                            onChange={(event) => {
                                                const value = Number(
                                                    event.target.value,
                                                )
                                                update(index, {
                                                    debit: value,
                                                    credit:
                                                        value > 0
                                                            ? 0
                                                            : line.credit,
                                                })
                                            }}
                                        />
                                    </td>
                                    <td className="p-2">
                                        <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={line.credit}
                                            onChange={(event) => {
                                                const value = Number(
                                                    event.target.value,
                                                )
                                                update(index, {
                                                    credit: value,
                                                    debit:
                                                        value > 0
                                                            ? 0
                                                            : line.debit,
                                                })
                                            }}
                                        />
                                    </td>
                                    <td className="p-2">
                                        <Button
                                            size="xs"
                                            variant="plain"
                                            disabled={lines.length <= 2}
                                            onClick={() => remove(index)}
                                        >
                                            Remove
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="font-semibold">
                                <td colSpan={3} className="p-2 text-right">
                                    Totals
                                </td>
                                <td className="p-2 text-right">
                                    {totals.debit.toFixed(2)}
                                </td>
                                <td className="p-2 text-right">
                                    {totals.credit.toFixed(2)}
                                </td>
                                <td />
                            </tr>
                        </tfoot>
                    </table>
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <span
                        className={
                            balanced ? 'text-emerald-600' : 'text-red-600'
                        }
                    >
                        {balanced
                            ? 'Entry is balanced'
                            : 'Debits and credits must balance'}
                    </span>
                    <div className="flex gap-2">
                        <Button onClick={() => router.back()}>Cancel</Button>
                        <Button
                            loading={mutations.saving}
                            disabled={!canSubmit}
                            onClick={() => void submit('DRAFT')}
                        >
                            Save draft
                        </Button>
                        <Button
                            variant="solid"
                            loading={mutations.saving}
                            disabled={!canSubmit}
                            onClick={() => void submit('POSTED')}
                        >
                            Post
                        </Button>
                    </div>
                </div>
            </AdaptiveCard>
        </PageContainer>
    )
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
    return (
        <label className="text-sm">
            {text}
            <div className="mt-1">{children}</div>
        </label>
    )
}
