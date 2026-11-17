'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import FormDialog from '@/components/shared/FormDialog'
import EllipsisButton from '@/components/shared/EllipsisButton'
import StatCard from '@/components/shared/StatCard'
import Dropdown from '@/components/ui/Dropdown'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    HiOutlineCalendar,
    HiOutlineClipboardList,
    HiOutlineCollection,
    HiOutlineHashtag,
    HiOutlineLockOpen,
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineRefresh,
} from 'react-icons/hi'
import {
    notifyError,
    notifySuccess,
    statusTag,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import {
    ficoCalendarService,
    ficoChartService,
    ficoGlAccountService,
    ficoSettingsService,
} from '../services/ficoService'
import FicoResponsiveTable, { type ColumnDef } from '../components/FicoResponsiveTable'
import {
    FicoCodeCell,
    FicoCountCell,
    FicoStatusCell,
    FicoTwoLineCell,
    ficoStatusTone,
    FICO_RECORD_STATUS,
} from '../components/ficoTableUi'
import type {
    FicoChart,
    FicoCompanySettingsRow,
    FicoFiscalVariant,
    FicoGlAccount,
    FicoPostingVariant,
} from '../types'

const ROUTE = '/modules/fico/company-accounting-settings'

const DEFAULT_ACCOUNT_FIELDS = [
    {
        key: 'defaultRetainedEarningsAccountId',
        relation: 'defaultRetainedEarningsAccount',
        label: 'Default retained earnings',
    },
    {
        key: 'defaultCashAccountId',
        relation: 'defaultCashAccount',
        label: 'Default cash',
    },
    {
        key: 'defaultReceivableAccountId',
        relation: 'defaultReceivableAccount',
        label: 'Default accounts receivable',
    },
    {
        key: 'defaultPayableAccountId',
        relation: 'defaultPayableAccount',
        label: 'Default accounts payable',
    },
    {
        key: 'defaultInventoryAccountId',
        relation: 'defaultInventoryAccount',
        label: 'Default inventory',
    },
    {
        key: 'defaultSalesRevenueAccountId',
        relation: 'defaultSalesRevenueAccount',
        label: 'Default sales revenue',
    },
    {
        key: 'defaultCostOfGoodsSoldAccountId',
        relation: 'defaultCostOfGoodsSoldAccount',
        label: 'Default cost of goods sold',
    },
    {
        key: 'defaultTaxInputAccountId',
        relation: 'defaultTaxInputAccount',
        label: 'Default tax input',
    },
    {
        key: 'defaultTaxOutputAccountId',
        relation: 'defaultTaxOutputAccount',
        label: 'Default tax output',
    },
] as const

type DefaultAccountField = (typeof DEFAULT_ACCOUNT_FIELDS)[number]['key']

type FormState = {
    legalName: string
    baseCurrency: string
    groupCurrency: string
    countryCode: string
    timezone: string
    accountingMethod: string
    chartOfAccountsId: string
    fiscalYearVariantId: string
    postingPeriodVariantId: string
    taxCountryCode: string
    taxRegistrationNumber: string
    taxJurisdiction: string
    defaultTaxCode: string
    documentNumberPrefix: string
    documentNumberPadding: number
    allowNegativePostings: boolean
    backdatedPostingAllowed: boolean
    maxBackdatedPostingDays: string
} & Record<DefaultAccountField, string>

const EMPTY: FormState = {
    legalName: '',
    baseCurrency: 'PHP',
    groupCurrency: '',
    countryCode: 'PH',
    timezone: 'Asia/Manila',
    accountingMethod: 'ACCRUAL',
    chartOfAccountsId: '',
    fiscalYearVariantId: '',
    postingPeriodVariantId: '',
    taxCountryCode: 'PH',
    taxRegistrationNumber: '',
    taxJurisdiction: 'Philippines',
    defaultTaxCode: '',
    documentNumberPrefix: 'JE',
    documentNumberPadding: 6,
    allowNegativePostings: false,
    backdatedPostingAllowed: true,
    maxBackdatedPostingDays: '',
    defaultRetainedEarningsAccountId: '',
    defaultCashAccountId: '',
    defaultReceivableAccountId: '',
    defaultPayableAccountId: '',
    defaultInventoryAccountId: '',
    defaultSalesRevenueAccountId: '',
    defaultCostOfGoodsSoldAccountId: '',
    defaultTaxInputAccountId: '',
    defaultTaxOutputAccountId: '',
}

const formatFicoDate = (value?: string | null) => {
    if (!value) return '—'
    return new Date(value).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
    })
}

const countConfiguredAccounts = (settings: FicoCompanySettingsRow['settings']) => {
    if (!settings) return 0
    return DEFAULT_ACCOUNT_FIELDS.filter(
        (field) =>
            Boolean(
                (settings as unknown as Record<string, unknown>)[field.key],
            ),
    ).length
}

/** -------------------------------------------------------------------------- */
/*  Client-side real-time validation                                          */
/* -------------------------------------------------------------------------- */

const isThreeLetterCode = (value: string) =>
    /^[A-Z]{3}$/.test(value)

const isTwoLetterCode = (value: string) =>
    /^[A-Z]{2}$/.test(value)

