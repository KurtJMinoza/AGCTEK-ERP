'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import usePermissions from '@/utils/hooks/usePermissions'
import {
    HiOutlineClipboardList,
    HiOutlineMinus,
    HiOutlinePlus,
    HiOutlineSave,
    HiOutlineX,
} from 'react-icons/hi'
import {
    notifyError,
    notifySuccess,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import type { FicoGlAccount } from '../types'
import { ficoGlAccountService, ficoJournalService } from '../services/ficoService'

const JOURNAL_ROUTE = '/modules/fico/journal-entries'

type JournalLineForm = {
    id: string
    glAccountId: string
    glAccountCode: string
    glAccountName: string
    debitAmount: string
    creditAmount: string
    description: string
}

type JournalForm = {
    companyId: string
    documentType: string
    postingDate: string
    documentDate: string
    currencyCode: string
    description: string
    requiresApproval: boolean
    autoPost: boolean
    lines: JournalLineForm[]
}

const emptyLine = (id: string): JournalLineForm => ({
    id,
    glAccountId: '',
    glAccountCode: '',
    glAccountName: '',
    debitAmount: '',
    creditAmount: '',
    description: '',
})

const EMPTY_FORM: JournalForm = {
    companyId: '',
    documentType: 'JOURNAL',
    postingDate: '',
    documentDate: '',
    currencyCode: 'PHP',
    description: '',
    requiresApproval: true,
    autoPost: false,
    lines: [],
}

const formatMoney = (value: string) => {
    const n = Number(value) || 0
    return n.toFixed(2)
}

const JournalEntryFormPage = () => {
    const router = useRouter()
    const { companies, loading: companyLoading } = useFicoCompanies()
    const { can } = usePermissions()
    const canCreate = can('fico.journal-entries', 'create')

    const [form, setForm] = useState<JournalForm>({ ...EMPTY_FORM })
    const [accounts, setAccounts] = useState<FicoGlAccount[]>([])
    const [loading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)

    useEffect(() => {
        if (!form.companyId) {
            setAccounts([])
            return
        }
        let active = true
        ficoGlAccountService
            .list({
                companyId: form.companyId,
                status: 'ACTIVE',
            })
            .then((result) => {
                if (active) setAccounts(result)
            })
            .catch((error) =>
                notifyError(error, 'Unable to load G/L accounts.'),
            )
        return () => {
            active = false
        }
    }, [form.companyId])

    const today = new Date().toISOString().slice(0, 10)

    useEffect(() => {
        if (!form.postingDate) {
            setForm((previous) => ({
                ...previous,
                postingDate: today,
                documentDate: today,
            }))
        }
    }, [])

    const accountOptions = useMemo(
        () =>
            accounts.map((account) => ({
                value: account.id,
                label: `${account.accountCode} — ${account.accountName}`,
            })),
        [accounts],
    )

    const setLineField = (
        index: number,
        key: keyof JournalLineForm,
        value: string,
    ) => {
        setForm((previous) => {
            const lines = [...previous.lines]
            lines[index] = { ...lines[index], [key]: value }
            return { ...previous, lines }
        })
    }

    const addLine = () => {
        setForm((previous) => ({
            ...previous,
            lines: [...previous.lines, emptyLine(`line-${Date.now()}`)],
        }))
    }

    const removeLine = (index: number) => {
        setForm((previous) => {
            const lines = previous.lines.filter((_, i) => i !== index)
            return { ...previous, lines }
        })
    }

    const setField = (key: keyof JournalForm, value: string | boolean) => {
        setForm((previous) => ({ ...previous, [key]: value }))
    }

    const totals = useMemo(() => {
        const debit = form.lines.reduce(
            (sum, line) => sum + (Number(line.debitAmount) || 0),
            0,
        )
        const credit = form.lines.reduce(
            (sum, line) => sum + (Number(line.creditAmount) || 0),
            0,
        )
        return { debit, credit, balanced: Math.abs(debit - credit) < 0.0001 }
    }, [form.lines])

    const validate = () => {
        const errors: string[] = []
        if (!form.companyId) errors.push('Select a company.')
        if (!form.postingDate) errors.push('Posting date is required.')
        if (!form.documentType) errors.push('Document type is required.')
        if (!form.currencyCode) errors.push('Currency is required.')
        if (!form.description.trim())
            errors.push('Header description is required.')
        if (form.lines.length < 2)
            errors.push('At least two journal lines are required.')
        if (!totals.balanced)
            errors.push(
                `Entry is unbalanced: debits ${formatMoney(
                    totals.debit.toString(),
                )} ≠ credits ${formatMoney(totals.credit.toString())}.`,
            )
        for (const line of form.lines) {
            const debit = Number(line.debitAmount) || 0
            const credit = Number(line.creditAmount) || 0
            if (!line.glAccountId)
                errors.push(`Line ${line.id}: select a G/L account.`)
            if (debit < 0 || credit < 0)
                errors.push(`Line ${line.id}: negative amounts are not allowed.`)
            if (debit > 0 && credit > 0)
                errors.push(`Line ${line.id}: cannot have both debit and credit.`)
            if (debit === 0 && credit === 0)
                errors.push(`Line ${line.id}: zero-value line is not allowed.`)
            if (!line.description.trim())
                errors.push(`Line ${line.id}: line description is required.`)
        }
        if (!totals.balanced && form.lines.length >= 2) {
            // balance error already added
        }
        setFormError(errors.length ? errors.join(' ') : null)
        return errors.length === 0
    }

    const save = async () => {
        if (!validate()) return
        setSaving(true)
        try {
            const requiresApproval = form.requiresApproval
            const autoPost = form.autoPost && !requiresApproval

            const created = await ficoJournalService.create(
                {
                    companyId: form.companyId,
                    postingDate: form.postingDate,
                    currencyCode: form.currencyCode,
                    description: form.description.trim() || undefined,
                    requiresApproval,
                    autoPost,
                    lines: form.lines.map((line) => ({
                        glAccountId: line.glAccountId,
                        debitAmount: Number(line.debitAmount) || 0,
                        creditAmount: Number(line.creditAmount) || 0,
                        description: line.description.trim() || undefined,
                    })),
                },
                undefined,
            )
            notifySuccess(
                `Journal entry ${created.documentNumber} created${
                    created.status === 'DRAFT'
                        ? ' as a draft'
                        : created.status === 'POSTED'
                          ? ' and posted'
                          : ''
                }.`,
            )
            router.push(`${JOURNAL_ROUTE}/${created.id}`)
        } catch (error) {
            notifyError(error, 'Unable to create the journal entry.')
        } finally {
            setSaving(false)
        }
    }

    const cancel = () => router.push(JOURNAL_ROUTE)

    if (loading) {
        return (
            <PageContainer>
                <PageHeader
                    title="Create Journal Entry"
                    description="Creating journal entry…"
                    breadcrumbs={buildErpBreadcrumbs(`${JOURNAL_ROUTE}/create`)}
                />
                <AdaptiveCard>
                    <p className="py-10 text-center text-sm text-gray-500">
                        Creating journal entry…
                    </p>
                </AdaptiveCard>
            </PageContainer>
        )
    }

    return (
        <PageContainer>
            <PageHeader
                title="Create Journal Entry"
                description="Enter header information and at least two balanced debit/credit lines. The entry is validated before it can be submitted for approval or posted."
                breadcrumbs={buildErpBreadcrumbs(`${JOURNAL_ROUTE}/create`)}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="plain" onClick={cancel} disabled={saving}>
                            <HiOutlineX className="mr-1.5 h-4 w-4" />
                            Cancel
                        </Button>
                        <Button
                            variant="solid"
                            onClick={save}
                            loading={saving}
                            disabled={!canCreate}
                        >
                            <HiOutlineSave className="mr-1.5 h-4 w-4" />
                            {saving ? 'Creating…' : 'Create journal entry'}
                        </Button>
                    </div>
                }
            />

            {formError ? (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                    {formError}
                </div>
            ) : null}

            <AdaptiveCard>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    Header information
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <FormItem label="Company" asterisk>
                        <Select
                            value={
                                accounts.length > 0
                                    ? {
                                          value: form.companyId,
                                          label: companyOptionLabel(
                                              companies,
                                              form.companyId,
                                          ),
                                      }
                                    : null
                            }
                            options={companies.map((company) => ({
                                value: company.id,
                                label: `${company.code} — ${company.name}`,
                            }))}
                            isClearable={false}
                            isDisabled={companyLoading}
                            placeholder="Select company"
                            onChange={(option) =>
                                setField(
                                    'companyId',
                                    (option as { value: string } | null)
                                        ?.value ?? '',
                                )
                            }
                        />
                    </FormItem>
                    <FormItem label="Document type" asterisk>
                        <Select
                            value={{
                                value: form.documentType,
                                label: form.documentType,
                            }}
                            options={[
                                { value: 'JOURNAL', label: 'General Journal' },
                                { value: 'SUPPLIER_INVOICE', label: 'Supplier Invoice' },
                                { value: 'SUPPLIER_PAYMENT', label: 'Supplier Payment' },
                                { value: 'CUSTOMER_INVOICE', label: 'Customer Invoice' },
                                { value: 'CUSTOMER_PAYMENT', label: 'Customer Payment' },
                                { value: 'ASSET_ACCOUNTING', label: 'Asset Accounting' },
                                { value: 'INVENTORY_ACCOUNTING', label: 'Inventory Accounting' },
                                { value: 'SALES_ACCOUNTING', label: 'Sales Accounting' },
                                { value: 'REVERSAL', label: 'Reversal' },
                            ]}
                            isClearable={false}
                            onChange={(option) =>
                                setField(
                                    'documentType',
                                    (option as { value: string } | null)
                                        ?.value ?? 'JOURNAL',
                                )
                            }
                        />
                    </FormItem>
                    <FormItem label="Currency" asterisk>
                        <Select
                            value={{
                                value: form.currencyCode,
                                label: form.currencyCode,
                            }}
                            options={[
                                { value: 'PHP', label: 'PHP' },
                                { value: 'USD', label: 'USD' },
                                { value: 'EUR', label: 'EUR' },
                            ]}
                            isClearable={false}
                            onChange={(option) =>
                                setField(
                                    'currencyCode',
                                    (option as { value: string } | null)
                                        ?.value ?? 'PHP',
                                )
                            }
                        />
                    </FormItem>
                    <FormItem label="Posting date" asterisk>
                        <Input
                            type="date"
                            value={form.postingDate}
                            onChange={(event) =>
                                setField('postingDate', event.target.value)
                            }
                        />
                    </FormItem>
                    <FormItem label="Document date">
                        <Input
                            type="date"
                            value={form.documentDate}
                            onChange={(event) =>
                                setField('documentDate', event.target.value)
                            }
                        />
                    </FormItem>
                    <FormItem
                        label="Header description"
                        asterisk
                        className="sm:col-span-2 lg:col-span-3"
                    >
                        <Input
                            textArea
                            rows={2}
                            value={form.description}
                            placeholder="Description of the entire journal entry"
                            onChange={(event) =>
                                setField('description', event.target.value)
                            }
                        />
                    </FormItem>
                    <div className="sm:col-span-2 lg:col-span-3 flex items-end gap-2">
                        <Checkbox
                            checked={form.requiresApproval}
                            onChange={(checked) =>
                                setField('requiresApproval', checked)
                            }
                        >
                            Requires approval
                        </Checkbox>
                    </div>
                </div>
            </AdaptiveCard>

            <AdaptiveCard className="mt-6">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                    <HiOutlineClipboardList className="h-5 w-5" />
                    Journal lines
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                    At least two lines. Total debits must equal total credits.
                </p>
                <div className="space-y-2">
                    {form.lines.map((line, index) => (
                        <div
                            key={line.id}
                            className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                        >
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 items-end">
                                <FormItem label="G/L account" asterisk>
                                    <Select
                                        value={
                                            accountOptions.find(
                                                (o) => o.value === line.glAccountId,
                                            ) ?? null
                                        }
                                        options={accountOptions}
                                        isClearable
                                        placeholder="Select account"
                                        onChange={(option) => {
                                            const selected =
                                                option as
                                                    | { value: string; label: string }
                                                    | null
                                            const account = accounts.find(
                                                (a) => a.id === selected?.value,
                                            )
                                            setLineField(index, 'glAccountId', selected?.value ?? '')
                                            setLineField(
                                                index,
                                                'glAccountCode',
                                                account?.accountCode ?? '',
                                            )
                                            setLineField(
                                                index,
                                                'glAccountName',
                                                account?.accountName ?? '',
                                            )
                                        }}
                                    />
                                </FormItem>
                                <FormItem label="Debit">
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={line.debitAmount}
                                        onChange={(event) =>
                                            setLineField(
                                                index,
                                                'debitAmount',
                                                event.target.value,
                                            )
                                        }
                                    />
                                </FormItem>
                                <FormItem label="Credit">
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={line.creditAmount}
                                        onChange={(event) =>
                                            setLineField(
                                                index,
                                                'creditAmount',
                                                event.target.value,
                                            )
                                        }
                                    />
                                </FormItem>
                                <FormItem label="Description" className="sm:col-span-2">
                                    <Input
                                        value={line.description}
                                        onChange={(event) =>
                                            setLineField(
                                                index,
                                                'description',
                                                event.target.value,
                                            )
                                        }
                                    />
                                </FormItem>
                                <div className="flex items-end">
                                    <Button
                                        variant="default"
                                        size="sm"
                                        onClick={() => removeLine(index)}
                                        disabled={form.lines.length <= 2}
                                    >
                                        <HiOutlineMinus className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-3 flex items-end justify-between">
                    <Button variant="default" size="sm" onClick={addLine}>
                        <HiOutlinePlus className="mr-1.5 h-4 w-4" />
                        Add line
                    </Button>
                    <div className="text-right">
                        <div className="text-xs text-gray-500">Totals</div>
                        <div className="text-sm font-mono font-semibold">
                            Dr {formatMoney(totals.debit.toString())} /{' '}
                            Cr {formatMoney(totals.credit.toString())}{' '}
                            {totals.balanced ? '(balanced)' : '(unbalanced)'}
                        </div>
                    </div>
                </div>
            </AdaptiveCard>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <AdaptiveCard>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        Approval
                    </h3>
                    <p className="text-xs text-gray-500">
                        When approval is required, the entry is created as a draft
                        and must be submitted and approved before it can be posted to
                        the general ledger.
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                        <Checkbox
                            checked={form.autoPost}
                            disabled={form.requiresApproval}
                            onChange={(checked) =>
                                setField('autoPost', checked)
                            }
                        >
                            Auto-post after creation
                        </Checkbox>
                    </div>
                    {form.requiresApproval && form.autoPost ? (
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                            Auto-post is disabled when approval is required.
                        </p>
                    ) : null}
                </AdaptiveCard>
                <AdaptiveCard>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        Validation
                    </h3>
                    <ul className="text-xs text-gray-500 space-y-1">
                        <li>• At least two journal lines</li>
                        <li>• Total debits equal total credits</li>
                        <li>• Valid, active G/L accounts</li>
                        <li>• No negative or zero-value lines</li>
                        <li>• Posting date in an open period</li>
                    </ul>
                </AdaptiveCard>
            </div>
        </PageContainer>
    )
}


function companyOptionLabel(
    companies: { id: string; code: string; name: string }[],
    companyId: string,
): string {
    const c = companies.find((x) => x.id === companyId)
    return c ? `${c.code} — ${c.name}` : companyId
}

export default JournalEntryFormPage
