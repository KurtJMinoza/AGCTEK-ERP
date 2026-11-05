'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    notifyError,
    notifySuccess,
    statusTag,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import {
    ficoCalendarService,
    ficoChartService,
    ficoSettingsService,
} from '../services/ficoService'
import type {
    FicoChart,
    FicoCompanySettingsRow,
    FicoFiscalVariant,
    FicoPostingVariant,
} from '../types'

const ROUTE = '/modules/fico/company-settings'

type FormState = {
    legalName: string
    baseCurrency: string
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
}

const EMPTY: FormState = {
    legalName: '',
    baseCurrency: 'PHP',
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
}

const CompanySettingsPage = () => {
    const { rows, loading, reload } = useFicoCompanies()
    const [charts, setCharts] = useState<FicoChart[]>([])
    const [fiscalVariants, setFiscalVariants] = useState<FicoFiscalVariant[]>([])
    const [postingVariants, setPostingVariants] = useState<FicoPostingVariant[]>([])
    const [editing, setEditing] = useState<FicoCompanySettingsRow | null>(null)
    const [form, setForm] = useState<FormState>(EMPTY)
    const [saving, setSaving] = useState(false)
    const [validation, setValidation] = useState<{
        valid: boolean
        errors: Array<{ message: string }>
        warnings: Array<{ message: string }>
    } | null>(null)

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

    const openEditor = (row: FicoCompanySettingsRow) => {
        setEditing(row)
        setValidation(null)
        const settings = row.settings
        setForm(
            settings
                ? {
                      legalName: settings.legalName ?? '',
                      baseCurrency: settings.baseCurrency,
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
        setSaving(true)
        try {
            const payload: Record<string, unknown> = {
                ...form,
                chartOfAccountsId: form.chartOfAccountsId || null,
                fiscalYearVariantId: form.fiscalYearVariantId || null,
                postingPeriodVariantId: form.postingPeriodVariantId || null,
                taxCountryCode: form.taxCountryCode || null,
                taxRegistrationNumber: form.taxRegistrationNumber || null,
                taxJurisdiction: form.taxJurisdiction || null,
                defaultTaxCode: form.defaultTaxCode || null,
            }
            if (editing.settings) {
                await ficoSettingsService.update(editing.company.id, payload)
            } else {
                await ficoSettingsService.create(editing.company.id, payload)
            }
            notifySuccess('Company accounting configuration saved.')
            setEditing(null)
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
        } catch (error) {
            notifyError(error, 'Unable to validate the configuration.')
        }
    }

    const activate = async (row: FicoCompanySettingsRow) => {
        try {
            await ficoSettingsService.activate(row.company.id)
            notifySuccess('Company accounting configuration activated.')
            await reload()
        } catch (error) {
            notifyError(error, 'Unable to activate the configuration.')
        }
    }

    const deactivate = async (row: FicoCompanySettingsRow) => {
        const reason = window.prompt(
            'Reason for deactivating this accounting configuration:',
        )
        if (!reason?.trim()) return
        try {
            await ficoSettingsService.deactivate(row.company.id, reason.trim())
            notifySuccess('Company accounting configuration deactivated.')
            await reload()
        } catch (error) {
            notifyError(error, 'Unable to deactivate the configuration.')
        }
    }

    const columns = useMemo<ColumnDef<FicoCompanySettingsRow>[]>(
        () => [
            {
                header: 'Company',
                accessorKey: 'company.name',
                cell: ({ row }) => (
                    <div>
                        <p className="font-medium">{row.original.company.name}</p>
                        <p className="text-xs text-gray-500">
                            {row.original.company.code}
                        </p>
                    </div>
                ),
            },
            {
                header: 'Status',
                accessorKey: 'status',
                cell: ({ row }) => statusTag(row.original.status),
            },
            {
                header: 'Currency',
                accessorKey: 'settings.baseCurrency',
                cell: ({ row }) => row.original.settings?.baseCurrency ?? '—',
            },
            {
                header: 'Chart of accounts',
                accessorKey: 'settings.chartOfAccounts.code',
                cell: ({ row }) =>
                    row.original.settings?.chartOfAccounts
                        ? `${row.original.settings.chartOfAccounts.code} — ${row.original.settings.chartOfAccounts.name}`
                        : 'Not assigned',
            },
            {
                header: 'Updated',
                accessorKey: 'settings.updatedAt',
                cell: ({ row }) =>
                    row.original.settings?.updatedAt
                        ? new Date(
                              row.original.settings.updatedAt,
                          ).toLocaleDateString()
                        : '—',
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex flex-wrap justify-end gap-2">
                        <Button
                            size="sm"
                            onClick={() => openEditor(row.original)}
                        >
                            {row.original.settings ? 'Edit' : 'Configure'}
                        </Button>
                        {row.original.settings ? (
                            <Button
                                size="sm"
                                onClick={() => validate(row.original)}
                            >
                                Validate
                            </Button>
                        ) : null}
                        {row.original.status !== 'ACTIVE' &&
                        row.original.settings ? (
                            <Button
                                size="sm"
                                variant="solid"
                                onClick={() => activate(row.original)}
                            >
                                Activate
                            </Button>
                        ) : null}
                        {row.original.status === 'ACTIVE' ? (
                            <Button
                                size="sm"
                                onClick={() => deactivate(row.original)}
                            >
                                Deactivate
                            </Button>
                        ) : null}
                    </div>
                ),
            },
        ],
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

    return (
        <PageContainer>
            <PageHeader
                title="Company Accounting Settings"
                description="Configure base currency, chart of accounts, fiscal calendar and posting rules, then validate and activate."
                breadcrumbs={buildErpBreadcrumbs(ROUTE)}
            />
            <AdaptiveCard>
                <DataTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    noData={!rows.length}
                    getRowId={(row) => row.company.id}
                    fit
                />
            </AdaptiveCard>

            <FormDialog
                isOpen={Boolean(editing)}
                onClose={() => setEditing(null)}
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem label="Legal name" className="sm:col-span-2">
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
                    <FormItem label="Base currency">
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
                    <FormItem label="Country code">
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
                    <FormItem label="Timezone">
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
                    <FormItem label="Accounting method">
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
                    <FormItem label="Chart of accounts" className="sm:col-span-2">
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
                    <FormItem label="Fiscal year variant">
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
                    <FormItem label="Posting period variant">
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
                    <FormItem label="Tax country">
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
                    <FormItem label="Tax registration number">
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
                    <FormItem label="Tax jurisdiction">
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
                    <FormItem label="Default tax code">
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
                    <FormItem label="Document prefix">
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
                    <FormItem label="Document number padding">
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
            </FormDialog>
        </PageContainer>
    )
}

export default CompanySettingsPage
