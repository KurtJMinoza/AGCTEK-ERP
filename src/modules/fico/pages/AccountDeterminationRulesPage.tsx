'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import EllipsisButton from '@/components/shared/EllipsisButton'
import FormDialog from '@/components/shared/FormDialog'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Dropdown from '@/components/ui/Dropdown'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tabs from '@/components/ui/Tabs'
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlineCheckCircle,
    HiOutlineClipboardList,
    HiOutlineExclamation,
    HiOutlinePause,
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineRefresh,
    HiOutlineTrash,
} from 'react-icons/hi'
import { notifyError, notifySuccess } from '../components/FicoCompanySelect'
import FicoResponsiveTable, { type ColumnDef } from '../components/FicoResponsiveTable'
import {
    FicoCodeCell,
    FicoStatusCell,
    FicoTwoLineCell,
    formatFicoDate,
} from '../components/ficoTableUi'
import { ficoGlAccountService, ficoSettingsService } from '../services/ficoService'
import { ficoAccountDeterminationRuleService } from '../services/accountDeterminationService'
import type {
    FicoDeterminationHistoryEntry,
    FicoDeterminationLineInput,
    FicoDeterminationModule,
    FicoDeterminationReference,
    FicoDeterminationRule,
    FicoDeterminationSummary,
    FicoDeterminationWorkbenchOverview,
    TransactionKeyCatalogRow,
} from '../accountDeterminationTypes'
import {
    DeterminationExceptionsPanel,
    DeterminationModuleCoveragePanel,
    DeterminationTransactionKeysPanel,
} from '../components/account-determination/DeterminationWorkbenchPanels'
import DeterminationSimulationWorkbench from '../components/account-determination/DeterminationSimulationWorkbench'
import DeterminationGlAccountPicker from '../components/account-determination/DeterminationGlAccountPicker'
import type { FicoCompany, FicoGlAccount } from '../types'

type TabKey =
    | 'overview'
    | 'rules'
    | 'transaction-keys'
    | 'module-coverage'
    | 'simulation'
    | 'history'
    | 'exceptions'

/** Fallback module list until the reference endpoint answers. */
const FALLBACK_MODULES: FicoDeterminationModule[] = ['MM', 'SD', 'PP']

const MODULE_LABEL: Record<FicoDeterminationModule, string> = {
    MM: 'Materials Management',
    SD: 'Sales & Distribution',
    PP: 'Production Planning',
    TREASURY: 'Bank & Treasury',
    AP: 'Accounts Payable',
    AR: 'Accounts Receivable',
    AA: 'Asset Accounting',
    CO: 'Controlling',
}

type LineForm = {
    side: 'DEBIT' | 'CREDIT'
    glAccountId: string
    description: string
}

type RuleForm = {
    determinationCode: string
    name: string
    description: string
    sourceModule: FicoDeterminationModule
    transactionType: string
    transactionKeyCode: string
    priority: string
    effectiveFrom: string
    effectiveTo: string
    valuationClassId: string
    materialTypeCode: string
    movementType: string
    customerAccountGroup: string
    salesOrganization: string
    distributionChannel: string
    changeReason: string
    lines: LineForm[]
}

const emptyForm: RuleForm = {
    determinationCode: '',
    name: '',
    description: '',
    sourceModule: 'MM',
    transactionType: '',
    transactionKeyCode: '',
    priority: '100',
    effectiveFrom: '',
    effectiveTo: '',
    valuationClassId: '',
    materialTypeCode: '',
    movementType: '',
    customerAccountGroup: '',
    salesOrganization: '',
    distributionChannel: '',
    changeReason: '',
    lines: [
        { side: 'DEBIT', glAccountId: '', description: '' },
        { side: 'CREDIT', glAccountId: '', description: '' },
    ],
}

type ActionKind =
    | 'submit'
    | 'resubmit'
    | 'approve'
    | 'reject'
    | 'activate'
    | 'deactivate'

const ACTION_COPY: Record<ActionKind, { title: string; confirm: string }> = {
    submit: { title: 'Submit determination for approval?', confirm: 'Submit' },
    resubmit: { title: 'Resubmit determination?', confirm: 'Resubmit' },
    approve: { title: 'Approve determination?', confirm: 'Approve' },
    reject: { title: 'Reject determination', confirm: 'Reject' },
    activate: { title: 'Activate determination?', confirm: 'Activate' },
    deactivate: { title: 'Deactivate determination?', confirm: 'Deactivate' },
}

function dimensionsOf(rule: FicoDeterminationRule) {
    const parts: string[] = []
    if (rule.valuationClass) parts.push(`Class ${rule.valuationClass.code}`)
    if (rule.materialTypeCode) parts.push(`Type ${rule.materialTypeCode}`)
    if (rule.movementType) parts.push(`Movement ${rule.movementType}`)
    if (rule.customerAccountGroup) parts.push(`Customer ${rule.customerAccountGroup}`)
    if (rule.salesOrganization) parts.push(`Sales org ${rule.salesOrganization}`)
    if (rule.distributionChannel) parts.push(`Channel ${rule.distributionChannel}`)
    return parts.length ? parts.join(' · ') : 'No dimensions (catch-all)'
}

