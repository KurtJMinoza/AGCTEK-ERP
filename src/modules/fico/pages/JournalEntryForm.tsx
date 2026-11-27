'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Breadcrumb from '@/components/shared/Breadcrumb'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import ErpBackLink from '@/components/erp/ErpBackLink'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import useResourceAccess from '@/utils/hooks/useResourceAccess'
import {
    FicoCompanySelect,
    notifyError,
    notifySuccess,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import { useManualJournalDocumentTypes } from '../hooks/useDocumentTypes'
import { useJournalEntryMutations } from '../hooks/useJournalEntries'
import {
    ficoErrorMessage,
    ficoGlAccountService,
    ficoPeriodService,
    ficoSettingsService,
} from '../services/ficoService'
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
    const mutations = useJournalEntryMutations()
    const access = useResourceAccess('fico.journal-entries')
    const {
        companies,
        companyId,
        setCompanyId,
        selectedRow,
        loading: companyLoading,
    } = useFicoCompanies()
    const types = useManualJournalDocumentTypes(companyId)
    const breadcrumbs = buildErpBreadcrumbs(`${ROUTE}/new`)

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
    const [dirty, setDirty] = useState(false)
    const [periodChip, setPeriodChip] = useState<{
        status: string | null
        canPost: boolean
        name?: string
    } | null>(null)

    useEffect(() => {
        const base = selectedRow?.settings?.baseCurrency
        if (base) {
            setCurrencyCode(base.toUpperCase())
            return
        }
        if (!companyId) return
        void ficoSettingsService
            .get(companyId)
            .then((settings) => {
                if (settings?.baseCurrency) {
                    setCurrencyCode(settings.baseCurrency.toUpperCase())
                }
            })
            .catch(() => undefined)
    }, [companyId, selectedRow])

    useEffect(() => {
        if (!companyId) {
            setAccounts([])
            return
        }
        let cancelled = false
        const load = async () => {
            setAccountsLoading(true)
            setAccountsError(null)
            try {
                const assignments =
                    await ficoGlAccountService.listCompanyAssignments(companyId)
                if (cancelled) return
                const byId = new Map<string, FicoGlAccount>()
                const byCode = new Set<string>()
                for (const assignment of assignments) {
                    const account = assignment.glAccount
                    if (!account) continue
                    if (assignment.postingEnabled !== true) continue
                    if (assignment.manualPostingBlocked) continue
                    if (account.status && account.status !== 'ACTIVE') continue
                    if (!account.isPostingAccount) continue
                    if (account.allowManualPosting === false) continue
                    if (byId.has(account.id)) continue
                    const code = (account.accountCode || '').trim()
                    if (code && byCode.has(code)) continue
                    byId.set(account.id, account)
                    if (code) byCode.add(code)
                }
                setAccounts(
                    Array.from(byId.values()).sort((a, b) =>
                        a.accountCode.localeCompare(b.accountCode),
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

    useEffect(() => {
        if (!companyId || !postingDate) {
            setPeriodChip(null)
            return
        }
        let cancelled = false
        void ficoPeriodService
            .resolve(companyId, postingDate)
            .then((resolved) => {
                if (cancelled) return
                setPeriodChip({
                    status: resolved.status,
                    canPost: resolved.canPost,
                    name: resolved.period?.name,
                })
            })
            .catch(() => {
                if (!cancelled) setPeriodChip(null)
            })
        return () => {
            cancelled = true
        }
    }, [companyId, postingDate])

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
    const linesWithAmounts = lines.filter(
        (line) => Number(line.debit) > 0 || Number(line.credit) > 0,
    ).length
    const hasMinLines = linesWithAmounts >= 2

    const visibleAccounts = companyId ? accounts : []
    const manualTypes = types.manualOptions

    useEffect(() => {
        if (
            documentTypeId &&
            !manualTypes.some((type) => type.documentTypeId === documentTypeId)
        ) {
            setDocumentTypeId('')
        }
    }, [documentTypeId, manualTypes])

    useEffect(() => {
        if (!documentTypeId && manualTypes.length === 1) {
            setDocumentTypeId(manualTypes[0].documentTypeId)
        }
    }, [documentTypeId, manualTypes])

    const markDirty = () => setDirty(true)

    const selectCompany = (nextCompanyId: string) => {
        markDirty()
        setCompanyId(nextCompanyId)
        setDocumentTypeId('')
        setLines((current) =>
            current.map((line) => ({ ...line, glAccountId: '' })),
        )
    }

    const update = (index: number, patch: Partial<FicoJournalEntryLineInput>) => {
        markDirty()
        setLines((current) =>
            current.map((line, lineIndex) =>
                lineIndex === index ? { ...line, ...patch } : line,
            ),
        )
    }
    const remove = (index: number) => {
        markDirty()
        setLines((current) =>
            current.filter((_, lineIndex) => lineIndex !== index),
        )
    }

    const cancel = () => {
        if (
            dirty &&
            !window.confirm('Discard unsaved journal entry changes?')
        ) {
            return
        }
        router.push(ROUTE)
    }

    const submit = async (status: 'DRAFT' | 'POSTED') => {
        setError(null)
        if (!access.canCreate) {
            setError('You do not have permission to create journal entries.')
            return
        }
        if (!companyId) {
            setError('Company is required.')
            return
        }
        if (!documentTypeId) {
            setError('Select a document type that allows manual entry.')
            return
        }
        if (!balanced || !hasMinLines) {
            setError('Debits and credits must balance')
            return
        }
        try {
            const result = await mutations.create({
                companyId,
                documentTypeId,
                postingDate,
                documentDate: documentDate || postingDate,
                reference: reference || undefined,
                headerText: headerText || undefined,
                currencyCode,
                status,
                lines: lines.filter(
                    (line) =>
                        line.glAccountId &&
                        (Number(line.debit) > 0 || Number(line.credit) > 0),
                ),
            })
            notifySuccess(
                status === 'POSTED'
                    ? `Posted ${result.documentNumber || 'journal entry'}.`
                    : `Draft ${result.documentNumber || 'journal entry'} saved.`,
            )
            router.push(`${ROUTE}/${result.id}`)
        } catch (submitError) {
            const message = ficoErrorMessage(
                submitError,
                'Unable to save journal entry',
            )
            setError(message)
            notifyError(submitError, message)
        }
    }

    const canSubmit =
        access.canCreate &&
        Boolean(companyId) &&
        Boolean(documentTypeId) &&
        balanced &&
        hasMinLines &&
        !mutations.saving &&
        !accountsLoading

    const periodTone =
        periodChip?.status === 'OPEN' || periodChip?.status === 'RESTRICTED'
            ? 'bg-emerald-100 text-emerald-800'
            : periodChip?.status === 'FUTURE'
              ? 'bg-sky-100 text-sky-800'
              : periodChip?.status
                ? 'bg-amber-100 text-amber-900'
                : ''

    return (
        <PageContainer>
            <ErpBackLink items={breadcrumbs} />
            <Breadcrumb items={breadcrumbs} className="mb-4" />
            <PageHeader
                title="New Journal Entry"
                description="Enter a balanced document. Posting validates company configuration, fiscal period, and G/L accounts."
            />
            {!access.canCreate && (
                <Alert showIcon type="warning" className="mb-4">
                    You can view this form, but create permission is required to
                    save or post journal entries.
                </Alert>
            )}
            {(error || types.error || accountsError) && (
                <Alert showIcon type="danger" className="mb-4">
                    {error || types.error || accountsError}
                </Alert>
            )}
            {manualTypes.length === 0 && companyId && !types.loading && (
                <Alert showIcon type="info" className="mb-4">
                    No active manual document types (e.g. SA, AB) are available
                    for this company. Seed or activate FI document types first.
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
                            onChange={(event) => {
                                markDirty()
                                setDocumentTypeId(event.target.value)
                            }}
                        >
                            <option value="">
                                {types.loading
                                    ? 'Loading types…'
                                    : 'Select type'}
                            </option>
                            {manualTypes.map((type) => (
                                <option
                                    key={type.companyTypeId}
                                    value={type.documentTypeId}
                                >
                                    {type.label}
                                </option>
                            ))}
                        </select>
                    </Label>
                    <Label text="Posting date">
                        <div className="flex flex-col gap-2">
                            <Input
                                type="date"
                                value={postingDate}
                                onChange={(event) => {
                                    markDirty()
                                    const next = event.target.value
                                    setPostingDate(next)
                                    if (!documentDate || documentDate === postingDate) {
                                        setDocumentDate(next)
                                    }
                                }}
                            />
                            {periodChip?.status && (
                                <Tag className={periodTone}>
                                    Period {periodChip.status}
                                    {periodChip.name ? ` · ${periodChip.name}` : ''}
                                </Tag>
                            )}
                        </div>
                    </Label>
                    <Label text="Document date">
                        <Input
                            type="date"
                            value={documentDate}
                            onChange={(event) => {
                                markDirty()
                                setDocumentDate(event.target.value)
                            }}
                        />
                    </Label>
                    <Label text="Reference">
                        <Input
                            value={reference}
                            onChange={(event) => {
                                markDirty()
                                setReference(event.target.value)
                            }}
                        />
                    </Label>
                    <Label text="Header text">
                        <Input
                            value={headerText}
                            onChange={(event) => {
                                markDirty()
                                setHeaderText(event.target.value)
                            }}
                        />
                    </Label>
                    <Label text="Currency">
                        <Input
                            maxLength={3}
                            value={currencyCode}
                            readOnly
                            className="bg-gray-50"
                        />
                    </Label>
                </div>
            </AdaptiveCard>
            <AdaptiveCard>
                <div className="mb-4 flex items-center justify-between">
                    <h5>Entry lines</h5>
                    <Button
                        size="sm"
                        onClick={() => {
                            markDirty()
                            setLines((current) => [...current, emptyLine()])
                        }}
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
                                            disabled={
                                                !companyId || accountsLoading
                                            }
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
                            balanced && hasMinLines
                                ? 'text-emerald-600'
                                : 'text-red-600'
                        }
                    >
                        {balanced && hasMinLines
                            ? 'Entry is balanced'
                            : 'Debits and credits must balance'}
                    </span>
                    <div className="flex gap-2">
                        <Button onClick={cancel}>Cancel</Button>
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

function Label({
    text,
    children,
}: {
    text: string
    children: React.ReactNode
}) {
    return (
        <label className="text-sm">
            {text}
            <div className="mt-1">{children}</div>
        </label>
    )
}
