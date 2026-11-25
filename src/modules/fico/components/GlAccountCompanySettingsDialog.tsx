'use client'

import { useCallback, useEffect, useState } from 'react'
import FormDialog from '@/components/shared/FormDialog'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import Input from '@/components/ui/Input'
import Tabs from '@/components/ui/Tabs'
import { HiOutlineOfficeBuilding } from 'react-icons/hi'
import { notifyError, notifySuccess } from './FicoCompanySelect'
import { ficoGlAccountService } from '../services/ficoService'
import type { FicoGlAccountCompanyContext, FicoCompanyGlAccount } from '../types'
import { accountTypeLabel, ficoStatusTone } from './ficoTableUi'

type Props = {
    accountId: string | null
    onClose: () => void
    onSaved?: () => void
}

type AssignmentForm = {
    postingEnabled: boolean
    manualPostingBlocked: boolean
    effectiveFrom: string
    effectiveTo: string
}

const emptyAssignment: AssignmentForm = {
    postingEnabled: true,
    manualPostingBlocked: false,
    effectiveFrom: '',
    effectiveTo: '',
}

const GlAccountCompanySettingsDialog = ({ accountId, onClose, onSaved }: Props) => {
    const [context, setContext] = useState<FicoGlAccountCompanyContext | null>(null)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [activeCompanyId, setActiveCompanyId] = useState('')
    const [pickCompanyId, setPickCompanyId] = useState('')
    const [form, setForm] = useState<AssignmentForm>(emptyAssignment)

    const load = useCallback(() => {
        if (!accountId) return
        setLoading(true)
        ficoGlAccountService
            .companySettings(accountId)
            .then((data) => {
                setContext(data)
                const first =
                    data.assignments[0]?.companyId ??
                    data.eligibleCompanies[0]?.company.id ??
                    ''
                setActiveCompanyId(first)
            })
            .catch((error) =>
                notifyError(error, 'Unable to load company assignment settings.'),
            )
            .finally(() => setLoading(false))
    }, [accountId])

    useEffect(() => {
        if (accountId) load()
        else {
            setContext(null)
            setActiveCompanyId('')
        }
    }, [accountId, load])

    useEffect(() => {
        if (!context || !activeCompanyId) {
            setForm(emptyAssignment)
            return
        }
        const existing = context.assignments.find(
            (row) => row.companyId === activeCompanyId,
        )
        setForm({
            postingEnabled: existing?.postingEnabled ?? true,
            manualPostingBlocked: existing?.manualPostingBlocked ?? false,
            effectiveFrom: existing?.effectiveFrom?.slice(0, 10) ?? '',
            effectiveTo: existing?.effectiveTo?.slice(0, 10) ?? '',
        })
    }, [context, activeCompanyId])

    const activeAssignment = context?.assignments.find(
        (row) => row.companyId === activeCompanyId,
    )

    const blockPosting = async () => {
        if (!accountId || !activeCompanyId) return
        setSaving(true)
        try {
            await ficoGlAccountService.blockCompanyPosting(accountId, activeCompanyId)
            notifySuccess('Company posting blocked for this account.')
            load()
            onSaved?.()
        } catch (error) {
            notifyError(error, 'Unable to block posting.')
        } finally {
            setSaving(false)
        }
    }

    const unblockPosting = async () => {
        if (!accountId || !activeCompanyId) return
        setSaving(true)
        try {
            await ficoGlAccountService.unblockCompanyPosting(accountId, activeCompanyId)
            notifySuccess('Company posting unblocked for this account.')
            load()
            onSaved?.()
        } catch (error) {
            notifyError(error, 'Unable to unblock posting.')
        } finally {
            setSaving(false)
        }
    }

    const save = async () => {
        if (!accountId || !activeCompanyId) return
        setSaving(true)
        try {
            await ficoGlAccountService.upsertCompanyAssignment(accountId, activeCompanyId, {
                postingEnabled: form.postingEnabled,
                manualPostingBlocked: form.manualPostingBlocked,
                effectiveFrom: form.effectiveFrom || null,
                effectiveTo: form.effectiveTo || null,
            })
            notifySuccess('Company-specific settings saved.')
            load()
            onSaved?.()
        } catch (error) {
            notifyError(error, 'Unable to save company settings.')
        } finally {
            setSaving(false)
        }
    }

    const assignNewCompany = async () => {
        if (!accountId || !pickCompanyId) return
        setSaving(true)
        try {
            await ficoGlAccountService.upsertCompanyAssignment(accountId, pickCompanyId, {
                postingEnabled: true,
                manualPostingBlocked: false,
                effectiveFrom: null,
                effectiveTo: null,
            })
            notifySuccess('Company assigned.')
            setPickCompanyId('')
            load()
            setActiveCompanyId(pickCompanyId)
            onSaved?.()
        } catch (error) {
            notifyError(error, 'Unable to assign the company.')
        } finally {
            setSaving(false)
        }
    }

    const master = context?.account

    return (
        <FormDialog
            isOpen={Boolean(accountId)}
            onClose={onClose}
            size="xl"
            width={960}
            icon={<HiOutlineOfficeBuilding />}
            title="Company G/L settings"
            description={
                master ? (
                    <span>
                        <span className="font-mono font-semibold">{master.accountCode}</span>{' '}
                        {master.accountName} · {accountTypeLabel(master.accountType)}
                    </span>
                ) : null
            }
            footer={
                <>
                    <Button type="button" onClick={onClose}>
                        Close
                    </Button>
                    {activeCompanyId ? (
                        <Button
                            type="button"
                            variant="solid"
                            loading={saving}
                            onClick={() => void save()}
                        >
                            Save {activeAssignment ? 'changes' : 'assignment'}
                        </Button>
                    ) : null}
                </>
            }
        >
            {loading || !context ? (
                <p className="text-sm text-gray-500">Loading company settings…</p>
            ) : master ? (
                <div className="space-y-5">
                    <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-800/40">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Shared account identity
                        </p>
                        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                            <div>
                                Chart:{' '}
                                <span className="font-medium">
                                    {master.chartOfAccounts?.code ?? '—'}
                                </span>
                            </div>
                            <div>
                                Group:{' '}
                                <span className="font-medium">
                                    {master.accountGroup?.code ?? '—'}
                                </span>
                            </div>
                            <div>
                                Master manual posting:{' '}
                                {master.allowManualPosting ? 'Allowed' : 'Restricted'}
                            </div>
                            <div>
                                Master automatic posting:{' '}
                                {master.allowAutomaticPosting ? 'Allowed' : 'Restricted'}
                            </div>
                            <div>
                                Currency policy:{' '}
                                {master.currencyRestriction || 'Any currency'}
                            </div>
                            <div>
                                Reconciliation:{' '}
                                {master.isReconciliationAccount
                                    ? master.reconciliationType ?? 'Yes'
                                    : 'None'}
                            </div>
                        </div>
                    </div>

                    <Tabs value={activeCompanyId} onChange={setActiveCompanyId}>
                        <Tabs.TabList className="mb-3 flex flex-wrap gap-1">
                            {context.assignments.map((row: FicoCompanyGlAccount) => (
                                <Tabs.TabNav key={row.companyId} value={row.companyId}>
                                    {row.company?.code ?? row.companyId}
                                </Tabs.TabNav>
                            ))}
                        </Tabs.TabList>
                    </Tabs>

                    {context.eligibleCompanies.length ? (
                        <div className="flex flex-wrap items-end gap-2">
                            <FormItem label="Assign eligible company" className="mb-0 min-w-[16rem] flex-1">
                                <Select
                                    placeholder="Select company"
                                    options={context.eligibleCompanies.map((row) => ({
                                        value: row.company.id,
                                        label: `${row.company.code} — ${row.company.name}`,
                                    }))}
                                    value={
                                        pickCompanyId
                                            ? context.eligibleCompanies
                                                  .map((row) => ({
                                                      value: row.company.id,
                                                      label: `${row.company.code} — ${row.company.name}`,
                                                  }))
                                                  .find((o) => o.value === pickCompanyId) ?? null
                                            : null
                                    }
                                    onChange={(option) =>
                                        setPickCompanyId(
                                            (option as { value: string } | null)?.value ?? '',
                                        )
                                    }
                                />
                            </FormItem>
                            <Button
                                size="sm"
                                variant="solid"
                                loading={saving}
                                disabled={!pickCompanyId}
                                onClick={() => void assignNewCompany()}
                            >
                                Assign
                            </Button>
                        </div>
                    ) : null}

                    {activeCompanyId ? (
                        <div className="space-y-4">
                            {(() => {
                                const assignment = context.assignments.find(
                                    (r) => r.companyId === activeCompanyId,
                                )
                                const eligible = context.eligibleCompanies.find(
                                    (r) => r.company.id === activeCompanyId,
                                )
                                const company = assignment?.company ?? eligible?.company
                                return (
                                    <p className="text-sm text-gray-600 dark:text-gray-300">
                                        {company?.name ?? 'Company'}{' '}
                                        <StatusBadge
                                            tone={ficoStatusTone(
                                                assignment?.postingEnabled
                                                    ? 'ACTIVE'
                                                    : 'INACTIVE',
                                            )}
                                        >
                                            {assignment?.postingEnabled
                                                ? 'Posting enabled'
                                                : 'Posting blocked'}
                                        </StatusBadge>
                                        {eligible ? (
                                            <span className="ml-2 text-xs text-gray-500">
                                                Base currency {eligible.baseCurrency}
                                            </span>
                                        ) : null}
                                    </p>
                                )
                            })()}

                            <div className="space-y-3">
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        size="sm"
                                        variant="plain"
                                        disabled={saving || !form.postingEnabled}
                                        onClick={() => void blockPosting()}
                                    >
                                        Block posting
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="plain"
                                        disabled={saving || form.postingEnabled}
                                        onClick={() => void unblockPosting()}
                                    >
                                        Unblock posting
                                    </Button>
                                </div>
                                <Checkbox
                                    checked={form.postingEnabled}
                                    onChange={(checked) =>
                                        setForm((c) => ({ ...c, postingEnabled: checked }))
                                    }
                                >
                                    Posting allowed for this company
                                </Checkbox>
                                <Checkbox
                                    checked={form.manualPostingBlocked}
                                    onChange={(checked) =>
                                        setForm((c) => ({
                                            ...c,
                                            manualPostingBlocked: checked,
                                        }))
                                    }
                                >
                                    Block manual postings (automatic only)
                                </Checkbox>
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <FormItem label="Effective from">
                                    <Input
                                        type="date"
                                        value={form.effectiveFrom}
                                        onChange={(e) =>
                                            setForm((c) => ({
                                                ...c,
                                                effectiveFrom: e.target.value,
                                            }))
                                        }
                                    />
                                </FormItem>
                                <FormItem label="Effective to">
                                    <Input
                                        type="date"
                                        value={form.effectiveTo}
                                        onChange={(e) =>
                                            setForm((c) => ({
                                                ...c,
                                                effectiveTo: e.target.value,
                                            }))
                                        }
                                    />
                                </FormItem>
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500">
                            No company selected. Assign an eligible company to configure
                            company-specific posting controls.
                        </p>
                    )}

                    {context.assignmentHistory.length ? (
                        <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                Recent assignment history
                            </p>
                            <ul className="max-h-36 space-y-1 overflow-y-auto text-xs text-gray-600 dark:text-gray-300">
                                {context.assignmentHistory.map((row) => (
                                    <li key={row.id}>
                                        {row.action} · {new Date(row.createdAt).toLocaleString()}
                                        {row.reason ? ` · ${row.reason}` : ''}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
                </div>
            ) : (
                <p className="text-sm text-gray-500">Account data is unavailable.</p>
            )}
        </FormDialog>
    )
}

export default GlAccountCompanySettingsDialog