export default function AccountDeterminationRulesPage({
    workbench = false,
}: {
    workbench?: boolean
}) {
    const [companies, setCompanies] = useState<FicoCompany[]>([])
    const [companyId, setCompanyId] = useState('')
    const [tab, setTab] = useState<TabKey>(workbench ? 'overview' : 'rules')
    const [statusFilter, setStatusFilter] = useState('')
    const [search, setSearch] = useState('')
    const [searchTerm, setSearchTerm] = useState('')
    const [rules, setRules] = useState<FicoDeterminationRule[]>([])
    const [summary, setSummary] = useState<FicoDeterminationSummary | null>(null)
    const [workbenchOverview, setWorkbenchOverview] =
        useState<FicoDeterminationWorkbenchOverview | null>(null)
    const [transactionKeys, setTransactionKeys] = useState<TransactionKeyCatalogRow[]>([])
    const [reference, setReference] = useState<FicoDeterminationReference | null>(null)
    const [accounts, setAccounts] = useState<FicoGlAccount[]>([])
    const [historyRows, setHistoryRows] = useState<FicoDeterminationHistoryEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    const [dialog, setDialog] = useState<'create' | 'edit' | null>(null)
    const [editing, setEditing] = useState<FicoDeterminationRule | null>(null)
    const [form, setForm] = useState<RuleForm>(emptyForm)
    const [detail, setDetail] = useState<FicoDeterminationRule | null>(null)
    const [detailHistory, setDetailHistory] = useState<FicoDeterminationHistoryEntry[]>([])
    const [action, setAction] = useState<{ kind: ActionKind; rule: FicoDeterminationRule } | null>(
        null,
    )
    const [reason, setReason] = useState('')
    const [deleting, setDeleting] = useState<FicoDeterminationRule | null>(null)
    const [draftValidation, setDraftValidation] = useState<{
        ok: boolean
        errors: string[]
        warnings: string[]
    } | null>(null)

    useEffect(() => {
        ficoSettingsService
            .listAccessibleCompanies()
            .then((rows) => {
                setCompanies(rows)
                setCompanyId((current) => current || rows[0]?.id || '')
            })
            .catch((error) => notifyError(error, 'Unable to load companies.'))
    }, [])

    /** Debounced so typing in the search box does not refetch on every keystroke. */
    useEffect(() => {
        const timer = setTimeout(() => setSearchTerm(search.trim()), 350)
        return () => clearTimeout(timer)
    }, [search])

    /** Reference data and the key catalogue are company-scoped and cached. */
    useEffect(() => {
        if (!companyId) return
        let cancelled = false
        void (async () => {
            try {
                const [referenceData, accountRows, catalog] = await Promise.all([
                    ficoAccountDeterminationRuleService.reference(companyId),
                    ficoGlAccountService.list({ companyId, status: 'ACTIVE' }),
                    ficoAccountDeterminationRuleService.transactionKeyCatalog(),
                ])
                if (cancelled) return
                setReference(referenceData)
                setAccounts(accountRows)
                setTransactionKeys(catalog)
            } catch (error) {
                if (!cancelled) notifyError(error, 'Unable to load determination reference data.')
            }
        })()
        return () => {
            cancelled = true
        }
    }, [companyId])

    const load = useCallback(async () => {
        if (!companyId) return
        // Transaction keys, coverage, simulation and exceptions own their own
        // fetches; switching to those tabs must not refetch the rules list.
        if (tab !== 'overview' && tab !== 'rules' && tab !== 'history') return
        setLoading(true)
        try {
            const [list, summaryData] = await Promise.all([
                ficoAccountDeterminationRuleService.list({
                    companyId,
                    ...(statusFilter ? { status: statusFilter } : {}),
                    ...(searchTerm ? { search: searchTerm } : {}),
                    pageSize: 100,
                }),
                workbench
                    ? ficoAccountDeterminationRuleService.workbenchOverview(companyId)
                    : ficoAccountDeterminationRuleService.summary(companyId),
            ])
            setRules(list.items)
            setSummary(summaryData as FicoDeterminationSummary)
            if (workbench) {
                setWorkbenchOverview(summaryData as FicoDeterminationWorkbenchOverview)
            }
            if (tab === 'history') {
                const history = await ficoAccountDeterminationRuleService.configurationHistory({
                    companyId,
                    pageSize: 100,
                })
                setHistoryRows(history.items)
            }
        } catch (error) {
            notifyError(error, 'Unable to load account determination.')
        } finally {
            setLoading(false)
        }
    }, [companyId, tab, statusFilter, searchTerm, workbench])

    useEffect(() => {
        void load()
    }, [load])

    const accountOptions = useMemo(
        () =>
            accounts.map((account) => ({
                value: account.id,
                label: `${account.accountCode} — ${account.accountName}`,
            })),
        [accounts],
    )

    const typeOptions = useMemo(() => {
        const moduleRef = reference?.modules.find((entry) => entry.code === form.sourceModule)
        return (moduleRef?.transactionTypes ?? []).map((entry) => ({
            value: entry.code,
            label: `${entry.code.replaceAll('_', ' ')} — ${entry.label}`,
        }))
    }, [reference, form.sourceModule])

    const modules = useMemo(
        () =>
            (reference?.modules.length ? reference.modules : null)?.map((entry) => ({
                code: entry.code,
                label: entry.label,
            })) ??
            FALLBACK_MODULES.map((code) => ({ code, label: MODULE_LABEL[code] })),
        [reference],
    )

    const moduleOptions = useMemo(
        () =>
            modules.map((entry) => ({
                value: entry.code,
                label: `${entry.code} — ${entry.label}`,
            })),
        [modules],
    )

    const statusOptions = [
        { value: '', label: 'All statuses' },
        { value: 'DRAFT', label: 'Draft' },
        { value: 'PENDING_APPROVAL', label: 'Pending approval' },
        { value: 'APPROVED', label: 'Approved' },
        { value: 'ACTIVE', label: 'Active' },
        { value: 'INACTIVE', label: 'Inactive' },
        { value: 'REJECTED', label: 'Rejected' },
    ]

    const openCreate = () => {
        setEditing(null)
        setForm({
            ...emptyForm,
            sourceModule: 'MM',
            lines: [
                { side: 'DEBIT', glAccountId: '', description: '' },
                { side: 'CREDIT', glAccountId: '', description: '' },
            ],
        })
        setDialog('create')
    }

    const openEdit = (rule: FicoDeterminationRule) => {
        setEditing(rule)
        setForm({
            determinationCode: rule.determinationCode,
            name: rule.name,
            description: rule.description ?? '',
            sourceModule: rule.sourceModule,
            transactionType: rule.transactionType,
            transactionKeyCode: rule.transactionKeyCode ?? '',
            priority: String(rule.priority),
            effectiveFrom: rule.effectiveFrom ? rule.effectiveFrom.slice(0, 10) : '',
            effectiveTo: rule.effectiveTo ? rule.effectiveTo.slice(0, 10) : '',
            valuationClassId: rule.valuationClassId ?? '',
            materialTypeCode: rule.materialTypeCode ?? '',
            movementType: rule.movementType ?? '',
            customerAccountGroup: rule.customerAccountGroup ?? '',
            salesOrganization: rule.salesOrganization ?? '',
            distributionChannel: rule.distributionChannel ?? '',
            changeReason: '',
            lines: rule.lines.map((line) => ({
                side: line.side,
                glAccountId: line.glAccountId,
                description: line.description ?? '',
            })),
        })
        setDialog('edit')
    }

    const buildDraftPayload = (): Record<string, unknown> => ({
        name: form.name,
        description: form.description,
        transactionKeyCode: form.transactionKeyCode || null,
        priority: Number(form.priority) || 100,
        effectiveFrom: form.effectiveFrom || null,
        effectiveTo: form.effectiveTo || null,
        valuationClassId: form.valuationClassId || null,
        materialTypeCode: form.materialTypeCode || null,
        movementType: form.movementType || null,
        customerAccountGroup: form.customerAccountGroup || null,
        salesOrganization: form.salesOrganization || null,
        distributionChannel: form.distributionChannel || null,
        changeReason: form.changeReason || null,
        companyId,
        sourceModule: form.sourceModule,
        transactionType: form.transactionType,
        determinationCode: form.determinationCode,
        lines: form.lines.map<FicoDeterminationLineInput>((line) => ({
            side: line.side,
            glAccountId: line.glAccountId,
            description: line.description || undefined,
        })),
    })

    const validateDraftForm = async () => {
        if (!companyId) return
        try {
            const result = await ficoAccountDeterminationRuleService.validateDraft(
                buildDraftPayload(),
            )
            setDraftValidation(result)
        } catch (error) {
            notifyError(error, 'Validation failed.')
        }
    }

    const simulateDraftForm = async () => {
        if (!companyId || !form.transactionKeyCode) {
            notifyError(new Error('Set a transaction key to simulate.'), 'Simulation')
            return
        }
        try {
            const data = await ficoAccountDeterminationRuleService.simulate({
                mode: 'SINGLE_KEY',
                companyId,
                sourceModule: form.sourceModule,
                transactionKey: form.transactionKeyCode,
                transactionType: form.transactionType,
                postingDate: form.effectiveFrom || new Date().toISOString().slice(0, 10),
                dimensions: {
                    valuationClassId: form.valuationClassId || undefined,
                    materialTypeCode: form.materialTypeCode || undefined,
                    movementType: form.movementType || undefined,
                    customerAccountGroup: form.customerAccountGroup || undefined,
                    salesOrganization: form.salesOrganization || undefined,
                    distributionChannel: form.distributionChannel || undefined,
                },
            })
            setDraftValidation({
                ok: !data.configurationErrors.length && !!data.selectedRule,
                errors: data.configurationErrors,
                warnings: data.validationWarnings,
            })
        } catch (error) {
            notifyError(error, 'Simulation failed.')
        }
    }

    const save = async () => {
        if (!companyId) return
        if (form.lines.length < 2) {
            notifyError(new Error('Add at least one debit and one credit line.'), 'Incomplete rule.')
            return
        }
        if (form.lines.some((line) => !line.glAccountId)) {
            notifyError(new Error('Every line needs a G/L account.'), 'Incomplete rule.')
            return
        }
        const payload: Record<string, unknown> = {
            name: form.name,
            description: form.description,
            transactionKeyCode: form.transactionKeyCode || null,
            priority: Number(form.priority) || 100,
            effectiveFrom: form.effectiveFrom || null,
            effectiveTo: form.effectiveTo || null,
            valuationClassId: form.valuationClassId || null,
            materialTypeCode: form.materialTypeCode || null,
            movementType: form.movementType || null,
            customerAccountGroup: form.customerAccountGroup || null,
            salesOrganization: form.salesOrganization || null,
            distributionChannel: form.distributionChannel || null,
            changeReason: form.changeReason || null,
            lines: form.lines.map<FicoDeterminationLineInput>((line) => ({
                side: line.side,
                glAccountId: line.glAccountId,
                description: line.description || undefined,
            })),
        }
        setSaving(true)
        try {
            if (dialog === 'edit' && editing) {
                await ficoAccountDeterminationRuleService.update(editing.id, payload)
                notifySuccess('Determination updated.')
            } else {
                await ficoAccountDeterminationRuleService.create({
                    ...payload,
                    companyId,
                    sourceModule: form.sourceModule,
                    transactionType: form.transactionType,
                    transactionKeyCode: form.transactionKeyCode || null,
                    determinationCode: form.determinationCode,
                })
                notifySuccess('Determination created as a draft.')
            }
            setDialog(null)
            await load()
        } catch (error) {
            notifyError(error, 'Unable to save the determination.')
        } finally {
            setSaving(false)
        }
    }

    const runAction = async () => {
        if (!action) return
        setSaving(true)
        try {
            const { kind, rule } = action
            if (kind === 'submit') await ficoAccountDeterminationRuleService.submit(rule.id)
            if (kind === 'resubmit') await ficoAccountDeterminationRuleService.resubmit(rule.id)
            if (kind === 'approve') await ficoAccountDeterminationRuleService.approve(rule.id, reason)
            if (kind === 'reject') await ficoAccountDeterminationRuleService.reject(rule.id, reason)
            if (kind === 'activate') await ficoAccountDeterminationRuleService.activate(rule.id)
            if (kind === 'deactivate')
                await ficoAccountDeterminationRuleService.deactivate(rule.id, reason)
            notifySuccess('Determination updated.')
            setAction(null)
            setReason('')
            setDetail(null)
            await load()
        } catch (error) {
            notifyError(error, 'The determination action failed.')
        } finally {
            setSaving(false)
        }
    }

    const remove = async () => {
        if (!deleting) return
        setSaving(true)
        try {
            await ficoAccountDeterminationRuleService.remove(deleting.id)
            notifySuccess('Draft determination deleted.')
            setDeleting(null)
            await load()
        } catch (error) {
            notifyError(error, 'Unable to delete the determination.')
        } finally {
            setSaving(false)
        }
    }

    const openDetail = async (rule: FicoDeterminationRule) => {
        setDetail(rule)
        setDetailHistory([])
        try {
            const [full, history] = await Promise.all([
                ficoAccountDeterminationRuleService.get(rule.id),
                ficoAccountDeterminationRuleService.history(rule.id),
            ])
            setDetail(full)
            setDetailHistory(history)
        } catch (error) {
            notifyError(error, 'Unable to load the determination.')
        }
    }

    const columns = useMemo<ColumnDef<FicoDeterminationRule>[]>(
        () => [
            {
                header: 'Determination',
                id: 'code',
                cell: ({ row }) => (
                    <FicoCodeCell
                        icon="posting"
                        code={row.original.determinationCode}
                        name={row.original.name}
                    />
                ),
            },
            {
                header: 'Module',
                id: 'module',
                cell: ({ row }) => (
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                        {row.original.sourceModule}
                    </span>
                ),
            },
            {
                header: 'Transaction type',
                id: 'type',
                cell: ({ row }) => (
                    <FicoTwoLineCell
                        primary={row.original.transactionType.replaceAll('_', ' ')}
                        secondary={row.original.transactionKeyCode ?? 'No transaction key'}
                    />
                ),
            },
            {
                header: 'Dimensions',
                id: 'dimensions',
                cell: ({ row }) => (
                    <span className="text-xs text-gray-600 dark:text-gray-300">
                        {dimensionsOf(row.original)}
                    </span>
                ),
            },
            {
                header: 'Lines',
                id: 'lines',
                cell: ({ row }) => {
                    const debit = row.original.lines.filter((line) => line.side === 'DEBIT').length
                    const credit = row.original.lines.filter((line) => line.side === 'CREDIT').length
                    return (
                        <span className="text-xs text-gray-600 dark:text-gray-300">
                            {debit} Dr / {credit} Cr
                        </span>
                    )
                },
            },
            {
                header: 'Priority',
                id: 'priority',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                        {row.original.priority}
                    </span>
                ),
            },
            {
                header: 'Effective',
                id: 'effective',
                cell: ({ row }) =>
                    !row.original.effectiveFrom && !row.original.effectiveTo ? (
                        <span className="text-xs text-gray-500">Always</span>
                    ) : (
                        <span className="whitespace-nowrap text-xs text-gray-600 dark:text-gray-300">
                            {row.original.effectiveFrom
                                ? formatFicoDate(row.original.effectiveFrom)
                                : '…'}{' '}
                            –{' '}
                            {row.original.effectiveTo
                                ? formatFicoDate(row.original.effectiveTo)
                                : '…'}
                        </span>
                    ),
            },
            {
                header: 'Status',
                id: 'status',
                cell: ({ row }) => (
                    <div>
                        <FicoStatusCell status={row.original.status} />
                        {row.original.status === 'REJECTED' && row.original.rejectionReason ? (
                            <p className="mt-1 max-w-[180px] text-[11px] text-red-500">
                                {row.original.rejectionReason}
                            </p>
                        ) : null}
                    </div>
                ),
            },
            {
                header: '',
                id: 'actions',
                size: 52,
                cell: ({ row }) => {
                    const rule = row.original
                    return (
                        <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                            <Dropdown.Item eventKey="view" onClick={() => void openDetail(rule)}>
                                <HiOutlineClipboardList className="text-base" />
                                <span>View details</span>
                            </Dropdown.Item>
                            {rule.status === 'DRAFT' ? (
                                <Dropdown.Item eventKey="edit" onClick={() => openEdit(rule)}>
                                    <HiOutlinePencil className="text-base" />
                                    <span>Edit</span>
                                </Dropdown.Item>
                            ) : null}
                            {rule.status === 'DRAFT' ? (
                                <Dropdown.Item
                                    eventKey="submit"
                                    onClick={() => setAction({ kind: 'submit', rule })}
                                >
                                    <HiOutlineCheckCircle className="text-base" />
                                    <span>Submit for approval</span>
                                </Dropdown.Item>
                            ) : null}
                            {rule.status === 'REJECTED' ? (
                                <Dropdown.Item
                                    eventKey="resubmit"
                                    onClick={() => setAction({ kind: 'resubmit', rule })}
                                >
                                    <HiOutlineRefresh className="text-base" />
                                    <span>Resubmit</span>
                                </Dropdown.Item>
                            ) : null}
                            {rule.status === 'PENDING_APPROVAL' ? (
                                <Dropdown.Item
                                    eventKey="approve"
                                    onClick={() => setAction({ kind: 'approve', rule })}
                                >
                                    <HiOutlineCheckCircle className="text-base" />
                                    <span>Approve</span>
                                </Dropdown.Item>
                            ) : null}
                            {rule.status === 'PENDING_APPROVAL' ? (
                                <Dropdown.Item
                                    eventKey="reject"
                                    onClick={() => setAction({ kind: 'reject', rule })}
                                >
                                    <HiOutlineExclamation className="text-base text-red-500" />
                                    <span className="text-red-500">Reject</span>
                                </Dropdown.Item>
                            ) : null}
                            {['APPROVED', 'INACTIVE'].includes(rule.status) ? (
                                <Dropdown.Item
                                    eventKey="activate"
                                    onClick={() => setAction({ kind: 'activate', rule })}
                                >
                                    <HiOutlineCheckCircle className="text-base" />
                                    <span>Activate</span>
                                </Dropdown.Item>
                            ) : null}
                            {rule.status === 'ACTIVE' ? (
                                <Dropdown.Item
                                    eventKey="deactivate"
                                    onClick={() => setAction({ kind: 'deactivate', rule })}
                                >
                                    <HiOutlinePause className="text-base" />
                                    <span>Deactivate</span>
                                </Dropdown.Item>
                            ) : null}
                            <Dropdown.Item
                                eventKey="validate"
                                onClick={async () => {
                                    try {
                                        const result =
                                            await ficoAccountDeterminationRuleService.validateRule(
                                                rule.id,
                                            )
                                        if (result.ok) {
                                            notifySuccess(
                                                `${rule.determinationCode} passed validation.`,
                                            )
                                        } else {
                                            notifyError(
                                                new Error(result.errors.join(' ')),
                                                `${rule.determinationCode} failed validation.`,
                                            )
                                        }
                                    } catch (error) {
                                        notifyError(error, 'Unable to validate rule.')
                                    }
                                }}
                            >
                                <HiOutlineCheckCircle className="text-base" />
                                <span>Validate rule</span>
                            </Dropdown.Item>
                            <Dropdown.Item
                                eventKey="duplicate"
                                onClick={async () => {
                                    try {
                                        await ficoAccountDeterminationRuleService.duplicateRule(
                                            rule.id,
                                        )
                                        notifySuccess('Rule duplicated as draft.')
                                        await load()
                                    } catch (error) {
                                        notifyError(error, 'Unable to duplicate rule.')
                                    }
                                }}
                            >
                                <HiOutlinePlus className="text-base" />
                                <span>Duplicate as draft</span>
                            </Dropdown.Item>
                            {['ACTIVE', 'APPROVED', 'INACTIVE'].includes(rule.status) ? (
                                <Dropdown.Item
                                    eventKey="new-version"
                                    onClick={async () => {
                                        try {
                                            const result =
                                                await ficoAccountDeterminationRuleService.newVersion(
                                                    rule.id,
                                                    {},
                                                )
                                            notifySuccess(
                                                `Replacement draft ${result.successor.determinationCode} created.`,
                                            )
                                            await load()
                                        } catch (error) {
                                            notifyError(
                                                error,
                                                'Unable to create a replacement version.',
                                            )
                                        }
                                    }}
                                >
                                    <HiOutlineRefresh className="text-base" />
                                    <span>Create replacement version</span>
                                </Dropdown.Item>
                            ) : null}
                            {rule.status === 'DRAFT' ? (
                                <Dropdown.Item eventKey="delete" onClick={() => setDeleting(rule)}>
                                    <HiOutlineTrash className="text-base text-red-500" />
                                    <span className="text-red-500">Delete draft</span>
                                </Dropdown.Item>
                            ) : null}
                        </Dropdown>
                    )
                },
            },
        ],
        [],
    )

    const mobile = useMemo(
        () => ({
            title: (row: FicoDeterminationRule) => row.determinationCode,
            subtitle: (row: FicoDeterminationRule) => row.name,
            status: (row: FicoDeterminationRule) => ({
                text: row.status,
                tone:
                    row.status === 'ACTIVE'
                        ? ('success' as const)
                        : row.status === 'REJECTED'
                          ? ('danger' as const)
                          : row.status === 'PENDING_APPROVAL'
                            ? ('warning' as const)
                            : ('default' as const),
            }),
            onPress: (row: FicoDeterminationRule) => void openDetail(row),
            fields: [
                {
                    label: 'Module',
                    value: (row: FicoDeterminationRule) =>
                        `${row.sourceModule} · ${row.transactionType.replaceAll('_', ' ')}`,
                },
                {
                    label: 'Dimensions',
                    value: (row: FicoDeterminationRule) => dimensionsOf(row),
                },
                {
                    label: 'Priority',
                    value: (row: FicoDeterminationRule) => String(row.priority),
                },
                {
                    label: 'Lines',
                    value: (row: FicoDeterminationRule) =>
                        `${row.lines.filter((line) => line.side === 'DEBIT').length} Dr / ${
                            row.lines.filter((line) => line.side === 'CREDIT').length
                        } Cr`,
                },
            ],
        }),
        [],
    )

    const displayRules = rules

    return (
        <>
            {tab === 'overview' || !workbench ? (
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                    <StatCard
                        label="Total rules"
                        value={summary ? summary.total : '—'}
                        icon={<HiOutlineClipboardList />}
                        loading={loading}
                    />
                    <StatCard
                        label="Active"
                        value={summary ? summary.active : '—'}
                        icon={<HiOutlineCheckCircle />}
                        tone="success"
                        loading={loading}
                    />
                    <StatCard
                        label="Drafts"
                        value={summary ? summary.drafts : '—'}
                        icon={<HiOutlinePencil />}
                        tone="info"
                        loading={loading}
                    />
                    <StatCard
                        label="Pending approval"
                        value={summary ? summary.pendingApproval : '—'}
                        icon={<HiOutlineExclamation />}
                        tone="warning"
                        loading={loading}
                    />
                    {workbench && workbenchOverview ? (
                        <>
                            <StatCard
                                label="Scheduled"
                                value={workbenchOverview.scheduledRules}
                                loading={loading}
                            />
                            <StatCard
                                label="Posting exceptions"
                                value={workbenchOverview.pendingAccountingEvents}
                                tone={
                                    workbenchOverview.pendingAccountingEvents > 0
                                        ? 'warning'
                                        : 'default'
                                }
                                loading={loading}
                            />
                        </>
                    ) : null}
                </div>
            ) : null}

            <AdaptiveCard>
                <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end dark:border-gray-700 dark:bg-gray-800/40">
                    <FormItem label="Company" className="mb-0">
                        <Select
                            options={companies.map((company) => ({
                                value: company.id,
                                label: `${company.name} (${company.code})`,
                            }))}
                            value={
                                companies
                                    .map((company) => ({
                                        value: company.id,
                                        label: `${company.name} (${company.code})`,
                                    }))
                                    .find((option) => option.value === companyId) ?? null
                            }
                            onChange={(option) =>
                                setCompanyId((option as { value: string } | null)?.value ?? '')
                            }
                        />
                    </FormItem>
                    <FormItem label="Search" className="mb-0">
                        <Input
                            placeholder="Code or name"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    </FormItem>
                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        <Button
                            size="sm"
                            variant="plain"
                            icon={<HiOutlineRefresh />}
                            loading={loading}
                            onClick={() => void load()}
                        >
                            Refresh
                        </Button>
                        <Button
                            variant="solid"
                            size="sm"
                            icon={<HiOutlinePlus />}
                            disabled={!companyId}
                            onClick={openCreate}
                        >
                            New determination
                        </Button>
                    </div>
                </div>

                {summary && !Object.keys(summary.byModule).length ? (
                    <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                        No account determinations configured yet. Seed the Phase 1 catalogue or create
                        the first draft; nothing posts automatically until a rule is approved and
                        activated.
                    </p>
                ) : null}

                <Tabs value={tab} onChange={(value) => setTab(value as TabKey)}>
                    <Tabs.TabList className="flex flex-wrap gap-1">
                        <Tabs.TabNav value="overview">Overview</Tabs.TabNav>
                        <Tabs.TabNav value="rules">
                            Determination rules
                            <span className="ml-1.5 text-xs text-gray-400">{rules.length}</span>
                        </Tabs.TabNav>
                        {workbench ? (
                            <>
                                <Tabs.TabNav value="transaction-keys">Transaction keys</Tabs.TabNav>
                                <Tabs.TabNav value="module-coverage">Module coverage</Tabs.TabNav>
                                <Tabs.TabNav value="simulation">Simulation</Tabs.TabNav>
                                <Tabs.TabNav value="exceptions">Exceptions</Tabs.TabNav>
                            </>
                        ) : null}
                        <Tabs.TabNav value="history">Rule history</Tabs.TabNav>
                    </Tabs.TabList>
                </Tabs>

                {tab === 'overview' && workbench && workbenchOverview ? (
                    <div className="mt-4 rounded-xl border border-gray-100 p-4 text-sm dark:border-gray-700">
                        <ul className="grid gap-2 md:grid-cols-2">
                            <li>
                                Missing determination profile:{' '}
                                <strong>
                                    {workbenchOverview.missingAccountDeterminationProfile
                                        ? 'Yes'
                                        : 'No'}
                                </strong>
                            </li>
                            <li>
                                Invalid G/L on rules:{' '}
                                <strong>{workbenchOverview.invalidGlReferencesInRules}</strong>
                            </li>
                            <li>
                                Failed resolution events:{' '}
                                <strong>
                                    {workbenchOverview.failedAccountResolutionEvents}
                                </strong>
                            </li>
                            <li>
                                Live keys without active rule:{' '}
                                <strong>
                                    {workbenchOverview.missingLiveTransactionKeyRules}
                                </strong>
                            </li>
                        </ul>
                    </div>
                ) : null}

                {tab === 'transaction-keys' ? (
                    <DeterminationTransactionKeysPanel
                        catalog={transactionKeys}
                        loading={loading}
                    />
                ) : null}

                {tab === 'module-coverage' && companyId ? (
                    <DeterminationModuleCoveragePanel companyId={companyId} />
                ) : null}

                {tab === 'simulation' ? (
                    <DeterminationSimulationWorkbench companyId={companyId} modules={modules} />
                ) : null}

                {tab === 'exceptions' && companyId ? (
                    <DeterminationExceptionsPanel companyId={companyId} />
                ) : null}

                {tab === 'history' ? (
                    <div className="mt-4 space-y-2">
                        {historyRows.length ? (
                            historyRows.map((entry) => (
                                <div
                                    key={entry.id}
                                    className="rounded-xl border border-gray-100 p-3 text-sm dark:border-gray-700"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="font-semibold text-gray-800 dark:text-gray-100">
                                            {entry.action.replaceAll('_', ' ')}
                                        </span>
                                        <span className="text-xs text-gray-400">
                                            {formatFicoDate(entry.createdAt)}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-gray-500">
                                        Actor {entry.actorId ?? 'system'} · Rule{' '}
                                        {entry.entityId ?? '—'}
                                    </p>
                                    {entry.reason ? (
                                        <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                                            Reason: {entry.reason}
                                        </p>
                                    ) : null}
                                </div>
                            ))
                        ) : (
                            <p className="py-8 text-center text-sm text-gray-500">
                                No configuration changes recorded for this company yet.
                            </p>
                        )}
                    </div>
                ) : tab === 'rules' ? (
                    <>
                        <div className="mb-3 mt-4 flex flex-wrap items-end gap-3">
                            <FormItem label="Status" className="mb-0 w-48">
                                <Select
                                    options={statusOptions}
                                    value={
                                        statusOptions.find(
                                            (option) => option.value === statusFilter,
                                        ) ?? statusOptions[0]
                                    }
                                    onChange={(option) =>
                                        setStatusFilter(
                                            (option as { value: string } | null)?.value ?? '',
                                        )
                                    }
                                />
                            </FormItem>
                            <p className="text-xs text-gray-500">
                                Only approved, active and effective rules resolve accounts. Drafts and
                                pending rules never post.
                            </p>
                        </div>

                        <FicoResponsiveTable<FicoDeterminationRule>
                            columns={columns}
                            data={displayRules}
                            compact
                            loading={loading}
                            noData={!loading && !displayRules.length}
                            customNoDataIcon={
                                <p className="py-8 text-center text-sm text-gray-500">
                                    {companyId
                                        ? 'No determinations match these filters.'
                                        : 'Select a company to see its determinations.'}
                                </p>
                            }
                            getRowId={(row) => row.id}
                            hidePagination
                            tableMinWidthClass="min-w-[1180px]"
                            mobile={mobile}
                            instanceId="fico-account-determination-rules"
                        />
                    </>
                ) : null}
            </AdaptiveCard>

            <FormDialog
                isOpen={dialog !== null}
                onClose={() => {
                    setDialog(null)
                    setDraftValidation(null)
                }}
                size="xl"
                icon={<HiOutlineClipboardList />}
                title={dialog === 'edit' ? 'Edit determination' : 'New determination'}
                description="Multiple debit and credit lines are supported. Only draft determinations can be edited."
                footer={
                    <div className="flex w-full flex-wrap items-center justify-between gap-2">
                        <div className="text-[11px] text-gray-500">
                            {draftValidation ? (
                                draftValidation.ok ? (
                                    <span className="text-emerald-700">Validation passed</span>
                                ) : (
                                    <span className="text-red-600">
                                        {draftValidation.errors[0] ?? 'Validation failed'}
                                    </span>
                                )
                            ) : (
                                'Section 05 — validate or simulate before submit'
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                size="sm"
                                variant="plain"
                                onClick={() => {
                                    setDialog(null)
                                    setDraftValidation(null)
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                variant="plain"
                                loading={saving}
                                onClick={() => void validateDraftForm()}
                            >
                                Validate rule
                            </Button>
                            <Button
                                size="sm"
                                variant="plain"
                                onClick={() => void simulateDraftForm()}
                            >
                                Simulate rule
                            </Button>
                            <Button
                                size="sm"
                                variant="solid"
                                loading={saving}
                                onClick={() => void save()}
                            >
                                {dialog === 'edit' ? 'Save draft' : 'Save draft'}
                            </Button>
                            {editing?.status === 'DRAFT' ? (
                                <Button
                                    size="sm"
                                    variant="solid"
                                    onClick={() => {
                                        void save().then(() => {
                                            if (editing) {
                                                setAction({ kind: 'submit', rule: editing })
                                            }
                                        })
                                    }}
                                >
                                    Submit for approval
                                </Button>
                            ) : null}
                        </div>
                    </div>
                }
            >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Section 01 — General information
                </p>
                <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                    <FormItem label="Determination code" asterisk>
                        <Input
                            value={form.determinationCode}
                            disabled={dialog === 'edit'}
                            placeholder="MM-006"
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    determinationCode: event.target.value.toUpperCase(),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Name" asterisk>
                        <Input
                            value={form.name}
                            onChange={(event) =>
                                setForm((current) => ({ ...current, name: event.target.value }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Source module" asterisk>
                        <Select
                            isDisabled={dialog === 'edit'}
                            options={moduleOptions}
                            value={
                                moduleOptions.find(
                                    (option) => option.value === form.sourceModule,
                                ) ?? moduleOptions[0]
                            }
                            onChange={(option) =>
                                setForm((current) => ({
                                    ...current,
                                    sourceModule:
                                        ((option as { value: string } | null)?.value as
                                            | FicoDeterminationModule
                                            | undefined) ?? 'MM',
                                    transactionType: '',
                                    valuationClassId: '',
                                    materialTypeCode: '',
                                    movementType: '',
                                    customerAccountGroup: '',
                                    salesOrganization: '',
                                    distributionChannel: '',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Transaction type" asterisk>
                        <Select
                            isDisabled={dialog === 'edit'}
                            placeholder="Select a transaction type"
                            options={typeOptions}
                            value={typeOptions.find((option) => option.value === form.transactionType) ?? null}
                            onChange={(option) =>
                                setForm((current) => ({
                                    ...current,
                                    transactionType:
                                        (option as { value: string } | null)?.value ?? '',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Transaction key">
                        <Input
                            placeholder="GI_COGS · PAYMENT_CLEARING"
                            value={form.transactionKeyCode}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    transactionKeyCode: event.target.value.toUpperCase(),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Priority">
                        <Input
                            type="number"
                            value={form.priority}
                            onChange={(event) =>
                                setForm((current) => ({ ...current, priority: event.target.value }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Change reason">
                        <Input
                            value={form.changeReason}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    changeReason: event.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Effective from">
                        <Input
                            type="date"
                            value={form.effectiveFrom}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    effectiveFrom: event.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Effective to">
                        <Input
                            type="date"
                            value={form.effectiveTo}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    effectiveTo: event.target.value,
                                }))
                            }
                        />
                    </FormItem>
                </div>
                <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Section 02 — Determination conditions
                </p>
                <p className="mb-3 text-[11px] text-gray-500">
                    Leave a condition blank to use a wildcard. Only fields relevant to the source
                    module should be constrained.
                </p>
                <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                    {form.sourceModule !== 'SD' ? (
                        <>
                            <FormItem label="Valuation class">
                                <Select
                                    placeholder="Any valuation class"
                                    options={[
                                        { value: '', label: 'Any valuation class' },
                                        ...(reference?.valuationClasses ?? []).map((row) => ({
                                            value: row.id,
                                            label: `${row.code} — ${row.name}`,
                                        })),
                                    ]}
                                    value={
                                        form.valuationClassId
                                            ? ({
                                                  value: form.valuationClassId,
                                                  label:
                                                      reference?.valuationClasses.find(
                                                          (row) => row.id === form.valuationClassId,
                                                      )?.code ?? form.valuationClassId,
                                              } as { value: string; label: string })
                                            : { value: '', label: 'Any valuation class' }
                                    }
                                    onChange={(option) =>
                                        setForm((current) => ({
                                            ...current,
                                            valuationClassId:
                                                (option as { value: string } | null)?.value ?? '',
                                        }))
                                    }
                                />
                            </FormItem>
                            <FormItem label="Material type">
                                <Select
                                    placeholder="Any material type"
                                    options={[
                                        { value: '', label: 'Any material type' },
                                        ...(reference?.materialTypes ?? []).map((row) => ({
                                            value: row.code,
                                            label: `${row.code} — ${row.name}`,
                                        })),
                                    ]}
                                    value={
                                        form.materialTypeCode
                                            ? ({
                                                  value: form.materialTypeCode,
                                                  label: form.materialTypeCode,
                                              } as { value: string; label: string })
                                            : { value: '', label: 'Any material type' }
                                    }
                                    onChange={(option) =>
                                        setForm((current) => ({
                                            ...current,
                                            materialTypeCode:
                                                (option as { value: string } | null)?.value ?? '',
                                        }))
                                    }
                                />
                            </FormItem>
                            <FormItem label="Movement type" className="sm:col-span-2">
                                <Input
                                    placeholder="e.g. 101, GI_SALES"
                                    value={form.movementType}
                                    onChange={(event) =>
                                        setForm((current) => ({
                                            ...current,
                                            movementType: event.target.value.toUpperCase(),
                                        }))
                                    }
                                />
                            </FormItem>
                        </>
                    ) : (
                        <>
                            <FormItem label="Customer account group">
                                <Select
                                    placeholder="Any customer group"
                                    options={[
                                        { value: '', label: 'Any customer group' },
                                        ...(reference?.customerAccountGroups ?? []).map((code) => ({
                                            value: code,
                                            label: code,
                                        })),
                                    ]}
                                    value={
                                        form.customerAccountGroup
                                            ? {
                                                  value: form.customerAccountGroup,
                                                  label: form.customerAccountGroup,
                                              }
                                            : { value: '', label: 'Any customer group' }
                                    }
                                    onChange={(option) =>
                                        setForm((current) => ({
                                            ...current,
                                            customerAccountGroup:
                                                (option as { value: string } | null)?.value ?? '',
                                        }))
                                    }
                                />
                            </FormItem>
                            <FormItem label="Sales organization">
                                <Select
                                    placeholder="Any sales organization"
                                    options={[
                                        { value: '', label: 'Any sales organization' },
                                        ...(reference?.salesOrganizations ?? []).map((code) => ({
                                            value: code,
                                            label: code,
                                        })),
                                    ]}
                                    value={
                                        form.salesOrganization
                                            ? {
                                                  value: form.salesOrganization,
                                                  label: form.salesOrganization,
                                              }
                                            : { value: '', label: 'Any sales organization' }
                                    }
                                    onChange={(option) =>
                                        setForm((current) => ({
                                            ...current,
                                            salesOrganization:
                                                (option as { value: string } | null)?.value ?? '',
                                        }))
                                    }
                                />
                            </FormItem>
                            <FormItem label="Distribution channel">
                                <Select
                                    placeholder="Any distribution channel"
                                    options={[
                                        { value: '', label: 'Any distribution channel' },
                                        ...(reference?.distributionChannels ?? []).map((code) => ({
                                            value: code,
                                            label: code,
                                        })),
                                    ]}
                                    value={
                                        form.distributionChannel
                                            ? {
                                                  value: form.distributionChannel,
                                                  label: form.distributionChannel,
                                              }
                                            : { value: '', label: 'Any distribution channel' }
                                    }
                                    onChange={(option) =>
                                        setForm((current) => ({
                                            ...current,
                                            distributionChannel:
                                                (option as { value: string } | null)?.value ?? '',
                                        }))
                                    }
                                />
                            </FormItem>
                        </>
                    )}
                    <FormItem label="Description" className="sm:col-span-2">
                        <Input
                            value={form.description}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    description: event.target.value,
                                }))
                            }
                        />
                    </FormItem>
                </div>

                <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Section 04 — Priority and validity
                </p>
                <p className="mb-3 text-[11px] text-gray-500">
                    Lower priority numbers win when specificity ties. More matching dimensions
                    outrank wildcards. Effective dates scope the rule. Active rules cannot be
                    edited — duplicate as draft to replace.
                </p>
                <p className="mb-2 mt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Section 03 — G/L account assignment
                </p>
                <div className="mt-2 rounded-xl border border-gray-100 p-3 dark:border-gray-700">
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                            Debit / credit lines
                        </p>
                        <div className="flex gap-2">
                            <Button
                                size="xs"
                                variant="plain"
                                icon={<HiOutlinePlus />}
                                onClick={() =>
                                    setForm((current) => ({
                                        ...current,
                                        lines: [
                                            ...current.lines,
                                            { side: 'DEBIT', glAccountId: '', description: '' },
                                        ],
                                    }))
                                }
                            >
                                Debit line
                            </Button>
                            <Button
                                size="xs"
                                variant="plain"
                                icon={<HiOutlinePlus />}
                                onClick={() =>
                                    setForm((current) => ({
                                        ...current,
                                        lines: [
                                            ...current.lines,
                                            { side: 'CREDIT', glAccountId: '', description: '' },
                                        ],
                                    }))
                                }
                            >
                                Credit line
                            </Button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        {form.lines.map((line, index) => (
                            <div
                                key={`${line.side}-${index}`}
                                className="grid grid-cols-1 gap-2 sm:grid-cols-[110px_1fr_1fr_40px] sm:items-center"
                            >
                                <Select
                                    options={[
                                        { value: 'DEBIT', label: 'Debit' },
                                        { value: 'CREDIT', label: 'Credit' },
                                    ]}
                                    value={{
                                        value: line.side,
                                        label: line.side === 'DEBIT' ? 'Debit' : 'Credit',
                                    }}
                                    onChange={(option) =>
                                        setForm((current) => ({
                                            ...current,
                                            lines: current.lines.map((row, rowIndex) =>
                                                rowIndex === index
                                                    ? {
                                                          ...row,
                                                          side:
                                                              ((option as { value: string } | null)
                                                                  ?.value as
                                                                  | 'DEBIT'
                                                                  | 'CREDIT'
                                                                  | undefined) ?? 'DEBIT',
                                                      }
                                                    : row,
                                            ),
                                        }))
                                    }
                                />
                                <DeterminationGlAccountPicker
                                    companyId={companyId}
                                    transactionKeyCode={form.transactionKeyCode || undefined}
                                    value={line.glAccountId}
                                    onChange={(glAccountId) =>
                                        setForm((current) => ({
                                            ...current,
                                            lines: current.lines.map((row, rowIndex) =>
                                                rowIndex === index
                                                    ? { ...row, glAccountId }
                                                    : row,
                                            ),
                                        }))
                                    }
                                />
                                <Input
                                    placeholder="Line description"
                                    value={line.description}
                                    onChange={(event) =>
                                        setForm((current) => ({
                                            ...current,
                                            lines: current.lines.map((row, rowIndex) =>
                                                rowIndex === index
                                                    ? { ...row, description: event.target.value }
                                                    : row,
                                            ),
                                        }))
                                    }
                                />
                                <Button
                                    size="xs"
                                    variant="plain"
                                    disabled={form.lines.length <= 2}
                                    icon={<HiOutlineTrash />}
                                    onClick={() =>
                                        setForm((current) => ({
                                            ...current,
                                            lines: current.lines.filter(
                                                (_row, rowIndex) => rowIndex !== index,
                                            ),
                                        }))
                                    }
                                />
                            </div>
                        ))}
                    </div>
                    {!accountOptions.length ? (
                        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                            No eligible accounts found. Accounts must be active, allow automatic
                            postings, and be assigned to this company on the G/L Accounts page.
                        </p>
                    ) : null}
                </div>
            </FormDialog>

            <FormDialog
                isOpen={action !== null}
                onClose={() => {
                    setAction(null)
                    setReason('')
                }}
                size="md"
                icon={<HiOutlineCheckCircle />}
                title={action ? ACTION_COPY[action.kind].title : ''}
                description={
                    action
                        ? `${action.rule.determinationCode} — ${action.rule.name}`
                        : undefined
                }
                onSubmit={runAction}
                confirmText={action ? ACTION_COPY[action.kind].confirm : 'Confirm'}
                confirmLoading={saving}
            >
                <FormItem
                    label={action?.kind === 'reject' ? 'Rejection reason' : 'Reason (optional)'}
                    asterisk={action?.kind === 'reject'}
                >
                    <Input
                        value={reason}
                        placeholder="Explain the decision"
                        onChange={(event) => setReason(event.target.value)}
                    />
                </FormItem>
                <p className="text-xs text-gray-500">
                    Every approval action is written to the immutable accounting audit trail with
                    the user, timestamp and previous values.
                </p>
            </FormDialog>

            <FormDialog
                isOpen={detail !== null}
                onClose={() => setDetail(null)}
                size="lg"
                icon={<HiOutlineClipboardList />}
                title={detail ? detail.determinationCode : ''}
                description={detail ? detail.name : undefined}
                footer={
                    <Button variant="plain" onClick={() => setDetail(null)}>
                        Close
                    </Button>
                }
            >
                {detail ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <FicoTwoLineCell
                                primary={`${detail.sourceModule} · ${detail.transactionType.replaceAll('_', ' ')}`}
                                secondary="Module and transaction type"
                            />
                            <FicoTwoLineCell
                                primary={detail.status}
                                secondary="Lifecycle status"
                            />
                            <FicoTwoLineCell
                                primary={dimensionsOf(detail)}
                                secondary="Dimensions"
                            />
                            <FicoTwoLineCell
                                primary={`Priority ${detail.priority}`}
                                secondary="Resolution priority"
                            />
                        </div>
                        <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                Posting lines
                            </p>
                            <div className="space-y-1">
                                {detail.lines.map((line) => (
                                    <div
                                        key={line.id ?? `${line.side}-${line.lineNumber}`}
                                        className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-700"
                                    >
                                        <span className="font-semibold text-gray-700 dark:text-gray-200">
                                            {line.side === 'DEBIT' ? 'Dr' : 'Cr'}
                                        </span>
                                        <span className="flex-1 text-gray-800 dark:text-gray-100">
                                            {line.glAccount
                                                ? `${line.glAccount.accountCode} — ${line.glAccount.accountName}`
                                                : line.glAccountId}
                                            {line.description ? (
                                                <span className="ml-2 text-xs text-gray-400">
                                                    {line.description}
                                                </span>
                                            ) : null}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                Approval trail
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-300">
                                Submitted {detail.submittedAt ? formatFicoDate(detail.submittedAt) : '—'} ·
                                Approved {detail.approvedAt ? formatFicoDate(detail.approvedAt) : '—'} ·
                                Activated {detail.activatedAt ? formatFicoDate(detail.activatedAt) : '—'}
                            </p>
                            {detail.rejectionReason ? (
                                <p className="mt-1 text-xs text-red-500">
                                    Rejected: {detail.rejectionReason}
                                </p>
                            ) : null}
                        </div>
                        <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                Change history
                            </p>
                            {detailHistory.length ? (
                                <div className="space-y-1">
                                    {detailHistory.map((entry) => (
                                        <div
                                            key={entry.id}
                                            className="rounded-lg border border-gray-100 px-3 py-2 text-xs dark:border-gray-700"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-semibold text-gray-700 dark:text-gray-200">
                                                    {entry.action.replaceAll('_', ' ')}
                                                </span>
                                                <span className="text-gray-400">
                                                    {formatFicoDate(entry.createdAt)}
                                                </span>
                                            </div>
                                            <p className="mt-0.5 text-gray-500">
                                                {entry.actorId ?? 'system'}
                                                {entry.reason ? ` · ${entry.reason}` : ''}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-gray-500">No changes recorded yet.</p>
                            )}
                        </div>
                    </div>
                ) : null}
            </FormDialog>

            <ConfirmDialog
                isOpen={Boolean(deleting)}
                type="danger"
                title="Delete draft determination?"
                confirmText="Delete"
                onRequestClose={() => setDeleting(null)}
                onCancel={() => setDeleting(null)}
                onConfirm={remove}
                confirmButtonProps={{
                    loading: saving,
                    customColorClass: () => 'bg-red-500 hover:bg-red-500/90 text-white',
                }}
            >
                <p>
                    Delete <span className="font-semibold">{deleting?.determinationCode}</span>? Only
                    drafts can be deleted; approved determinations must be deactivated instead.
                </p>
            </ConfirmDialog>
        </>
    )
}