const validateClient = (
    form: FormState,
    isCreating: boolean,
): Record<string, string> => {
    const errors: Record<string, string> = {}

    if (!form.legalName.trim()) {
        errors.legalName = 'Legal name is required.'
    } else if (form.legalName.length > 200) {
        errors.legalName = 'Legal name must be 200 characters or fewer.'
    }

    if (!form.baseCurrency) {
        errors.baseCurrency = 'Base currency is required.'
    } else if (!isThreeLetterCode(form.baseCurrency)) {
        errors.baseCurrency = 'Base currency must be a 3-letter code (e.g. PHP).'
    }

    if (form.groupCurrency && !isThreeLetterCode(form.groupCurrency)) {
        errors.groupCurrency = 'Group currency must be a 3-letter code (e.g. USD).'
    }

    if (!form.countryCode) {
        errors.countryCode = 'Country code is required.'
    } else if (!isTwoLetterCode(form.countryCode)) {
        errors.countryCode = 'Country code must be a 2-letter code (e.g. PH).'
    }

    if (!form.timezone.trim()) {
        errors.timezone = 'Timezone is required.'
    }

    if (!form.accountingMethod) {
        errors.accountingMethod = 'Accounting method is required.'
    }

    if (!form.documentNumberPrefix) {
        errors.documentNumberPrefix = 'Document prefix is required.'
    } else if (form.documentNumberPrefix.length > 12) {
        errors.documentNumberPrefix = 'Document prefix must be 12 characters or fewer.'
    }

    if (form.documentNumberPadding < 3 || form.documentNumberPadding > 12) {
        errors.documentNumberPadding =
            'Document number padding must be between 3 and 12.'
    }

    if (isCreating && !form.chartOfAccountsId) {
        errors.chartOfAccountsId = 'Chart of accounts is required.'
    }

    if (!form.fiscalYearVariantId) {
        errors.fiscalYearVariantId = 'Fiscal year variant is required.'
    }

    if (!form.postingPeriodVariantId) {
        errors.postingPeriodVariantId = 'Posting period variant is required.'
    }

    if (form.taxCountryCode && !isTwoLetterCode(form.taxCountryCode)) {
        errors.taxCountryCode = 'Tax country must be a 2-letter code (e.g. PH).'
    }

    if (form.taxRegistrationNumber && form.taxRegistrationNumber.length > 50) {
        errors.taxRegistrationNumber =
            'Tax registration number must be 50 characters or fewer.'
    }

    if (form.taxJurisdiction && form.taxJurisdiction.length > 100) {
        errors.taxJurisdiction = 'Tax jurisdiction must be 100 characters or fewer.'
    }

    if (form.defaultTaxCode && form.defaultTaxCode.length > 20) {
        errors.defaultTaxCode = 'Default tax code must be 20 characters or fewer.'
    }

    if (
        form.backdatedPostingAllowed &&
        form.maxBackdatedPostingDays !== '' &&
        (Number(form.maxBackdatedPostingDays) < 0 ||
            Number(form.maxBackdatedPostingDays) > 3650)
    ) {
        errors.maxBackdatedPostingDays =
            'Maximum backdated days must be between 0 and 3650.'
    }

    return errors
}

