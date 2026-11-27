'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatCard from '@/components/shared/StatCard'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import EllipsisButton from '@/components/shared/EllipsisButton'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Dropdown from '@/components/ui/Dropdown'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Checkbox from '@/components/ui/Checkbox'
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
import GlAccountCompanySettingsDialog from '../components/GlAccountCompanySettingsDialog'
import GlAccountImportDialog from '../components/GlAccountImportDialog'
import GlAccountUsageDialog from '../components/GlAccountUsageDialog'
import GlAccountViewDialog from '../components/GlAccountViewDialog'
import {
    ficoChartService,
    ficoGlAccountService,
    type FicoGlAccountListSummary,
} from '../services/ficoService'
import type {
    FicoAccountGroup,
    FicoChart,
    FicoGlAccount,
    FicoGlAccountDependencies,
} from '../types'
import { downloadGlAccountsCsv } from '../utils/glAccountCsv'

const ROUTE = '/modules/fico/gl-accounts'

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
    financialStatementMapping: string
    taxCategory: string
    requiresBranch: boolean
    requiresCostCenter: boolean
    requiresProfitCenter: boolean
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
    financialStatementMapping: '',
    taxCategory: '',
    requiresBranch: false,
    requiresCostCenter: false,
    requiresProfitCenter: false,
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
    const [chartFilter, setChartFilter] = useState(
        () => searchParams.get('chartOfAccountsId') ?? '',
    )
    const [typeFilter, setTypeFilter] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')
    const [summary, setSummary] = useState<FicoGlAccountListSummary | null>(null)

    useEffect(() => {
        const tab = searchParams.get('tab')
        if (tab === 'determination') {
            router.replace('/modules/fico/account-determination')
        } else if (tab === 'events') {
            router.replace('/modules/fico/accounting-events')
        }
    }, [router, searchParams])

    useEffect(() => {
        const handle = window.setTimeout(() => {
            setSearch(searchInput.trim())
        }, 300)
        return () => window.clearTimeout(handle)
    }, [searchInput])

    /**
     * The company select is the page-wide scope shared by every tab. A chosen
     * chart of accounts spans companies, so switching company clears the chart
     * filter instead of leaving the two filters fighting over the same list.
     */
    const changeCompany = (value: string) => {
        setCompanyId(value)
        setChartFilter('')
    }

    const [importOpen, setImportOpen] = useState(false)
    const [dialog, setDialog] = useState<'create' | 'edit' | null>(null)
    const [editing, setEditing] = useState<FicoGlAccount | null>(null)
    const [form, setForm] = useState<AccountForm>(emptyAccount)

    const [deleting, setDeleting] = useState<FicoGlAccount | null>(null)
    const [deleteDeps, setDeleteDeps] = useState<
        Pick<FicoGlAccountDependencies, 'canDelete' | 'reasons'> | null
    >(null)
    const [usageFor, setUsageFor] = useState<FicoGlAccount | null>(null)
    const [viewFor, setViewFor] = useState<FicoGlAccount | null>(null)
    const [companySettingsId, setCompanySettingsId] = useState<string | null>(null)
    const [copyFrom, setCopyFrom] = useState<FicoGlAccount | null>(null)
    const [copyCode, setCopyCode] = useState('')

    useEffect(() => {
        ficoChartService
            .list()
            .then((rows) => setCharts(rows))
            .catch((error) => notifyError(error, 'Unable to load charts of accounts.'))
    }, [])

    const listQuery = useMemo(
        () => ({
            chartOfAccountsId: chartFilter || undefined,
            accountType: typeFilter || undefined,
            status: statusFilter || undefined,
            search: search || undefined,
            companyId: chartFilter ? undefined : (companyId || undefined),
        }),
        [chartFilter, typeFilter, statusFilter, search, companyId],
    )

    const filtersActive = Boolean(
        chartFilter || typeFilter || statusFilter || searchInput.trim(),
    )

    const clearFilters = () => {
        setChartFilter('')
        setTypeFilter('')
        setStatusFilter('')
        setSearchInput('')
    }

    const load = useCallback(() => {
        setLoading(true)
        void Promise.allSettled([
            ficoGlAccountService.list(listQuery),
            ficoGlAccountService.summary(listQuery),
        ])
            .then(([listResult, summaryResult]) => {
                if (listResult.status === 'fulfilled') {
                    setAccounts(listResult.value)
                } else {
                    setAccounts([])
                    notifyError(listResult.reason, 'Unable to load G/L accounts.')
                }
                if (summaryResult.status === 'fulfilled') {
                    setSummary(summaryResult.value)
                } else {
                    setSummary(null)
                    if (listResult.status === 'fulfilled') {
                        notifyError(
                            summaryResult.reason,
                            'Unable to load the G/L account summary.',
                        )
                    }
                }
            })
            .finally(() => setLoading(false))
    }, [listQuery])

    useEffect(() => {
        load()
    }, [load])

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

    const openEdit = async (account: FicoGlAccount) => {
        let source = account
        try {
            source = await ficoGlAccountService.get(account.id)
        } catch (error) {
            notifyError(error, 'Unable to load the latest account record.')
        }
        setEditing(source)
        setForm({
            chartOfAccountsId: source.chartOfAccountsId,
            accountGroupId: source.accountGroupId,
            accountCode: source.accountCode,
            accountName: source.accountName,
            description: source.description,
            accountType: source.accountType,
            normalBalance: source.normalBalance,
            isPostingAccount: source.isPostingAccount,
            allowManualPosting: source.allowManualPosting,
            allowAutomaticPosting: source.allowAutomaticPosting,
            isReconciliationAccount: source.isReconciliationAccount,
            reconciliationType: source.reconciliationType ?? '',
            openItemManagement: source.openItemManagement,
            currencyRestriction: source.currencyRestriction ?? '',
            financialStatementMapping: source.financialStatementMapping ?? '',
            taxCategory: source.taxCategory ?? '',
            requiresBranch: source.requiresBranch ?? false,
            requiresCostCenter: source.requiresCostCenter ?? false,
            requiresProfitCenter: source.requiresProfitCenter ?? false,
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
                const created = await ficoGlAccountService.create(payload)
                notifySuccess('G/L account created.')
                // Switch to the chart that owns this account so it appears immediately.
                setChartFilter(created.chartOfAccountsId)
            } else if (editing) {
                await ficoGlAccountService.update(editing.id, {
                    ...payload,
                    ...(editing.updatedAt
                        ? { expectedUpdatedAt: editing.updatedAt }
                        : {}),
                })
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
            if (account.status === 'ACTIVE') {
                await ficoGlAccountService.deactivate(account.id)
            } else {
                await ficoGlAccountService.reactivate(account.id)
            }
            notifySuccess('G/L account status updated.')
            load()
        } catch (error) {
            notifyError(error, 'Unable to change the account status.')
        }
    }

    const openDelete = async (account: FicoGlAccount) => {
        try {
            const deps = await ficoGlAccountService.deletionEligibility(account.id)
            setDeleteDeps(deps)
            setDeleting(account)
        } catch (error) {
            notifyError(error, 'Unable to validate delete eligibility.')
        }
    }

    const remove = async () => {
        if (!deleting) return
        setSaving(true)
        try {
            await ficoGlAccountService.remove(deleting.id)
            notifySuccess('G/L account deleted.')
            setDeleting(null)
            setDeleteDeps(null)
            load()
        } catch (error) {
            notifyError(error, 'Unable to delete the G/L account.')
        } finally {
            setSaving(false)
        }
    }

    const runCopy = async () => {
        if (!copyFrom || !copyCode.trim()) return
        setSaving(true)
        try {
            await ficoGlAccountService.duplicate(copyFrom.id, copyCode.trim().toUpperCase())
            notifySuccess('Account copied as a new master record.')
            setCopyFrom(null)
            setCopyCode('')
            load()
        } catch (error) {
            notifyError(error, 'Unable to copy the account.')
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
                        <Dropdown.Item eventKey="view" onClick={() => setViewFor(row.original)}>
                            <HiOutlineSearchCircle className="text-base" />
                            <span>View account</span>
                        </Dropdown.Item>
                        <Dropdown.Item eventKey="edit" onClick={() => openEdit(row.original)}>
                            <HiOutlinePencil className="text-base" />
                            <span>Edit account</span>
                        </Dropdown.Item>
                        <Dropdown.Item
                            eventKey="company"
                            onClick={() => setCompanySettingsId(row.original.id)}
                        >
                            <HiOutlineOfficeBuilding className="text-base" />
                            <span>Company settings</span>
                        </Dropdown.Item>
                        <Dropdown.Item eventKey="usage" onClick={() => setUsageFor(row.original)}>
                            <HiOutlineSearchCircle className="text-base" />
                            <span>Where used</span>
                        </Dropdown.Item>
                        <Dropdown.Item
                            eventKey="copy"
                            onClick={() => {
                                setCopyFrom(row.original)
                                setCopyCode('')
                            }}
                        >
                            <HiOutlinePlus className="text-base" />
                            <span>Copy as new account</span>
                        </Dropdown.Item>
                        <Dropdown.Item eventKey="status" onClick={() => toggleStatus(row.original)}>
                            <HiOutlinePause className="text-base" />
                            <span>
                                {row.original.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                            </span>
                        </Dropdown.Item>
                        {row.original.status === 'INACTIVE' ? (
                            <Dropdown.Item
                                eventKey="delete"
                                onClick={() => void openDelete(row.original)}
                            >
                                <HiOutlineTrash className="text-base text-red-500" />
                                <span className="text-red-500">Delete (if eligible)</span>
                            </Dropdown.Item>
                        ) : null}
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
                description="Manage financial account master data, company assignments, posting controls, and accounting classifications."
                breadcrumbs={buildErpBreadcrumbs(ROUTE)}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <FicoCompanySelect
                            companies={companies}
                            value={companyId}
                            onChange={changeCompany}
                            loading={companyLoading}
                        />
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
                            New G/L Account
                        </Button>
                    </div>
                }
            />

            {summary ? (
                <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                    <StatCard label="Total" value={summary.totalAccounts} />
                    <StatCard label="Active" value={summary.activeAccounts} />
                    <StatCard label="Inactive" value={summary.inactiveAccounts} />
                    <StatCard label="Blocked posting" value={summary.blockedAccounts} />
                    <StatCard
                        label="Reconciliation"
                        value={summary.reconciliationAccounts}
                    />
                    <StatCard
                        label="No company assign."
                        value={summary.withoutCompanyAssignment}
                    />
                </div>
            ) : null}

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
                        value={searchInput}
                        onChange={(event) => setSearchInput(event.target.value)}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                        {filtersActive ? (
                            <Button size="sm" variant="plain" onClick={clearFilters}>
                                Clear filters
                            </Button>
                        ) : null}
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
                </div>
                <p className="mb-3 flex items-center gap-1.5 text-xs text-gray-500">
                    <HiOutlineHashtag />
                    {accounts.length} account{accounts.length === 1 ? '' : 's'}{' '}
                    {chartFilter
                        ? 'in the selected chart of accounts (all companies)'
                        : companyId
                          ? 'assigned to the selected company'
                          : 'across all charts of accounts'}
                </p>

                <FicoResponsiveTable<FicoGlAccount>
                    columns={columns}
                    data={accounts}
                    compact
                    loading={loading}
                    noData={!loading && !accounts.length}
                    customNoDataIcon={
                        <p className="max-w-md py-8 text-center text-sm text-gray-500">
                            {chartFilter
                                ? 'No accounts in this chart of accounts match these filters.'
                                : companyId
                                  ? 'No accounts match these filters for the selected company. Pick a chart of accounts to see the full master list.'
                                  : 'No accounts match these filters.'}
                        </p>
                    }
                    getRowId={(row) => row.id}
                    hidePagination
                    tableMinWidthClass="min-w-[1080px]"
                    mobile={accountMobile}
                    instanceId="fico-gl-accounts"
                />
            </AdaptiveCard>

            <GlAccountViewDialog
                account={viewFor}
                onClose={() => setViewFor(null)}
                onEdit={(row) => {
                    setViewFor(null)
                    openEdit(row)
                }}
                onCompanySettings={(row) => {
                    setViewFor(null)
                    setCompanySettingsId(row.id)
                }}
                onWhereUsed={(row) => {
                    setViewFor(null)
                    setUsageFor(row)
                }}
            />

            <GlAccountCompanySettingsDialog
                accountId={companySettingsId}
                onClose={() => setCompanySettingsId(null)}
                onSaved={load}
            />

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
                size="xl"
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
                    <FormItem label="Financial statement mapping">
                        <Input
                            maxLength={128}
                            placeholder="e.g. Current liabilities"
                            value={form.financialStatementMapping}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    financialStatementMapping: event.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Tax category">
                        <Input
                            maxLength={64}
                            placeholder="e.g. VAT"
                            value={form.taxCategory}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    taxCategory: event.target.value,
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
                    <Checkbox
                        checked={form.requiresBranch}
                        onChange={(checked) =>
                            setForm((current) => ({
                                ...current,
                                requiresBranch: checked,
                            }))
                        }
                    >
                        Require branch
                    </Checkbox>
                    <Checkbox
                        checked={form.requiresCostCenter}
                        onChange={(checked) =>
                            setForm((current) => ({
                                ...current,
                                requiresCostCenter: checked,
                            }))
                        }
                    >
                        Require cost center
                    </Checkbox>
                    <Checkbox
                        checked={form.requiresProfitCenter}
                        onChange={(checked) =>
                            setForm((current) => ({
                                ...current,
                                requiresProfitCenter: checked,
                            }))
                        }
                    >
                        Require profit center
                    </Checkbox>
                </div>
            </FormDialog>

            <FormDialog
                isOpen={Boolean(copyFrom)}
                onClose={() => setCopyFrom(null)}
                title="Copy as new G/L account"
                size="md"
                onSubmit={runCopy}
                confirmText="Create copy"
                confirmLoading={saving}
            >
                <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
                    Copy settings from{' '}
                    <span className="font-mono font-semibold">{copyFrom?.accountCode}</span>.
                    Enter a new unique account code. Company assignments and financial history are
                    not copied.
                </p>
                <FormItem label="New account code" asterisk>
                    <Input
                        value={copyCode}
                        placeholder="e.g. 1015"
                        onChange={(e) => setCopyCode(e.target.value.toUpperCase())}
                    />
                </FormItem>
            </FormDialog>

            <ConfirmDialog
                isOpen={Boolean(deleting)}
                type="danger"
                title="Delete G/L account?"
                confirmText={deleteDeps?.canDelete ? 'Delete' : 'Close'}
                onRequestClose={() => {
                    setDeleting(null)
                    setDeleteDeps(null)
                }}
                onCancel={() => {
                    setDeleting(null)
                    setDeleteDeps(null)
                }}
                onConfirm={deleteDeps?.canDelete ? remove : () => setDeleting(null)}
                confirmButtonProps={{
                    loading: saving,
                    customColorClass: () =>
                        deleteDeps?.canDelete
                            ? 'bg-red-500 hover:bg-red-500/90 text-white'
                            : '',
                }}
            >
                <div className="space-y-2 text-sm">
                    <p>
                        <span className="font-mono font-semibold">{deleting?.accountCode}</span>{' '}
                        {deleting?.accountName}
                    </p>
                    {deleteDeps?.canDelete ? (
                        <p>Dependency check passed. This action is recorded in the audit trail.</p>
                    ) : (
                        <ul className="list-disc space-y-1 pl-4 text-gray-600 dark:text-gray-300">
                            {(deleteDeps?.reasons ?? ['Cannot delete this account.']).map(
                                (reason) => (
                                    <li key={reason}>{reason}</li>
                                ),
                            )}
                        </ul>
                    )}
                </div>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default GlAccountsPage
