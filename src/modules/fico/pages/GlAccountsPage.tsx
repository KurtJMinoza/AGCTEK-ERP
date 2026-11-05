'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import usePermissions from '@/utils/hooks/usePermissions'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import EllipsisButton from '@/components/shared/EllipsisButton'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Dropdown from '@/components/ui/Dropdown'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Checkbox from '@/components/ui/Checkbox'
import Tabs from '@/components/ui/Tabs'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    HiOutlineDownload,
    HiOutlineHashtag,
    HiOutlineOfficeBuilding,
    HiOutlinePause,
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineRefresh,
    HiOutlineSearch,
    HiOutlineSearchCircle,
    HiOutlineTrash,
    HiOutlineUpload,
} from 'react-icons/hi'
import {
    FicoCompanySelect,
    notifyError,
    notifySuccess,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import FicoResponsiveTable, { type ColumnDef } from '../components/FicoResponsiveTable'
import {
    FicoAccountTypeTag,
    FicoBalanceCell,
    FicoCodeCell,
    FicoControlFlags,
    FicoCountCell,
    FicoStatusCell,
    FicoTwoLineCell,
    accountTypeLabel,
    ficoStatusTone,
} from '../components/ficoTableUi'
import AccountDeterminationPanel from '../components/AccountDeterminationPanel'
import AccountingEventsPanel from '../components/AccountingEventsPanel'
import GlAccountImportDialog from '../components/GlAccountImportDialog'
import GlAccountUsageDialog from '../components/GlAccountUsageDialog'
import { ficoChartService, ficoGlAccountService } from '../services/ficoService'
import type { FicoAccountGroup, FicoChart, FicoGlAccount } from '../types'
import { downloadGlAccountsCsv } from '../utils/glAccountCsv'

const ROUTE = '/modules/fico/gl-accounts'

type WorkspaceTab = 'accounts' | 'determination' | 'events'

/** Each tab shows only when the user can read the data behind it. */
const WORKSPACE_TABS: { value: WorkspaceTab; label: string; permission: string }[] = [
    { value: 'accounts', label: 'G/L Accounts', permission: 'fico.gl-accounts' },
    { value: 'determination', label: 'Account Determination', permission: 'fico.account-determination' },
    { value: 'events', label: 'MM → FICO Posting Monitor', permission: 'fico.journal-entries' },
]
const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']
const RECONCILIATION_TYPES = ['AP', 'AR', 'GRIR', 'BANK', 'ASSET', 'TAX']

type AccountForm = {
    chartOfAccountsId: string
    accountGroupId: string
    accountCode: string
    accountName: string
    description: string
    accountType: string
    normalBalance: string
    isPostingAccount: boolean
    allowManualPosting: boolean
    allowAutomaticPosting: boolean
    isReconciliationAccount: boolean
    reconciliationType: string
    openItemManagement: boolean
    currencyRestriction: string
}

const emptyAccount: AccountForm = {
    chartOfAccountsId: '',
    accountGroupId: '',
    accountCode: '',
    accountName: '',
    description: '',
    accountType: 'ASSET',
    normalBalance: 'DEBIT',
    isPostingAccount: true,
    allowManualPosting: true,
    allowAutomaticPosting: true,
    isReconciliationAccount: false,
    reconciliationType: '',
    openItemManagement: false,
    currencyRestriction: '',
}

function normalBalanceFor(accountType: string) {
    return accountType === 'ASSET' || accountType === 'EXPENSE'
        ? 'DEBIT'
        : 'CREDIT'
}

const GlAccountsPage = () => {
    const {
        companies,
        companyId,
        selectedRow,
        setCompanyId,
        loading: companyLoading,
    } = useFicoCompanies()
    const [charts, setCharts] = useState<FicoChart[]>([])
    const [groups, setGroups] = useState<FicoAccountGroup[]>([])
    const [accounts, setAccounts] = useState<FicoGlAccount[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const searchParams = useSearchParams()
    const router = useRouter()
    const { can, loading: permissionsLoading } = usePermissions()
    const [requestedTab, setRequestedTab] = useState<WorkspaceTab>(() => {
        const value = searchParams.get('tab')
        return WORKSPACE_TABS.some((item) => item.value === value)
            ? (value as WorkspaceTab)
            : 'accounts'
    })
    const visibleTabs = permissionsLoading
        ? WORKSPACE_TABS
        : WORKSPACE_TABS.filter((item) => can(item.permission))
    const workspaceTab = visibleTabs.some((item) => item.value === requestedTab)
        ? requestedTab
        : (visibleTabs[0]?.value ?? 'accounts')
    const changeWorkspaceTab = (value: WorkspaceTab) => {
        setRequestedTab(value)
        router.replace(value === 'accounts' ? ROUTE : `${ROUTE}?tab=${value}`, {
            scroll: false,
        })
    }
    const [chartFilter, setChartFilter] = useState(
        () => searchParams.get('chartOfAccountsId') ?? '',
    )
    const [typeFilter, setTypeFilter] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [search, setSearch] = useState('')

    const [importOpen, setImportOpen] = useState(false)
    const [dialog, setDialog] = useState<'create' | 'edit' | null>(null)
    const [editing, setEditing] = useState<FicoGlAccount | null>(null)
    const [form, setForm] = useState<AccountForm>(emptyAccount)

    const [deleting, setDeleting] = useState<FicoGlAccount | null>(null)
    const [usageFor, setUsageFor] = useState<FicoGlAccount | null>(null)
    const [confirmUnassign, setConfirmUnassign] = useState(false)
    const [assignmentFor, setAssignmentFor] = useState<FicoGlAccount | null>(null)
    const [assignmentExists, setAssignmentExists] = useState(false)
    const [assignmentForm, setAssignmentForm] = useState({
        postingEnabled: true,
        manualPostingBlocked: false,
        effectiveFrom: '',
        effectiveTo: '',
    })

    useEffect(() => {
        ficoChartService
            .list()
            .then((rows) => {
                setCharts(rows)
                setChartFilter((current) => current || rows[0]?.id || '')
            })
            .catch((error) => notifyError(error, 'Unable to load charts of accounts.'))
    }, [])

    const load = useCallback(() => {
        setLoading(true)
        ficoGlAccountService
            .list({
                chartOfAccountsId: chartFilter || undefined,
                accountType: typeFilter || undefined,
                status: statusFilter || undefined,
                search: search || undefined,
                companyId: companyId || undefined,
            })
            .then(setAccounts)
            .catch((error) => notifyError(error, 'Unable to load G/L accounts.'))
            .finally(() => setLoading(false))
    }, [chartFilter, typeFilter, statusFilter, search, companyId])

    useEffect(() => {
        if (workspaceTab === 'accounts') load()
    }, [load, workspaceTab])

    const loadGroups = useCallback((chartId: string) => {
        if (!chartId) {
            setGroups([])
            return
        }
        ficoChartService
            .listGroups(chartId)
            .then(setGroups)
            .catch((error) => notifyError(error, 'Unable to load account groups.'))
    }, [])

    useEffect(() => {
        if (form.chartOfAccountsId) loadGroups(form.chartOfAccountsId)
        else setGroups([])
    }, [form.chartOfAccountsId, loadGroups])

    const openCreate = () => {
        const chartId = chartFilter || charts[0]?.id || ''
        setEditing(null)
        setForm({
            ...emptyAccount,
            chartOfAccountsId: chartId,
            accountType: 'ASSET',
            normalBalance: 'DEBIT',
        })
        setDialog('create')
    }

    const openEdit = (account: FicoGlAccount) => {
        setEditing(account)
        setForm({
            chartOfAccountsId: account.chartOfAccountsId,
            accountGroupId: account.accountGroupId,
            accountCode: account.accountCode,
            accountName: account.accountName,
            description: account.description,
            accountType: account.accountType,
            normalBalance: account.normalBalance,
            isPostingAccount: account.isPostingAccount,
            allowManualPosting: account.allowManualPosting,
            allowAutomaticPosting: account.allowAutomaticPosting,
            isReconciliationAccount: account.isReconciliationAccount,
            reconciliationType: account.reconciliationType ?? '',
            openItemManagement: account.openItemManagement,
            currencyRestriction: account.currencyRestriction ?? '',
        })
        setDialog('edit')
    }

    const save = async () => {
        if (!form.accountCode.trim() || !form.accountName.trim()) {
            notifyError(null, 'Account code and name are required.')
            return
        }
        if (!form.accountGroupId) {
            notifyError(null, 'Select an account group.')
            return
        }
        setSaving(true)
        try {
            const payload = {
                ...form,
                reconciliationType: form.isReconciliationAccount
                    ? form.reconciliationType || null
                    : null,
                currencyRestriction: form.currencyRestriction || null,
            }
            if (dialog === 'create') {
                await ficoGlAccountService.create(payload)
                notifySuccess('G/L account created.')
            } else if (editing) {
                await ficoGlAccountService.update(editing.id, payload)
                notifySuccess('G/L account updated.')
            }
            setDialog(null)
            load()
        } catch (error) {
            notifyError(error, 'Unable to save the G/L account.')
        } finally {
            setSaving(false)
        }
    }

    const toggleStatus = async (account: FicoGlAccount) => {
        try {
            await ficoGlAccountService.update(account.id, {
                status: account.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
            })
            notifySuccess('G/L account status updated.')
            load()
        } catch (error) {
            notifyError(error, 'Unable to change the account status.')
        }
    }

    const remove = async () => {
        if (!deleting) return
        setSaving(true)
        try {
            await ficoGlAccountService.remove(deleting.id)
            notifySuccess('G/L account deleted.')
            setDeleting(null)
            load()
        } catch (error) {
            notifyError(error, 'Unable to delete the G/L account.')
        } finally {
            setSaving(false)
        }
    }

    const openAssignment = async (account: FicoGlAccount) => {
        if (!companyId) {
            notifyError(null, 'Select a company first.')
            return
        }
        try {
            const assignments =
                await ficoGlAccountService.listCompanyAssignments(companyId)
            const existing = assignments.find(
                (row) => row.glAccountId === account.id,
            )
            setAssignmentForm({
                postingEnabled: existing?.postingEnabled ?? true,
                manualPostingBlocked: existing?.manualPostingBlocked ?? false,
                effectiveFrom: existing?.effectiveFrom?.slice(0, 10) ?? '',
                effectiveTo: existing?.effectiveTo?.slice(0, 10) ?? '',
            })
            setAssignmentExists(Boolean(existing))
            setAssignmentFor(account)
        } catch (error) {
            notifyError(error, 'Unable to load company assignments.')
        }
    }

    const saveAssignment = async () => {
        if (!assignmentFor || !companyId) return
        setSaving(true)
        try {
            await ficoGlAccountService.upsertCompanyAssignment(
                assignmentFor.id,
                companyId,
                {
                    postingEnabled: assignmentForm.postingEnabled,
                    manualPostingBlocked: assignmentForm.manualPostingBlocked,
                    effectiveFrom: assignmentForm.effectiveFrom || null,
                    effectiveTo: assignmentForm.effectiveTo || null,
                },
            )
            notifySuccess('Company account assignment saved.')
            setAssignmentFor(null)
            load()
        } catch (error) {
            notifyError(error, 'Unable to save the company assignment.')
        } finally {
            setSaving(false)
        }
    }

    const removeAssignment = async () => {
        if (!assignmentFor || !companyId) return
        setConfirmUnassign(false)
        setSaving(true)
        try {
            await ficoGlAccountService.removeCompanyAssignment(
                assignmentFor.id,
                companyId,
            )
            notifySuccess('Company account assignment removed.')
            setAssignmentFor(null)
            load()
        } catch (error) {
            notifyError(error, 'Unable to remove the company assignment.')
        } finally {
            setSaving(false)
        }
    }

    const controlFlags = (account: FicoGlAccount) => [
        account.isPostingAccount ? 'Posting' : 'Header',
        account.isPostingAccount && account.allowManualPosting && 'Manual',
        account.isPostingAccount && account.allowAutomaticPosting && 'Auto',
        account.isReconciliationAccount && `Recon ${account.reconciliationType ?? ''}`.trim(),
        account.openItemManagement && 'Open items',
    ]

    const columns = useMemo<ColumnDef<FicoGlAccount>[]>(
        () => [
            {
                header: 'G/L account',
                accessorKey: 'accountCode',
                cell: ({ row }) => (
                    <FicoCodeCell
                        icon="account"
                        code={row.original.accountCode}
                        name={row.original.accountName}
                        onClick={() => openEdit(row.original)}
                    />
                ),
            },
            {
                header: 'Account group',
                id: 'group',
                cell: ({ row }) => (
                    <FicoTwoLineCell
                        primary={row.original.accountGroup?.name}
                        secondary={row.original.accountGroup?.code}
                    />
                ),
            },
            {
                header: 'Type',
                accessorKey: 'accountType',
                cell: ({ row }) => <FicoAccountTypeTag type={row.original.accountType} />,
            },
            {
                header: 'Normal balance',
                accessorKey: 'normalBalance',
                cell: ({ row }) => (
                    <FicoBalanceCell
                        normalBalance={row.original.normalBalance}
                        accountType={row.original.accountType}
                    />
                ),
            },
            {
                header: 'Posting controls',
                id: 'controls',
                cell: ({ row }) => <FicoControlFlags flags={controlFlags(row.original)} />,
            },
            {
                header: 'Usage',
                id: 'usage',
                cell: ({ row }) => {
                    const total = row.original.usage?.total ?? 0
                    const summary = `${row.original.usage?.journalLines ?? 0} journal lines, ${
                        (row.original.usage?.debitMappings ?? 0) +
                        (row.original.usage?.creditMappings ?? 0)
                    } mappings`
                    if (!total) {
                        return <FicoCountCell value={0} label="references" />
                    }
                    return (
                        <button
                            type="button"
                            title={`${summary} — click to see them`}
                            onClick={() => setUsageFor(row.original)}
                            className="group/usage inline-flex items-end gap-1 rounded-md text-left hover:text-primary"
                        >
                            <FicoCountCell value={total} label="view" />
                            <HiOutlineSearchCircle className="mb-1 text-gray-400 group-hover/usage:text-primary" />
                        </button>
                    )
                },
            },
            {
                header: 'Status',
                accessorKey: 'status',
                cell: ({ row }) => <FicoStatusCell status={row.original.status} />,
            },
            {
                header: '',
                id: 'actions',
                size: 52,
                cell: ({ row }) => (
                    <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                        <Dropdown.Item eventKey="edit" onClick={() => openEdit(row.original)}>
                            <HiOutlinePencil className="text-base" />
                            <span>Edit account</span>
                        </Dropdown.Item>
                        <Dropdown.Item eventKey="usage" onClick={() => setUsageFor(row.original)}>
                            <HiOutlineSearchCircle className="text-base" />
                            <span>Where used</span>
                        </Dropdown.Item>
                        <Dropdown.Item
                            eventKey="company"
                            onClick={() => openAssignment(row.original)}
                        >
                            <HiOutlineOfficeBuilding className="text-base" />
                            <span>Company assignment</span>
                        </Dropdown.Item>
                        <Dropdown.Item eventKey="status" onClick={() => toggleStatus(row.original)}>
                            <HiOutlinePause className="text-base" />
                            <span>
                                {row.original.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                            </span>
                        </Dropdown.Item>
                        <Dropdown.Item eventKey="delete" onClick={() => setDeleting(row.original)}>
                            <HiOutlineTrash className="text-base text-red-500" />
                            <span className="text-red-500">Delete account</span>
                        </Dropdown.Item>
                    </Dropdown>
                ),
            },
        ],
        [companyId],
    )

    const accountMobile = useMemo(
        () => ({
            title: (account: FicoGlAccount) => account.accountCode,
            subtitle: (account: FicoGlAccount) => account.accountName,
            status: (account: FicoGlAccount) => ({
                text: account.status,
                tone: ficoStatusTone(account.status),
            }),
            onPress: openEdit,
            fields: [
                {
                    label: 'Type',
                    value: (account: FicoGlAccount) => accountTypeLabel(account.accountType),
                },
                {
                    label: 'Group',
                    value: (account: FicoGlAccount) => account.accountGroup?.code ?? '—',
                },
                {
                    label: 'Balance',
                    value: (account: FicoGlAccount) =>
                        account.normalBalance === 'DEBIT' ? 'Debit' : 'Credit',
                },
                {
                    label: 'Usage',
                    value: (account: FicoGlAccount) => account.usage?.total ?? 0,
                },
            ],
        }),
        [],
    )

    const chartSelectOptions = charts.map((chart) => ({
        value: chart.id,
        label: `${chart.code} — ${chart.name}`,
    }))

    const groupOptions = groups
        .filter((group) => group.category === form.accountType)
        .map((group) => ({
            value: group.id,
            label:
                group.rangeFrom && group.rangeTo
                    ? `${group.code} — ${group.name} (${group.rangeFrom}–${group.rangeTo})`
                    : `${group.code} — ${group.name}`,
        }))

    return (
        <PageContainer>
            <PageHeader
                title="G/L Accounts"
                description="Maintain G/L accounts, configure MM account determination, and monitor MM postings reaching FICO."
                breadcrumbs={buildErpBreadcrumbs(ROUTE).slice(0, -1)}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <FicoCompanySelect
                            companies={companies}
                            value={companyId}
                            onChange={setCompanyId}
                            loading={companyLoading}
                        />
                        {workspaceTab === 'accounts' ? (
                            <>
                                <Button
                                    size="sm"
                                    icon={<HiOutlineDownload />}
                                    disabled={!accounts.length}
                                    onClick={() => downloadGlAccountsCsv(accounts)}
                                >
                                    Export
                                </Button>
                                <Button
                                    size="sm"
                                    icon={<HiOutlineUpload />}
                                    onClick={() => setImportOpen(true)}
                                >
                                    Import
                                </Button>
                                <Button
                                    size="sm"
                                    variant="solid"
                                    icon={<HiOutlinePlus />}
                                    onClick={openCreate}
                                >
                                    New account
                                </Button>
                            </>
                        ) : null}
                    </div>
                }
            />

            <Tabs
                value={workspaceTab}
                onChange={(value) => changeWorkspaceTab(value as WorkspaceTab)}
            >
                <Tabs.TabList className="mb-4 flex flex-wrap gap-1">
                    {visibleTabs.map((item) => (
                        <Tabs.TabNav key={item.value} value={item.value}>
                            {item.label}
                        </Tabs.TabNav>
                    ))}
                </Tabs.TabList>
            </Tabs>

            {workspaceTab === 'determination' ? (
                <AccountDeterminationPanel key={companyId} companyId={companyId} />
            ) : null}
            {workspaceTab === 'events' ? (
                <AccountingEventsPanel key={companyId} companyId={companyId} />
            ) : null}

            {workspaceTab === 'accounts' ? (
            <AdaptiveCard>
                <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,20rem)_minmax(0,12rem)_minmax(0,12rem)_minmax(0,16rem)_auto] xl:items-center">
                    <Select
                        size="sm"
                        placeholder="All charts"
                        isClearable
                        options={chartSelectOptions}
                        value={
                            chartSelectOptions.find((option) => option.value === chartFilter) ??
                            null
                        }
                        onChange={(option) =>
                            setChartFilter((option as { value: string } | null)?.value ?? '')
                        }
                    />
                    <Select
                        size="sm"
                        placeholder="All types"
                        isClearable
                        options={ACCOUNT_TYPES.map((type) => ({
                            value: type,
                            label: accountTypeLabel(type),
                        }))}
                        value={
                            typeFilter
                                ? { value: typeFilter, label: accountTypeLabel(typeFilter) }
                                : null
                        }
                        onChange={(option) =>
                            setTypeFilter((option as { value: string } | null)?.value ?? '')
                        }
                    />
                    <Select
                        size="sm"
                        placeholder="All statuses"
                        isClearable
                        options={[
                            { value: 'ACTIVE', label: 'Active' },
                            { value: 'INACTIVE', label: 'Inactive' },
                        ]}
                        value={
                            statusFilter
                                ? {
                                      value: statusFilter,
                                      label: statusFilter === 'ACTIVE' ? 'Active' : 'Inactive',
                                  }
                                : null
                        }
                        onChange={(option) =>
                            setStatusFilter((option as { value: string } | null)?.value ?? '')
                        }
                    />
                    <Input
                        size="sm"
                        prefix={<HiOutlineSearch className="text-lg" />}
                        placeholder="Search code or name"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                    <Button
                        size="sm"
                        variant="plain"
                        icon={<HiOutlineRefresh />}
                        loading={loading}
                        onClick={load}
                    >
                        Refresh
                    </Button>
                </div>
                <p className="mb-3 flex items-center gap-1.5 text-xs text-gray-500">
                    <HiOutlineHashtag />
                    {accounts.length} account{accounts.length === 1 ? '' : 's'}
                    {companyId ? ' assigned to the selected company' : ''}
                </p>

                <FicoResponsiveTable<FicoGlAccount>
                    columns={columns}
                    data={accounts}
                    compact
                    loading={loading}
                    noData={!loading && !accounts.length}
                    getRowId={(row) => row.id}
                    hidePagination
                    tableMinWidthClass="min-w-[1080px]"
                    mobile={accountMobile}
                    instanceId="fico-gl-accounts"
                />
            </AdaptiveCard>
            ) : null}

            <GlAccountUsageDialog account={usageFor} onClose={() => setUsageFor(null)} />

            <GlAccountImportDialog
                isOpen={importOpen}
                charts={charts}
                defaultChartId={chartFilter}
                onClose={() => setImportOpen(false)}
                onImported={load}
            />

            <FormDialog
                isOpen={dialog !== null}
                onClose={() => setDialog(null)}
                title={dialog === 'edit' ? 'Edit G/L account' : 'New G/L account'}
                size="lg"
                onSubmit={save}
                confirmText="Save account"
                confirmLoading={saving}
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem label="Chart of accounts" className="sm:col-span-2">
                        <Select
                            isDisabled={dialog === 'edit'}
                            placeholder="Select chart of accounts"
                            options={charts.map((chart) => ({
                                value: chart.id,
                                label: `${chart.code} — ${chart.name}`,
                            }))}
                            value={
                                charts
                                    .map((chart) => ({
                                        value: chart.id,
                                        label: `${chart.code} — ${chart.name}`,
                                    }))
                                    .find(
                                        (option) =>
                                            option.value === form.chartOfAccountsId,
                                    ) ?? null
                            }
                            onChange={(option) => {
                                const chartId =
                                    (option as { value: string } | null)?.value ?? ''
                                setForm((current) => ({
                                    ...current,
                                    chartOfAccountsId: chartId,
                                    accountGroupId: '',
                                }))
                            }}
                        />
                    </FormItem>
                    <FormItem label="Account code" asterisk>
                        <Input
                            placeholder="e.g. 1010"
                            value={form.accountCode}
                            disabled={dialog === 'edit' && (editing?.usage?.total ?? 0) > 0}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    accountCode: event.target.value.toUpperCase(),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Account name" asterisk>
                        <Input
                            placeholder="e.g. Cash in Bank"
                            value={form.accountName}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    accountName: event.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Account type">
                        <Select
                            options={ACCOUNT_TYPES.map((type) => ({
                                value: type,
                                label: type,
                            }))}
                            value={{
                                value: form.accountType,
                                label: form.accountType,
                            }}
                            onChange={(option) => {
                                const accountType =
                                    (option as { value: string } | null)?.value ??
                                    'ASSET'
                                setForm((current) => ({
                                    ...current,
                                    accountType,
                                    normalBalance: normalBalanceFor(accountType),
                                    accountGroupId: '',
                                }))
                            }}
                        />
                    </FormItem>
                    <FormItem label="Account group" asterisk>
                        <Select
                            placeholder="Select account group"
                            options={groupOptions}
                            value={
                                groupOptions.find(
                                    (option) => option.value === form.accountGroupId,
                                ) ?? null
                            }
                            onChange={(option) =>
                                setForm((current) => ({
                                    ...current,
                                    accountGroupId:
                                        (option as { value: string } | null)?.value ?? '',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Normal balance">
                        <Select
                            options={[
                                { value: 'DEBIT', label: 'Debit' },
                                { value: 'CREDIT', label: 'Credit' },
                            ]}
                            value={{
                                value: form.normalBalance,
                                label: form.normalBalance,
                            }}
                            onChange={(option) =>
                                setForm((current) => ({
                                    ...current,
                                    normalBalance:
                                        (option as { value: string } | null)?.value ??
                                        'DEBIT',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Currency restriction">
                        <Input
                            maxLength={3}
                            placeholder="Any currency"
                            value={form.currencyRestriction}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    currencyRestriction:
                                        event.target.value.toUpperCase(),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Reconciliation type">
                        <Select
                            isClearable
                            placeholder="None"
                            options={RECONCILIATION_TYPES.map((type) => ({
                                value: type,
                                label: type,
                            }))}
                            value={
                                form.reconciliationType
                                    ? {
                                          value: form.reconciliationType,
                                          label: form.reconciliationType,
                                      }
                                    : null
                            }
                            onChange={(option) =>
                                setForm((current) => ({
                                    ...current,
                                    reconciliationType:
                                        (option as { value: string } | null)?.value ?? '',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Description" className="sm:col-span-2">
                        <Input
                            textArea
                            rows={3}
                            placeholder="e.g. Cash deposited in company bank accounts"
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
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Checkbox
                        checked={form.isPostingAccount}
                        onChange={(checked) =>
                            setForm((current) => ({ ...current, isPostingAccount: checked }))
                        }
                    >
                        Posting account
                    </Checkbox>
                    <Checkbox
                        checked={form.allowManualPosting}
                        onChange={(checked) =>
                            setForm((current) => ({ ...current, allowManualPosting: checked }))
                        }
                    >
                        Allow manual postings
                    </Checkbox>
                    <Checkbox
                        checked={form.allowAutomaticPosting}
                        onChange={(checked) =>
                            setForm((current) => ({
                                ...current,
                                allowAutomaticPosting: checked,
                            }))
                        }
                    >
                        Allow automatic postings
                    </Checkbox>
                    <Checkbox
                        checked={form.isReconciliationAccount}
                        onChange={(checked) =>
                            setForm((current) => ({
                                ...current,
                                isReconciliationAccount: checked,
                            }))
                        }
                    >
                        Reconciliation account
                    </Checkbox>
                    <Checkbox
                        checked={form.openItemManagement}
                        onChange={(checked) =>
                            setForm((current) => ({
                                ...current,
                                openItemManagement: checked,
                            }))
                        }
                    >
                        Open-item management
                    </Checkbox>
                </div>
            </FormDialog>

            <FormDialog
                isOpen={Boolean(assignmentFor)}
                onClose={() => setAssignmentFor(null)}
                icon={<HiOutlineOfficeBuilding />}
                title="Company assignment"
                description={
                    <span className="block break-words">
                        <span className="font-mono font-semibold text-gray-700 dark:text-gray-200">
                            {assignmentFor?.accountCode}
                        </span>{' '}
                        {assignmentFor?.accountName}
                        {selectedRow?.company.name ? (
                            <>
                                {' · '}
                                {selectedRow.company.name}
                            </>
                        ) : null}
                    </span>
                }
                footerClassName={assignmentExists ? '!justify-between' : undefined}
                footer={
                    <>
                        {assignmentExists ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="plain"
                                icon={<HiOutlineTrash />}
                                className="text-red-600 hover:text-red-700 dark:text-red-400"
                                disabled={saving}
                                onClick={() => setConfirmUnassign(true)}
                            >
                                Remove
                            </Button>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-2">
                            <Button type="button" onClick={() => setAssignmentFor(null)}>
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                variant="solid"
                                loading={saving}
                                onClick={() => void saveAssignment()}
                            >
                                {assignmentExists ? 'Save changes' : 'Assign account'}
                            </Button>
                        </div>
                    </>
                }
            >
                <div className="space-y-5">
                    <div className="space-y-3">
                        {[
                            {
                                key: 'postingEnabled' as const,
                                label: 'Posting enabled',
                                help: 'The company may post to this account.',
                            },
                            {
                                key: 'manualPostingBlocked' as const,
                                label: 'Block manual postings',
                                help: 'Only automatic postings (e.g. from MM) are accepted.',
                            },
                        ].map((option) => (
                            <Checkbox
                                key={option.key}
                                className="!flex w-full cursor-pointer !items-start gap-1 rounded-xl border border-gray-200 p-3 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50"
                                checked={assignmentForm[option.key]}
                                onChange={(checked) =>
                                    setAssignmentForm((current) => ({
                                        ...current,
                                        [option.key]: checked,
                                    }))
                                }
                            >
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                                        {option.label}
                                    </span>
                                    <span className="block text-xs font-normal text-gray-500 dark:text-gray-400">
                                        {option.help}
                                    </span>
                                </span>
                            </Checkbox>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                        <FormItem label="Effective from" className="mb-0 sm:mb-0">
                            <Input
                                type="date"
                                value={assignmentForm.effectiveFrom}
                                onChange={(event) =>
                                    setAssignmentForm((current) => ({
                                        ...current,
                                        effectiveFrom: event.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Effective to" className="mb-0">
                            <Input
                                type="date"
                                value={assignmentForm.effectiveTo}
                                onChange={(event) =>
                                    setAssignmentForm((current) => ({
                                        ...current,
                                        effectiveTo: event.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Leave the dates blank for an assignment with no start or end.
                    </p>
                </div>
            </FormDialog>

            <ConfirmDialog
                isOpen={Boolean(deleting)}
                type="danger"
                title="Delete G/L account?"
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
                    Delete <span className="font-semibold">{deleting?.accountCode}</span>{' '}
                    {deleting?.accountName}? Accounts used by journals, mappings or company
                    assignments cannot be deleted — deactivate them instead.
                </p>
            </ConfirmDialog>

            <ConfirmDialog
                isOpen={confirmUnassign}
                type="warning"
                title="Remove company assignment?"
                confirmText="Remove"
                onRequestClose={() => setConfirmUnassign(false)}
                onCancel={() => setConfirmUnassign(false)}
                onConfirm={removeAssignment}
            >
                <p>
                    The selected company will no longer be able to post to{' '}
                    <span className="font-semibold">{assignmentFor?.accountCode}</span>.
                </p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default GlAccountsPage