const CompanySettingsPage = () => {
    const { rows, loading, reload } = useFicoCompanies()
    const [charts, setCharts] = useState<FicoChart[]>([])
    const [fiscalVariants, setFiscalVariants] = useState<FicoFiscalVariant[]>([])
    const [postingVariants, setPostingVariants] = useState<FicoPostingVariant[]>(
        [],
    )
    const [editing, setEditing] = useState<FicoCompanySettingsRow | null>(null)
    const [form, setForm] = useState<FormState>(EMPTY)
    const [glAccounts, setGlAccounts] = useState<FicoGlAccount[]>([])
    const [deleting, setDeleting] = useState<FicoCompanySettingsRow | null>(null)
    const [deleteReason, setDeleteReason] = useState('')
    const [saving, setSaving] = useState(false)
    const [validation, setValidation] = useState<{
        valid: boolean
        errors: Array<{ message: string }>
        warnings: Array<{ message: string }>
    } | null>(null)
    const [activateDialog, setActivateDialog] = useState<FicoCompanySettingsRow | null>(null)
    const [deactivateDialog, setDeactivateDialog] = useState<FicoCompanySettingsRow | null>(null)
    const [deactivateReason, setDeactivateReason] = useState('')

    /** Per-field inline error messages (real-time client validation). */
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
    const validationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const summary = useMemo(() => {
        const total = rows.length
        const active = rows.filter(
            (r) => r.settings && r.status === 'ACTIVE',
        ).length
        const draft = rows.filter(
            (r) => r.settings && r.status === 'DRAFT',
        ).length
        const notConfigured = rows.filter((r) => !r.settings).length
        return { total, active, draft, notConfigured }
    }, [rows])

    const loadRefs = useCallback(() => {
        Promise.all([
            ficoChartService.list(),
            ficoCalendarService.listFiscalVariants(),
            ficoCalendarService.listPostingVariants(),
        ])
            .then(([chartRows, fiscalRows, postingRows]) => {
                setCharts(chartRows)
                setFiscalVariants(fiscalRows)
                setPostingVariants(postingRows)
            })
            .catch((error) => notifyError(error, 'Unable to load finance references.'))
    }, [])

    useEffect(() => {
        loadRefs()
    }, [loadRefs])

    useEffect(() => {
        if (!form.chartOfAccountsId) {
            setGlAccounts([])
            return
        }
        let cancelled = false
        ficoGlAccountService
            .list({
                chartOfAccountsId: form.chartOfAccountsId,
                status: 'ACTIVE',
            })
            .then((accounts) => {
                if (!cancelled) setGlAccounts(accounts)
            })
            .catch((error) => {
                if (!cancelled) {
                    notifyError(error, 'Unable to load G/L accounts.')
                }
            })
        return () => {
            cancelled = true
        }
    }, [form.chartOfAccountsId])

    /** ------------------------------------------------------------------ */
    /*  Real-time client validation on every form change                  */
    /* ------------------------------------------------------------------ */
    useEffect(() => {
        const isCreating = !editing?.settings
        const nextErrors = validateClient(form, isCreating)
        setFieldErrors(nextErrors)

        /** Debounced backend validation (only when client errors are clear). */
        if (validationTimer.current) {
            clearTimeout(validationTimer.current)
        }
        const hasClientErrors = Object.keys(nextErrors).length > 0
        if (!hasClientErrors && editing) {
            validationTimer.current = setTimeout(() => {
                ficoSettingsService
                    .validate(editing.company.id)
                    .then((result) => {
                        const serverErrors: Record<string, string> = {}
                        result.errors.forEach((err) => {
                            const key = err.field ?? err.code
                            serverErrors[key] = err.message
                        })
                        setFieldErrors((current) => ({
                            ...current,
                            ...serverErrors,
                        }))
                        setValidation(result)
                    })
                    .catch(() => {
                        // Backend validation failures are surfaced by the manual Validate action.
                    })
            }, 500)
        }
    }, [form, editing])

    const openEditor = (row: FicoCompanySettingsRow) => {
        setEditing(row)
        setValidation(null)
        setFieldErrors({})
        setDeleting(null)
        setDeleteReason('')
        const settings = row.settings
        setForm(
            settings
                ? {
                      legalName: settings.legalName ?? '',
                      baseCurrency: settings.baseCurrency,
                      groupCurrency: settings.groupCurrency ?? '',
                      countryCode: settings.countryCode,
                      timezone: settings.timezone,
                      accountingMethod: settings.accountingMethod,
                      chartOfAccountsId: settings.chartOfAccountsId ?? '',
                      fiscalYearVariantId: settings.fiscalYearVariantId ?? '',
                      postingPeriodVariantId:
                          settings.postingPeriodVariantId ?? '',
                      taxCountryCode: settings.taxCountryCode ?? '',
                      taxRegistrationNumber:
                          settings.taxRegistrationNumber ?? '',
                      taxJurisdiction: settings.taxJurisdiction ?? '',
                      defaultTaxCode: settings.defaultTaxCode ?? '',
                      documentNumberPrefix: settings.documentNumberPrefix,
                      documentNumberPadding: settings.documentNumberPadding,
                      allowNegativePostings:
                          settings.allowNegativePostings ?? false,
                      backdatedPostingAllowed:
                          settings.backdatedPostingAllowed ?? true,
                      maxBackdatedPostingDays:
                          settings.maxBackdatedPostingDays?.toString() ?? '',
                      defaultRetainedEarningsAccountId:
                          settings.defaultRetainedEarningsAccountId ?? '',
                      defaultCashAccountId: settings.defaultCashAccountId ?? '',
                      defaultReceivableAccountId:
                          settings.defaultReceivableAccountId ?? '',
                      defaultPayableAccountId:
                          settings.defaultPayableAccountId ?? '',
                      defaultInventoryAccountId:
                          settings.defaultInventoryAccountId ?? '',
                      defaultSalesRevenueAccountId:
                          settings.defaultSalesRevenueAccountId ?? '',
                      defaultCostOfGoodsSoldAccountId:
                          settings.defaultCostOfGoodsSoldAccountId ?? '',
                      defaultTaxInputAccountId:
                          settings.defaultTaxInputAccountId ?? '',
                      defaultTaxOutputAccountId:
                          settings.defaultTaxOutputAccountId ?? '',
                  }
                : {
                      ...EMPTY,
                      legalName: row.company.name,
                      taxRegistrationNumber: row.company.tin ?? '',
                  },
        )
    }

    const save = async () => {
        if (!editing) return
        const isCreating = !editing.settings
        const nextErrors = validateClient(form, isCreating)
        setFieldErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) {
            notifyError(
                null,
                'Please fix the highlighted fields before saving.',
            )
            return
        }
        setSaving(true)
        try {
            const defaultAccounts = Object.fromEntries(
                DEFAULT_ACCOUNT_FIELDS.map((field) => [
                    field.key,
                    form[field.key] || null,
                ]),
            )
            const payload: Record<string, unknown> = {
                ...form,
                ...defaultAccounts,
                groupCurrency: form.groupCurrency || null,
                chartOfAccountsId: form.chartOfAccountsId || null,
                fiscalYearVariantId: form.fiscalYearVariantId || null,
                postingPeriodVariantId: form.postingPeriodVariantId || null,
                taxCountryCode: form.taxCountryCode || null,
                taxRegistrationNumber: form.taxRegistrationNumber || null,
                taxJurisdiction: form.taxJurisdiction || null,
                defaultTaxCode: form.defaultTaxCode || null,
                maxBackdatedPostingDays:
                    form.maxBackdatedPostingDays === ''
                        ? null
                        : Number(form.maxBackdatedPostingDays),
            }
            if (editing.settings) {
                await ficoSettingsService.update(editing.company.id, payload)
            } else {
                await ficoSettingsService.create(editing.company.id, payload)
            }
            notifySuccess('Company accounting configuration saved.')
            setEditing(null)
            setFieldErrors({})
            await reload()
        } catch (error) {
            notifyError(error, 'Unable to save company accounting settings.')
        } finally {
            setSaving(false)
        }
    }

    const validate = async (row: FicoCompanySettingsRow) => {
        try {
            const result = await ficoSettingsService.validate(row.company.id)
            setValidation(result)
            setEditing(row)
            const serverErrors: Record<string, string> = {}
            result.errors.forEach((err) => {
                const key = err.field ?? err.code
                serverErrors[key] = err.message
            })
            setFieldErrors(serverErrors)
        } catch (error) {
            notifyError(error, 'Unable to validate the configuration.')
        }
    }

    const openActivate = (row: FicoCompanySettingsRow) => {
        setActivateDialog(row)
    }

    const confirmActivate = async () => {
        if (!activateDialog) return
        try {
            await ficoSettingsService.activate(activateDialog.company.id)
            notifySuccess('Company accounting configuration activated.')
            setActivateDialog(null)
            await reload()
        } catch (error) {
            notifyError(error, 'Unable to activate the configuration.')
        }
    }

    const openDeactivate = (row: FicoCompanySettingsRow) => {
        setDeactivateDialog(row)
        setDeactivateReason('')
    }

    const confirmDeactivate = async () => {
        if (!deactivateDialog || deactivateReason.trim().length < 3) return
        try {
            await ficoSettingsService.deactivate(
                deactivateDialog.company.id,
                deactivateReason.trim(),
            )
            notifySuccess('Company accounting configuration deactivated.')
            setDeactivateDialog(null)
            setDeactivateReason('')
            await reload()
        } catch (error) {
            notifyError(error, 'Unable to deactivate the configuration.')
        }
    }

    const remove = async () => {
        if (!deleting || deleteReason.trim().length < 3) return
        setSaving(true)
        try {
            await ficoSettingsService.remove(
                deleting.company.id,
                deleteReason.trim(),
            )
            notifySuccess('Company accounting configuration deleted.')
            setDeleting(null)
            setDeleteReason('')
            await reload()
        } catch (error) {
            notifyError(error, 'Unable to delete the configuration.')
        } finally {
            setSaving(false)
        }
    }

    const columns = useMemo<ColumnDef<FicoCompanySettingsRow>[]>(
        () => [
            {
                header: 'Company',
                accessorKey: 'company.name',
                cell: ({ row }) => (
                    <FicoCodeCell
                        icon="group"
                        code={row.original.company.code}
                        name={row.original.company.name}
                    />
                ),
            },
            {
                header: 'Status',
                accessorKey: 'status',
                cell: ({ row }) => (
                    <FicoStatusCell
                        status={row.original.status}
                        map={FICO_RECORD_STATUS}
                    />
                ),
            },
            {
                header: 'Currency',
                id: 'currency',
                cell: ({ row }) => (
                    <FicoTwoLineCell
                        primary={
                            row.original.settings?.baseCurrency ?? '—'
                        }
                        secondary={
                            row.original.settings?.groupCurrency
                                ? `Group: ${row.original.settings.groupCurrency}`
                                : undefined
                        }
                    />
                ),
            },
            {
                header: 'Chart of accounts',
                id: 'chart',
                cell: ({ row }) => {
                    const settings = row.original.settings
                    if (!settings?.chartOfAccounts) {
                        return (
                            <span className="text-xs text-gray-400">Not assigned</span>
                        )
                    }
                    return (
                        <FicoCodeCell
                            icon="account"
                            code={settings.chartOfAccounts.code}
                            name={settings.chartOfAccounts.name}
                        />
                    )
                },
            },
            {
                header: 'Default G/L accounts',
                id: 'defaultAccounts',
                cell: ({ row }) => (
                    <FicoCountCell
                        value={countConfiguredAccounts(row.original.settings)}
                        label={`of ${DEFAULT_ACCOUNT_FIELDS.length}`}
                    />
                ),
            },
            {
                header: 'Updated',
                id: 'updated',
                cell: ({ row }) => (
                    <FicoTwoLineCell
                        primary={formatFicoDate(row.original.settings?.updatedAt)}
                        secondary={row.original.settings?.status ?? 'Not configured'}
                    />
                ),
            },
            {
                header: '',
                id: 'actions',
                size: 64,
                cell: ({ row }) => {
                    const record = row.original
                    const hasSettings = Boolean(record.settings)
                    const isActive = record.status === 'ACTIVE'
                    return (
                        <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                            <Dropdown.Item
                                onClick={() => openEditor(record)}
                            >
                                <span className="flex items-center gap-2">
                                    <HiOutlinePencil className="text-base" />
                                    {hasSettings ? 'Edit' : 'Configure'}
                                </span>
                            </Dropdown.Item>
                            {hasSettings && !isActive && (
                                <Dropdown.Item
                                    onClick={() => openActivate(record)}
                                >
                                    <span className="flex items-center gap-2 text-emerald-600">
                                        <HiOutlineLockOpen className="text-base" />
                                        Activate
                                    </span>
                                </Dropdown.Item>
                            )}
                            {hasSettings && isActive && (
                                <Dropdown.Item
                                    onClick={() => openDeactivate(record)}
                                >
                                    <span className="flex items-center gap-2 text-amber-600">
                                        <HiOutlineCalendar className="text-base" />
                                        Deactivate
                                    </span>
                                </Dropdown.Item>
                            )}
                            {hasSettings && (
                                <Dropdown.Item
                                    onClick={() => validate(record)}
                                >
                                    <span className="flex items-center gap-2 text-blue-600">
                                        <HiOutlineClipboardList className="text-base" />
                                        Validate
                                    </span>
                                </Dropdown.Item>
                            )}
                            {hasSettings && !isActive && (
                                <Dropdown.Item
                                    onClick={() => {
                                        setDeleting(record)
                                        setDeleteReason('')
                                    }}
                                >
                                    <span className="flex items-center gap-2 text-red-600">
                                        <HiOutlineHashtag className="text-base" />
                                        Delete
                                    </span>
                                </Dropdown.Item>
                            )}
                        </Dropdown>
                    )
                },
            },
        ],
        [],
    )

    const companyMobile = useMemo(
        () => ({
            title: (row: FicoCompanySettingsRow) => row.company.name,
            subtitle: (row: FicoCompanySettingsRow) => row.company.code,
            status: (row: FicoCompanySettingsRow) => ({
                text: row.status,
                tone: ficoStatusTone(row.status, FICO_RECORD_STATUS),
            }),
            fields: [
                {
                    label: 'Currency',
                    value: (row: FicoCompanySettingsRow) =>
                        row.settings?.baseCurrency ?? '—',
                },
                {
                    label: 'Chart',
                    value: (row: FicoCompanySettingsRow) =>
                        row.settings?.chartOfAccounts
                            ? `${row.settings.chartOfAccounts.code} — ${row.settings.chartOfAccounts.name}`
                            : 'Not assigned',
                },
                {
                    label: 'Default accounts',
                    value: (row: FicoCompanySettingsRow) =>
                        `${countConfiguredAccounts(row.settings)} of ${DEFAULT_ACCOUNT_FIELDS.length}`,
                },
                {
                    label: 'Updated',
                    value: (row: FicoCompanySettingsRow) =>
                        formatFicoDate(row.settings?.updatedAt),
                },
            ],
        }),
        [],
    )

    const chartOptions = charts.map((chart) => ({
        value: chart.id,
        label: `${chart.code} — ${chart.name}`,
    }))
    const fiscalOptions = fiscalVariants.map((variant) => ({
        value: variant.id,
        label: `${variant.code} — ${variant.name}`,
    }))
    const postingOptions = postingVariants.map((variant) => ({
        value: variant.id,
        label: `${variant.code} — ${variant.name}`,
    }))
    const accountOptions = glAccounts
        .filter((account) => account.isPostingAccount)
        .map((account) => ({
            value: account.id,
            label: `${account.accountCode} — ${account.accountName} (${account.accountType})`,
        }))

    const isCreating = !editing?.settings

    return (
        <PageContainer>
            <PageHeader
                title="Company Accounting Settings"
                description="Configure base currency, chart of accounts, fiscal calendar and posting rules, then validate and activate."
                breadcrumbs={buildErpBreadcrumbs(ROUTE)}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={loadRefs}
                            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-lg"
                        >
                            <HiOutlineRefresh className="w-4 h-4" />
                            Refresh references
                        </button>
                    </div>
                }
            />

            <AdaptiveCard className="mb-6">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    <StatCard
                        label="Total companies"
                        value={summary.total}
                        tone="default"
                        loading={loading}
                    />
                    <StatCard
                        label="Active"
                        value={summary.active}
                        tone="success"
                        loading={loading}
                    />
                    <StatCard
                        label="Draft"
                        value={summary.draft}
                        tone="warning"
                        loading={loading}
                    />
                    <StatCard
                        label="Not configured"
                        value={summary.notConfigured}
                        tone="danger"
                        loading={loading}
                    />
                </div>
            </AdaptiveCard>

            <AdaptiveCard className="mb-6">
                <FicoResponsiveTable<FicoCompanySettingsRow>
                    columns={columns}
                    data={rows}
                    compact
                    loading={loading}
                    noData={!loading && !rows.length}
                    getRowId={(row) => row.company.id}
                    rowClassName={(row) =>
                        row.status === 'ACTIVE'
                            ? 'bg-emerald-50/40 dark:bg-emerald-950/10'
                            : row.status === 'DRAFT'
                              ? 'bg-amber-50/40 dark:bg-amber-950/10'
                              : row.status === 'INACTIVE'
                                ? 'bg-gray-50/40 dark:bg-gray-900/20'
                                : undefined
                    }
                    tableMinWidthClass="min-w-[950px]"
                    hidePagination
                    mobile={companyMobile}
                    instanceId="fico-company-settings"
                />
            </AdaptiveCard>

            <FormDialog
                isOpen={Boolean(editing)}
                onClose={() => {
                    setEditing(null)
                    setFieldErrors({})
                }}
                title={
                    editing?.settings
                        ? `Accounting settings — ${editing.company.name}`
                        : `Configure accounting — ${editing?.company.name ?? ''}`
                }
                description="Structural fields can only change while the configuration is DRAFT and before accounting documents exist."
                size="lg"
                onSubmit={save}
                confirmText="Save configuration"
                confirmLoading={saving}
            >
                {!editing?.settings ? (
                    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/60 p-4 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-300">
                        <p className="font-medium">
                            No accounting configuration exists yet for{' '}
                            <span className="font-semibold">
                                {editing?.company.name ?? ''}
                            </span>
                            .
                        </p>
                        <p className="mt-1">
                            Create a configuration to assign the chart of accounts,
                            fiscal calendar, currency and posting controls for this company.
                        </p>
                    </div>
                ) : null}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem
                        label="Legal name"
                        className="sm:col-span-2"
                        errorMessage={fieldErrors.legalName}
                        invalid={Boolean(fieldErrors.legalName)}
                    >
                        <Input
                            placeholder="e.g. AGCTEK Corporation"
                            value={form.legalName}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    legalName: event.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem
                        label="Base currency"
                        errorMessage={fieldErrors.baseCurrency}
                        invalid={Boolean(fieldErrors.baseCurrency)}
                    >
                        <Input
                            maxLength={3}
                            placeholder="e.g. PHP"
                            value={form.baseCurrency}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    baseCurrency: event.target.value.toUpperCase(),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem
                        label="Group currency (optional)"
                        errorMessage={fieldErrors.groupCurrency}
                        invalid={Boolean(fieldErrors.groupCurrency)}
                    >
                        <Input
                            maxLength={3}
                            placeholder="e.g. USD"
                            value={form.groupCurrency}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    groupCurrency: event.target.value.toUpperCase(),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem
                        label="Country code"
                        errorMessage={fieldErrors.countryCode}
                        invalid={Boolean(fieldErrors.countryCode)}
                    >
                        <Input
                            maxLength={2}
                            placeholder="e.g. PH"
                            value={form.countryCode}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    countryCode: event.target.value.toUpperCase(),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem
                        label="Timezone"
                        errorMessage={fieldErrors.timezone}
                        invalid={Boolean(fieldErrors.timezone)}
                    >
                        <Input
                            placeholder="e.g. Asia/Manila"
                            value={form.timezone}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    timezone: event.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem
                        label="Accounting method"
                        errorMessage={fieldErrors.accountingMethod}
                        invalid={Boolean(fieldErrors.accountingMethod)}
                    >
                        <Select
                            options={[
                                { value: 'ACCRUAL', label: 'Accrual' },
                                { value: 'CASH', label: 'Cash' },
                            ]}
                            value={{
                                value: form.accountingMethod,
                                label: form.accountingMethod,
                            }}
                            onChange={(option) =>
                                setForm((current) => ({
                                    ...current,
                                    accountingMethod:
                                        (option as { value: string } | null)
                                            ?.value ?? 'ACCRUAL',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem
                        label="Chart of accounts"
                        className="sm:col-span-2"
                        errorMessage={fieldErrors.chartOfAccountsId}
                        invalid={Boolean(fieldErrors.chartOfAccountsId)}
                    >
                        <Select
                            placeholder="Select chart of accounts"
                            options={chartOptions}
                            isClearable
                            value={
                                chartOptions.find(
                                    (option) =>
                                        option.value === form.chartOfAccountsId,
                                ) ?? null
                            }
                            onChange={(option) =>
                                setForm((current) => ({
                                    ...current,
                                    chartOfAccountsId:
                                        (option as { value: string } | null)
                                            ?.value ?? '',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem
                        label="Fiscal year variant"
                        errorMessage={fieldErrors.fiscalYearVariantId}
                        invalid={Boolean(fieldErrors.fiscalYearVariantId)}
                    >
                        <Select
                            placeholder="Select fiscal year variant"
                            options={fiscalOptions}
                            isClearable
                            value={
                                fiscalOptions.find(
                                    (option) =>
                                        option.value ===
                                        form.fiscalYearVariantId,
                                ) ?? null
                            }
                            onChange={(option) =>
                                setForm((current) => ({
                                    ...current,
                                    fiscalYearVariantId:
                                        (option as { value: string } | null)
                                            ?.value ?? '',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem
                        label="Posting period variant"
                        errorMessage={fieldErrors.postingPeriodVariantId}
                        invalid={Boolean(fieldErrors.postingPeriodVariantId)}
                    >
                        <Select
                            placeholder="Select posting period variant"
                            options={postingOptions}
                            isClearable
                            value={
                                postingOptions.find(
                                    (option) =>
                                        option.value ===
                                        form.postingPeriodVariantId,
                                ) ?? null
                            }
                            onChange={(option) =>
                                setForm((current) => ({
                                    ...current,
                                    postingPeriodVariantId:
                                        (option as { value: string } | null)
                                            ?.value ?? '',
                                }))
                            }
                        />
                    </FormItem>
                    <div className="mt-2 border-t border-gray-200 pt-4 sm:col-span-2 dark:border-gray-700">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            Default G/L accounts
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                            Every selected account must belong to the assigned
                            chart of accounts. Missing defaults are reported as
                            warnings; invalid assignments block activation.
                        </p>
                    </div>
                    {DEFAULT_ACCOUNT_FIELDS.map((field) => (
                        <FormItem
                            key={field.key}
                            label={field.label}
                            errorMessage={fieldErrors[field.key]}
                            invalid={Boolean(fieldErrors[field.key])}
                        >
                            <Select
                                isClearable
                                placeholder={
                                    form.chartOfAccountsId
                                        ? 'Select account'
                                        : 'Assign a chart of accounts first'
                                }
                                options={accountOptions}
                                isDisabled={!form.chartOfAccountsId}
                                value={
                                    accountOptions.find(
                                        (option) =>
                                            option.value === form[field.key],
                                    ) ?? null
                                }
                                onChange={(option) =>
                                    setForm((current) => ({
                                        ...current,
                                        [field.key]:
                                            (
                                                option as {
                                                    value: string
                                                } | null
                                            )?.value ?? '',
                                    }))
                                }
                            />
                        </FormItem>
                    ))}
                    <div className="mt-2 border-t border-gray-200 pt-4 sm:col-span-2 dark:border-gray-700">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            Posting controls
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                            These rules are enforced by the centralized posting
                            validator before any journal line is accepted.
                        </p>
                    </div>
                    <FormItem label="Negative postings">
                        <div className="flex items-center gap-3">
                            <Switcher
                                checked={form.allowNegativePostings}
                                onChange={(checked) =>
                                    setForm((current) => ({
                                        ...current,
                                        allowNegativePostings: checked,
                                    }))
                                }
                            />
                            <span className="text-sm text-gray-600 dark:text-gray-300">
                                {form.allowNegativePostings
                                    ? 'Negative amounts allowed'
                                    : 'Negative amounts blocked'}
                            </span>
                        </div>
                    </FormItem>
                    <FormItem label="Backdated postings">
                        <div className="flex items-center gap-3">
                            <Switcher
                                checked={form.backdatedPostingAllowed}
                                onChange={(checked) =>
                                    setForm((current) => ({
                                        ...current,
                                        backdatedPostingAllowed: checked,
                                    }))
                                }
                            />
                            <span className="text-sm text-gray-600 dark:text-gray-300">
                                {form.backdatedPostingAllowed
                                    ? 'Backdated postings allowed'
                                    : 'Backdated postings blocked'}
                            </span>
                        </div>
                    </FormItem>
                    <FormItem
                        label="Maximum backdated days"
                        className="sm:col-span-2"
                        errorMessage={fieldErrors.maxBackdatedPostingDays}
                        invalid={Boolean(fieldErrors.maxBackdatedPostingDays)}
                    >
                        <Input
                            type="number"
                            min={0}
                            max={3650}
                            disabled={!form.backdatedPostingAllowed}
                            placeholder="Leave blank for no limit"
                            value={form.maxBackdatedPostingDays}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    maxBackdatedPostingDays:
                                        event.target.value,
                                }))
                            }
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Applies only when backdated postings are allowed.
                            Leave blank for no age limit.
                        </p>
                    </FormItem>
                    <FormItem
                        label="Tax country"
                        errorMessage={fieldErrors.taxCountryCode}
                        invalid={Boolean(fieldErrors.taxCountryCode)}
                    >
                        <Input
                            maxLength={2}
                            placeholder="e.g. PH"
                            value={form.taxCountryCode}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    taxCountryCode:
                                        event.target.value.toUpperCase(),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem
                        label="Tax registration number"
                        errorMessage={fieldErrors.taxRegistrationNumber}
                        invalid={Boolean(fieldErrors.taxRegistrationNumber)}
                    >
                        <Input
                            placeholder="e.g. 000-123-456-000"
                            value={form.taxRegistrationNumber}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    taxRegistrationNumber: event.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem
                        label="Tax jurisdiction"
                        errorMessage={fieldErrors.taxJurisdiction}
                        invalid={Boolean(fieldErrors.taxJurisdiction)}
                    >
                        <Input
                            placeholder="e.g. Philippines"
                            value={form.taxJurisdiction}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    taxJurisdiction: event.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem
                        label="Default tax code"
                        errorMessage={fieldErrors.defaultTaxCode}
                        invalid={Boolean(fieldErrors.defaultTaxCode)}
                    >
                        <Input
                            placeholder="e.g. VAT12"
                            value={form.defaultTaxCode}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    defaultTaxCode: event.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem
                        label="Document prefix"
                        errorMessage={fieldErrors.documentNumberPrefix}
                        invalid={Boolean(fieldErrors.documentNumberPrefix)}
                    >
                        <Input
                            maxLength={12}
                            placeholder="e.g. JE"
                            value={form.documentNumberPrefix}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    documentNumberPrefix:
                                        event.target.value.toUpperCase(),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem
                        label="Document number padding"
                        errorMessage={fieldErrors.documentNumberPadding}
                        invalid={Boolean(fieldErrors.documentNumberPadding)}
                    >
                        <Input
                            type="number"
                            min={3}
                            max={12}
                            placeholder="e.g. 6"
                            value={form.documentNumberPadding}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    documentNumberPadding: Number(
                                        event.target.value || 6,
                                    ),
                                }))
                            }
                        />
                    </FormItem>
                </div>

                {validation ? (
                    <div className="mt-4 space-y-2">
                        {validation.errors.map((error, index) => (
                            <p
                                key={`${error.message}-${index}`}
                                className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
                            >
                                {error.message}
                            </p>
                        ))}
                        {validation.warnings.map((warning, index) => (
                            <p
                                key={`${warning.message}-${index}`}
                                className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700"
                            >
                                {warning.message}
                            </p>
                        ))}
                        {validation.valid && !validation.warnings.length ? (
                            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                                Configuration is valid and can be activated.
                            </p>
                        ) : null}
                    </div>
                ) : null}
                {Object.keys(fieldErrors).length > 0 && !validation ? (
                    <div className="mt-4 space-y-2">
                        {Object.entries(fieldErrors).map(
                            ([field, message]) => (
                                <p
                                    key={field}
                                    className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
                                >
                                    {message}
                                </p>
                            ),
                        )}
                    </div>
                ) : null}
            </FormDialog>

            <ConfirmDialog
                isOpen={Boolean(deleting)}
                type="danger"
                title="Delete accounting configuration?"
                confirmText="Delete configuration"
                onRequestClose={() => {
                    setDeleting(null)
                    setDeleteReason('')
                }}
                onCancel={() => {
                    setDeleting(null)
                    setDeleteReason('')
                }}
                onConfirm={remove}
                confirmButtonProps={{
                    loading: saving,
                    disabled: deleteReason.trim().length < 3,
                    customColorClass: () =>
                        'bg-red-500 hover:bg-red-500/90 text-white',
                }}
            >
                <div className="space-y-3">
                    <p>
                        Delete the accounting configuration for{' '}
                        <span className="font-semibold">
                            {deleting?.company.name}
                        </span>
                        ? Configurations with generated periods or accounting
                        documents cannot be deleted — deactivate them instead.
                    </p>
                    <Input
                        placeholder="Reason (required, at least 3 characters)"
                        value={deleteReason}
                        onChange={(event) =>
                            setDeleteReason(event.target.value)
                        }
                    />
                </div>
            </ConfirmDialog>

            <ConfirmDialog
                isOpen={Boolean(activateDialog)}
                type="success"
                title="Activate accounting configuration?"
                confirmText={saving ? 'Activating…' : 'Activate configuration'}
                onRequestClose={() => setActivateDialog(null)}
                onCancel={() => setActivateDialog(null)}
                onConfirm={confirmActivate}
                confirmButtonProps={{
                    disabled: saving || activateDialog === null,
                }}
            >
                <div className="space-y-3">
                    <p>
                        Activation enables accounting postings for the selected company using the current configuration.
                    </p>
                    <p>
                        Activate the accounting configuration for{' '}
                        <span className="font-semibold">
                            {activateDialog?.company.name}
                        </span>
                        ? Once activated, the configuration drives posting validation and period availability.
                    </p>
                </div>
            </ConfirmDialog>

            <ConfirmDialog
                isOpen={Boolean(deactivateDialog)}
                type="warning"
                title="Deactivate accounting configuration?"
                confirmText={saving ? 'Deactivating…' : 'Deactivate configuration'}
                onRequestClose={() => {
                    setDeactivateDialog(null)
                    setDeactivateReason('')
                }}
                onCancel={() => {
                    setDeactivateDialog(null)
                    setDeactivateReason('')
                }}
                onConfirm={confirmDeactivate}
                confirmButtonProps={{
                    disabled:
                        saving ||
                        deactivateDialog === null ||
                        deactivateReason.trim().length < 3,
                }}
            >
                <div className="space-y-3">
                    <p>
                        Deactivation blocks new accounting postings for the selected company. Provide a reason for the audit trail.
                    </p>
                    <p>
                        Deactivate the accounting configuration for{' '}
                        <span className="font-semibold">
                            {deactivateDialog?.company.name}
                        </span>
                        ? Existing documents are unaffected, but new postings will be blocked until the configuration is activated again.
                    </p>
                    <Input
                        placeholder="Reason (required, at least 3 characters)"
                        value={deactivateReason}
                        onChange={(event) => setDeactivateReason(event.target.value)}
                    />
                </div>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default CompanySettingsPage
