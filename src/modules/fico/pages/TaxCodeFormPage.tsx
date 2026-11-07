'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import Tabs from '@/components/ui/Tabs'
import {
    HiOutlineCalendar,
    HiOutlineCash,
    HiOutlineCog,
    HiOutlineDocumentText,
    HiOutlineInformationCircle,
    HiOutlineSave,
    HiOutlineX,
} from 'react-icons/hi'
import {
    notifyError,
    notifySuccess,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import { ficoGlAccountService, ficoTaxService } from '../services/ficoService'
import type { FicoGlAccount, FicoTaxCode } from '../types'
import {
    CALCULATION_METHOD_OPTIONS,
    RATE_UNIT_OPTIONS,
    ROUNDING_LEVEL_OPTIONS,
    ROUNDING_METHOD_OPTIONS,
    TAX_CATEGORY_OPTIONS,
    TAX_CODE_ROUTE,
    TAX_TYPE_OPTIONS,
    formatTaxRate,
    isZeroLikeTaxType,
    taxCodeHref,
} from '../components/taxCodeUi'

type TaxCodeFormState = {
    companyId: string
    code: string
    name: string
    description: string
    taxCategory: string
    taxType: string
    taxJurisdiction: string
    countryCode: string
    calculationMethod: string
    rateUnit: string
    roundingMethod: string
    decimalPrecision: string
    roundingLevel: string
    calculationPriority: string
    isSalesApplicable: boolean
    isPurchaseApplicable: boolean
    isServiceApplicable: boolean
    isInventoryApplicable: boolean
    isRecoverable: boolean
    inputTaxGlAccountId: string
    outputTaxGlAccountId: string
    withholdingPayableGlAccountId: string
    withholdingReceivableGlAccountId: string
    nonRecoverableTaxGlAccountId: string
    initialRate: string
    effectiveFrom: string
    effectiveTo: string
    rateDescription: string
    status: string
    remarks: string
}

const todayIso = () => new Date().toISOString().slice(0, 10)

const EMPTY_FORM: TaxCodeFormState = {
    companyId: '',
    code: '',
    name: '',
    description: '',
    taxCategory: 'SALES_TAX',
    taxType: 'VAT',
    taxJurisdiction: '',
    countryCode: '',
    calculationMethod: 'TAX_EXCLUSIVE',
    rateUnit: 'PERCENTAGE',
    roundingMethod: 'HALF_UP',
    decimalPrecision: '2',
    roundingLevel: 'PER_LINE_ITEM',
    calculationPriority: '0',
    isSalesApplicable: true,
    isPurchaseApplicable: false,
    isServiceApplicable: false,
    isInventoryApplicable: false,
    isRecoverable: true,
    inputTaxGlAccountId: '',
    outputTaxGlAccountId: '',
    withholdingPayableGlAccountId: '',
    withholdingReceivableGlAccountId: '',
    nonRecoverableTaxGlAccountId: '',
    initialRate: '',
    effectiveFrom: todayIso(),
    effectiveTo: '',
    rateDescription: '',
    status: 'DRAFT',
    remarks: '',
}

function defaultApplicability(category: string) {
    switch (category) {
        case 'SALES_TAX':
        case 'OUTPUT_TAX':
            return {
                isSalesApplicable: true,
                isPurchaseApplicable: false,
                isServiceApplicable: false,
                isInventoryApplicable: false,
            }
        case 'PURCHASE_TAX':
        case 'INPUT_TAX':
        case 'WITHHOLDING_TAX':
            return {
                isSalesApplicable: false,
                isPurchaseApplicable: true,
                isServiceApplicable: false,
                isInventoryApplicable: false,
            }
        default:
            return {
                isSalesApplicable: false,
                isPurchaseApplicable: false,
                isServiceApplicable: false,
                isInventoryApplicable: false,
            }
    }
}

function optionOf(value: string, options: Array<{ value: string; label: string }>) {
    return options.find((option) => option.value === value) ?? null
}

function fromTaxCode(taxCode: FicoTaxCode): TaxCodeFormState {
    return {
        companyId: taxCode.companyId ?? '',
        code: taxCode.code,
        name: taxCode.name,
        description: taxCode.description ?? '',
        taxCategory: taxCode.taxCategory,
        taxType: taxCode.taxType,
        taxJurisdiction: taxCode.taxJurisdiction ?? '',
        countryCode: taxCode.countryCode ?? '',
        calculationMethod: taxCode.calculationMethod,
        rateUnit: taxCode.rateUnit,
        roundingMethod: taxCode.roundingMethod,
        decimalPrecision: String(taxCode.decimalPrecision ?? 2),
        roundingLevel: taxCode.roundingLevel,
        calculationPriority: String(taxCode.calculationPriority ?? 0),
        isSalesApplicable: taxCode.isSalesApplicable,
        isPurchaseApplicable: taxCode.isPurchaseApplicable,
        isServiceApplicable: taxCode.isServiceApplicable,
        isInventoryApplicable: taxCode.isInventoryApplicable,
        isRecoverable: taxCode.isRecoverable,
        inputTaxGlAccountId: taxCode.inputTaxGlAccountId ?? '',
        outputTaxGlAccountId: taxCode.outputTaxGlAccountId ?? '',
        withholdingPayableGlAccountId:
            taxCode.withholdingPayableGlAccountId ?? '',
        withholdingReceivableGlAccountId:
            taxCode.withholdingReceivableGlAccountId ?? '',
        nonRecoverableTaxGlAccountId:
            taxCode.nonRecoverableTaxGlAccountId ?? '',
        initialRate: '',
        effectiveFrom: todayIso(),
        effectiveTo: '',
        rateDescription: '',
        status: taxCode.status,
        remarks: taxCode.remarks ?? '',
    }
}

const TaxCodeFormPage = () => {
    const params = useParams()
    const router = useRouter()
    const searchParams = useSearchParams()
    const idParam = params?.id
    const taxCodeId = Array.isArray(idParam) ? idParam[0] : idParam
    const isEdit = Boolean(taxCodeId)

    const {
        rows,
        companies,
        companyId,
        loading: companyLoading,
    } = useFicoCompanies()

    const [form, setForm] = useState<TaxCodeFormState>(EMPTY_FORM)
    const [loadedTaxCode, setLoadedTaxCode] = useState<FicoTaxCode | null>(null)
    const [glAccounts, setGlAccounts] = useState<FicoGlAccount[]>([])
    const [loading, setLoading] = useState(isEdit)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
    const [initializedCompany, setInitializedCompany] = useState(false)
    const [activeTab, setActiveTab] = useState('identity')

    const structureLocked =
        Boolean(loadedTaxCode) &&
        ((loadedTaxCode?.rateCount ?? 0) > 0 ||
            loadedTaxCode?.status === 'ACTIVE' ||
            loadedTaxCode?.status === 'INACTIVE')

    const companyRow = useMemo(
        () => rows.find((row) => row.company.id === form.companyId),
        [rows, form.companyId],
    )
    const chartOfAccountsId =
        companyRow?.settings?.chartOfAccountsId ?? null

    // Prefill the company for a new tax code once companies are available.
    useEffect(() => {
        if (isEdit || initializedCompany || companyLoading) return
        const fromQuery = searchParams.get('companyId')
        const preferred =
            rows.find((row) => row.company.id === fromQuery)?.company.id ??
            companyId
        if (preferred) {
            setForm((previous) => ({ ...previous, companyId: preferred }))
        }
        setInitializedCompany(true)
    }, [isEdit, initializedCompany, companyLoading, rows, companyId, searchParams])

    // Load an existing tax code for editing.
    useEffect(() => {
        if (!taxCodeId) return
        let active = true
        setLoading(true)
        ficoTaxService
            .get(taxCodeId)
            .then((record) => {
                if (!active) return
                setLoadedTaxCode(record)
                setForm(fromTaxCode(record))
            })
            .catch((error) =>
                notifyError(error, 'Unable to load the tax code.'),
            )
            .finally(() => {
                if (active) setLoading(false)
            })
        return () => {
            active = false
        }
    }, [taxCodeId])

    // Load active posting accounts from the company's assigned chart.
    useEffect(() => {
        if (!chartOfAccountsId) {
            setGlAccounts([])
            return
        }
        let active = true
        ficoGlAccountService
            .list({ chartOfAccountsId, status: 'ACTIVE' })
            .then((accounts) => {
                if (active) {
                    setGlAccounts(
                        accounts.filter((account) => account.isPostingAccount),
                    )
                }
            })
            .catch((error) =>
                notifyError(
                    error,
                    'Unable to load G/L accounts for the company chart.',
                ),
            )
        return () => {
            active = false
        }
    }, [chartOfAccountsId])

    const setField = <Key extends keyof TaxCodeFormState>(
        key: Key,
        value: TaxCodeFormState[Key],
    ) => {
        setForm((previous) => ({ ...previous, [key]: value }))
        // Clear field-level error as soon as the user interacts with the field.
        if (fieldErrors[key as string]) {
            setFieldErrors((previous) => {
                const next = { ...previous }
                delete next[key as string]
                return next
            })
        }
    }

    const changeCategory = (category: string) => {
        setForm((previous) => ({
            ...previous,
            taxCategory: category,
            ...(isEdit
                ? {}
                : defaultApplicability(category)),
        }))
    }

    const changeTaxType = (taxType: string) => {
        setForm((previous) => ({
            ...previous,
            taxType,
            ...(isEdit
                ? {}
                : isZeroLikeTaxType(taxType)
                  ? {
                        initialRate: '0',
                        calculationMethod: 'NOT_APPLICABLE',
                    }
                  : {}),
        }))
    }

    const glOptions = useCallback(
        (
            types: readonly string[],
            selectedId: string,
            requirePosting = true,
        ) => {
            const filtered = glAccounts.filter(
                (account) =>
                    types.includes(account.accountType) &&
                    (!requirePosting || account.isPostingAccount),
            )
            const selected = glAccounts.find(
                (account) => account.id === selectedId,
            )
            const list =
                selected && !filtered.some((account) => account.id === selected.id)
                    ? [...filtered, selected]
                    : filtered
            return list.map((account) => ({
                value: account.id,
                label: `${account.accountCode} — ${account.accountName}`,
            }))
        },
        [glAccounts],
    )

    const save = async () => {
        setFormError(null)
        if (!form.companyId) {
            setFormError('Select a company for the tax code.')
            return
        }
        if (!form.code.trim()) {
            setFormError('Enter a tax code.')
            return
        }
        if (!form.name.trim()) {
            setFormError('Enter a tax code name.')
            return
        }
        if (!form.taxCategory || !form.taxType) {
            setFormError('Select a tax category and tax type.')
            return
        }
        const precision = Number.parseInt(form.decimalPrecision, 10)
        if (!Number.isInteger(precision) || precision < 0 || precision > 10) {
            setFormError('Decimal precision must be a whole number from 0 to 10.')
            return
        }
        const priority = Number.parseInt(form.calculationPriority, 10)
        if (!Number.isInteger(priority) || priority < 0) {
            setFormError('Calculation priority must be a whole number of 0 or more.')
            return
        }
        if (!isEdit && form.initialRate.trim()) {
            const initial = Number(form.initialRate)
            if (!Number.isFinite(initial) || initial < 0) {
                setFormError('Initial rate must be a non-negative number.')
                return
            }
            if (form.rateUnit === 'PERCENTAGE' && initial > 100) {
                setFormError('A percentage rate cannot exceed 100%.')
                return
            }
            if (isZeroLikeTaxType(form.taxType) && initial !== 0) {
                setFormError(
                    'Zero-rated, exempt and non-taxable tax codes must use a 0% rate.',
                )
                return
            }
        }
        if (
            !isEdit &&
            form.effectiveTo &&
            form.effectiveFrom &&
            form.effectiveTo < form.effectiveFrom
        ) {
            setFormError(
                'The effective-to date must be on or after the effective-from date.',
            )
            return
        }

        const mappings = {
            inputTaxGlAccountId: form.inputTaxGlAccountId || null,
            outputTaxGlAccountId: form.outputTaxGlAccountId || null,
            withholdingPayableGlAccountId:
                form.withholdingPayableGlAccountId || null,
            withholdingReceivableGlAccountId:
                form.withholdingReceivableGlAccountId || null,
            nonRecoverableTaxGlAccountId:
                form.nonRecoverableTaxGlAccountId || null,
        }

        setSaving(true)
        try {
            if (isEdit && taxCodeId) {
                await ficoTaxService.update(taxCodeId, {
                    name: form.name.trim(),
                    description: form.description.trim() || null,
                    taxJurisdiction: form.taxJurisdiction.trim() || null,
                    countryCode: form.countryCode.trim().toUpperCase() || null,
                    ...(structureLocked
                        ? {}
                        : {
                              calculationMethod: form.calculationMethod,
                              rateUnit: form.rateUnit,
                          }),
                    roundingMethod: form.roundingMethod,
                    decimalPrecision: precision,
                    roundingLevel: form.roundingLevel,
                    calculationPriority: priority,
                    isSalesApplicable: form.isSalesApplicable,
                    isPurchaseApplicable: form.isPurchaseApplicable,
                    isServiceApplicable: form.isServiceApplicable,
                    isInventoryApplicable: form.isInventoryApplicable,
                    isRecoverable: form.isRecoverable,
                    ...mappings,
                    remarks: form.remarks.trim() || null,
                })
                notifySuccess('Tax code updated.')
                router.push(taxCodeHref(taxCodeId))
            } else {
                const created = await ficoTaxService.create({
                    companyId: form.companyId,
                    code: form.code.trim(),
                    name: form.name.trim(),
                    description: form.description.trim() || null,
                    taxCategory: form.taxCategory,
                    taxType: form.taxType,
                    taxJurisdiction: form.taxJurisdiction.trim() || null,
                    countryCode: form.countryCode.trim().toUpperCase() || null,
                    calculationMethod: form.calculationMethod,
                    rateUnit: form.rateUnit,
                    roundingMethod: form.roundingMethod,
                    decimalPrecision: precision,
                    roundingLevel: form.roundingLevel,
                    calculationPriority: priority,
                    isSalesApplicable: form.isSalesApplicable,
                    isPurchaseApplicable: form.isPurchaseApplicable,
                    isServiceApplicable: form.isServiceApplicable,
                    isInventoryApplicable: form.isInventoryApplicable,
                    isRecoverable: form.isRecoverable,
                    ...mappings,
                    initialRate: form.initialRate.trim()
                        ? Number(form.initialRate)
                        : null,
                    initialRateUnit: form.rateUnit,
                    effectiveFrom: form.effectiveFrom || null,
                    effectiveTo: form.effectiveTo || null,
                    rateDescription:
                        form.rateDescription.trim() || null,
                    status: form.status,
                    remarks: form.remarks.trim() || null,
                })
                notifySuccess(
                    form.status === 'ACTIVE'
                        ? 'Tax code created and activated.'
                        : 'Tax code created as a draft.',
                )
                router.push(taxCodeHref(created.id))
            }
        } catch (error) {
            const data = (
                error as {
                    response?: {
                        data?: {
                            message?: string
                            errors?: Array<{ field?: string; message?: string }>
                        }
                    }
                }
            )?.response?.data
            const backendMessage = data?.message
            const fieldErrorList = data?.errors ?? []

            // Clear previous field errors and apply new ones from the backend.
            setFieldErrors({})
            fieldErrorList.forEach((entry) => {
                if (entry.field && entry.message) {
                    setFieldErrors((previous) => ({
                        ...previous,
                        [entry.field]: entry.message,
                    }))
                }
            })

            if (fieldErrorList.length > 0) {
                setFormError(
                    'Tax code configuration is incomplete. Fix the highlighted fields below.',
                )
            } else {
                setFormError(
                    typeof backendMessage === 'string' && backendMessage.trim()
                        ? backendMessage
                        : 'Unable to save the tax code. Review the configuration and try again.',
                )
            }
            notifyError(error, formError ?? '')
        } finally {
            setSaving(false)
        }
    }

    const cancel = () => {
        if (isEdit && taxCodeId) {
            router.push(taxCodeHref(taxCodeId))
        } else {
            router.push(TAX_CODE_ROUTE)
        }
    }

    const zeroLike = isZeroLikeTaxType(form.taxType)
    const withholding =
        form.taxCategory === 'WITHHOLDING_TAX' ||
        form.taxType === 'WITHHOLDING_TAX'
    const companyOptions = companies.map((company) => ({
        value: company.id,
        label: `${company.code} — ${company.name}`,
    }))

    if (loading) {
        return (
            <PageContainer>
                <PageHeader
                    title={isEdit ? 'Edit Tax Code' : 'Create Tax Code'}
                    description="Loading tax code configuration…"
                    breadcrumbs={buildErpBreadcrumbs(
                        isEdit && taxCodeId
                            ? taxCodeHref(taxCodeId)
                            : TAX_CODE_ROUTE,
                    )}
                />
                <AdaptiveCard>
                    <p className="py-10 text-center text-sm text-gray-500">
                        Loading tax code…
                    </p>
                </AdaptiveCard>
            </PageContainer>
        )
    }

    return (
        <PageContainer>
            <PageHeader
                title={
                    isEdit
                        ? `Edit Tax Code ${loadedTaxCode?.code ?? ''}`
                        : 'Create Tax Code'
                }
                description={
                    isEdit
                        ? loadedTaxCode?.name ??
                          'Update the tax code configuration.'
                        : 'Define the tax classification, calculation behavior, effective-dated rate, and G/L mappings.'
                }
                breadcrumbs={buildErpBreadcrumbs(
                    isEdit && taxCodeId
                        ? taxCodeHref(taxCodeId)
                        : `${TAX_CODE_ROUTE}/create`,
                    {
                        detailLabel: isEdit
                            ? `Edit ${loadedTaxCode?.code ?? ''}`.trim()
                            : 'Create Tax Code',
                    },
                )}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="plain"
                            onClick={cancel}
                            disabled={saving}
                        >
                            <HiOutlineX className="mr-1.5 h-4 w-4" />
                            Cancel
                        </Button>
                        <Button
                            variant="solid"
                            onClick={save}
                            loading={saving}
                        >
                            <HiOutlineSave className="mr-1.5 h-4 w-4" />
                            {isEdit ? 'Save changes' : 'Create tax code'}
                        </Button>
                    </div>
                }
            />

            {formError ? (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                    {formError}
                </div>
            ) : null}

            <Tabs
                value={activeTab}
                onChange={(value) => setActiveTab(String(value))}
                className="mb-6"
            >
                <Tabs.TabList>
                    <Tabs.TabNav value="identity">Identity</Tabs.TabNav>
                    <Tabs.TabNav value="classification">Classification</Tabs.TabNav>
                    <Tabs.TabNav value="applicability">Applicability</Tabs.TabNav>
                    <Tabs.TabNav value="rounding">Rounding</Tabs.TabNav>
                    {!isEdit ? (
                        <Tabs.TabNav value="rate">Initial Rate</Tabs.TabNav>
                    ) : (
                        <Tabs.TabNav value="rates">Rates</Tabs.TabNav>
                    )}
                    <Tabs.TabNav value="glMappings">G/L Mappings</Tabs.TabNav>
                    <Tabs.TabNav value="remarks">Remarks</Tabs.TabNav>
                </Tabs.TabList>

                <Tabs.TabContent value="identity">
                    <AdaptiveCard>
                        <SectionHeader
                            icon={<HiOutlineDocumentText />}
                            title="Identity"
                            description="Company ownership, tax code identifier, and descriptive information."
                        />
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <FormItem label="Company" asterisk>
                                <Select
                                    value={optionOf(form.companyId, companyOptions)}
                                    options={companyOptions}
                                    isClearable={false}
                                    isDisabled={isEdit}
                                    isLoading={companyLoading}
                                    placeholder="Select company"
                                    onChange={(option) =>
                                        setField(
                                            'companyId',
                                            (option as { value: string } | null)
                                                ?.value ?? '',
                                        )
                                    }
                                />
                                <FieldError fieldErrors={fieldErrors} field="companyId" />
                            </FormItem>
                            <FormItem label="Tax code" asterisk>
                                <Input
                                    value={form.code}
                                    maxLength={32}
                                    disabled={isEdit}
                                    placeholder="e.g. VAT12"
                                    onChange={(event) =>
                                        setField(
                                            'code',
                                            event.target.value.toUpperCase(),
                                        )
                                    }
                                />
                                <FieldError fieldErrors={fieldErrors} field="code" />
                            </FormItem>
                            <FormItem label="Name" asterisk>
                                <Input
                                    value={form.name}
                                    maxLength={160}
                                    placeholder="e.g. Standard VAT 12%"
                                    onChange={(event) =>
                                        setField('name', event.target.value)
                                    }
                                />
                                <FieldError fieldErrors={fieldErrors} field="name" />
                            </FormItem>
                            <FormItem label="Tax jurisdiction">
                                <Input
                                    value={form.taxJurisdiction}
                                    maxLength={128}
                                    placeholder="e.g. Philippines"
                                    onChange={(event) =>
                                        setField(
                                            'taxJurisdiction',
                                            event.target.value,
                                        )
                                    }
                                />
                            </FormItem>
                            <FormItem label="Country code">
                                <Input
                                    value={form.countryCode}
                                    maxLength={2}
                                    placeholder="e.g. PH"
                                    onChange={(event) =>
                                        setField(
                                            'countryCode',
                                            event.target.value.toUpperCase(),
                                        )
                                    }
                                />
                            </FormItem>
                            <FormItem label="Status">
                                {isEdit ? (
                                    <Input
                                        value={form.status}
                                        disabled
                                        readOnly
                                    />
                                ) : (
                                    <Select
                                        value={optionOf(form.status, [
                                            { value: 'DRAFT', label: 'Draft' },
                                            { value: 'ACTIVE', label: 'Active' },
                                        ])}
                                        options={[
                                            { value: 'DRAFT', label: 'Draft' },
                                            {
                                                value: 'ACTIVE',
                                                label:
                                                    'Active (validates mappings and rates)',
                                            },
                                        ]}
                                        isClearable={false}
                                        onChange={(option) =>
                                            setField(
                                                'status',
                                                (option as { value: string } | null)
                                                    ?.value ?? 'DRAFT',
                                            )
                                        }
                                    />
                                )}
                            </FormItem>
                            <FormItem
                                label="Description"
                                className="sm:col-span-2 lg:col-span-3"
                            >
                                <Input
                                    textArea
                                    rows={2}
                                    value={form.description}
                                    maxLength={2000}
                                    placeholder="Purpose and usage notes for this tax code"
                                    onChange={(event) =>
                                        setField('description', event.target.value)
                                    }
                                />
                            </FormItem>
                        </div>
                    </AdaptiveCard>
                </Tabs.TabContent>

                <Tabs.TabContent value="classification">
                    <AdaptiveCard>
                        <SectionHeader
                            icon={<HiOutlineCog />}
                            title="Classification and calculation"
                            description="Tax category and type drive applicability defaults and activation requirements."
                        />
                        {structureLocked ? (
                            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                                <HiOutlineInformationCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>
                                    Tax category, type, calculation method, and
                                    rate unit are locked because rates exist or the
                                    tax code has been activated. Duplicate the
                                    configuration to change these fields.
                                </span>
                            </div>
                        ) : null}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <FormItem label="Tax category" asterisk>
                                <Select
                                    value={optionOf(
                                        form.taxCategory,
                                        TAX_CATEGORY_OPTIONS,
                                    )}
                                    options={TAX_CATEGORY_OPTIONS}
                                    isClearable={false}
                                    isDisabled={structureLocked}
                                    onChange={(option) =>
                                        changeCategory(
                                            (option as { value: string } | null)
                                                ?.value ?? '',
                                        )
                                    }
                                />
                                <FieldError fieldErrors={fieldErrors} field="taxCategory" />
                            </FormItem>
                            <FormItem label="Tax type" asterisk>
                                <Select
                                    value={optionOf(form.taxType, TAX_TYPE_OPTIONS)}
                                    options={TAX_TYPE_OPTIONS}
                                    isClearable={false}
                                    isDisabled={structureLocked}
                                    onChange={(option) =>
                                        changeTaxType(
                                            (option as { value: string } | null)
                                                ?.value ?? '',
                                        )
                                    }
                                />
                                <FieldError fieldErrors={fieldErrors} field="taxType" />
                            </FormItem>
                            <FormItem label="Calculation method">
                                <Select
                                    value={optionOf(
                                        form.calculationMethod,
                                        CALCULATION_METHOD_OPTIONS,
                                    )}
                                    options={CALCULATION_METHOD_OPTIONS}
                                    isClearable={false}
                                    isDisabled={structureLocked}
                                    onChange={(option) =>
                                        setField(
                                            'calculationMethod',
                                            (option as { value: string } | null)
                                                ?.value ?? 'TAX_EXCLUSIVE',
                                        )
                                    }
                                />
                            </FormItem>
                            <FormItem label="Rate unit">
                                <Select
                                    value={optionOf(form.rateUnit, RATE_UNIT_OPTIONS)}
                                    options={RATE_UNIT_OPTIONS}
                                    isClearable={false}
                                    isDisabled={structureLocked}
                                    onChange={(option) =>
                                        setField(
                                            'rateUnit',
                                            (option as { value: string } | null)
                                                ?.value ?? 'PERCENTAGE',
                                        )
                                    }
                                />
                            </FormItem>
                        </div>
                    </AdaptiveCard>
                </Tabs.TabContent>

                <Tabs.TabContent value="applicability">
                    <AdaptiveCard>
                        <SectionHeader
                            icon={<HiOutlineCog />}
                            title="Applicability"
                            description="Select which transaction types this tax code applies to."
                        />
                        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <ToggleRow
                                label="Sales"
                                description="Customer invoices and sales orders"
                                checked={form.isSalesApplicable}
                                onChange={(value) =>
                                    setField('isSalesApplicable', value)
                                }
                            />
                            <ToggleRow
                                label="Purchases"
                                description="Supplier invoices and purchase orders"
                                checked={form.isPurchaseApplicable}
                                onChange={(value) =>
                                    setField('isPurchaseApplicable', value)
                                }
                            />
                            <ToggleRow
                                label="Services"
                                description="Service invoices and credit notes"
                                checked={form.isServiceApplicable}
                                onChange={(value) =>
                                    setField('isServiceApplicable', value)
                                }
                            />
                            <ToggleRow
                                label="Inventory"
                                description="Inventory-related financial documents"
                                checked={form.isInventoryApplicable}
                                onChange={(value) =>
                                    setField('isInventoryApplicable', value)
                                }
                            />
                            <FieldError fieldErrors={fieldErrors} field="isSalesApplicable" />
                        </div>
                    </AdaptiveCard>
                </Tabs.TabContent>

                <Tabs.TabContent value="rounding">
                    <AdaptiveCard>
                        <SectionHeader
                            icon={<HiOutlineCog />}
                            title="Rounding"
                            description="Controls how calculated tax is rounded before it reaches G/L postings."
                        />
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <FormItem label="Rounding method">
                                <Select
                                    value={optionOf(
                                        form.roundingMethod,
                                        ROUNDING_METHOD_OPTIONS,
                                    )}
                                    options={ROUNDING_METHOD_OPTIONS}
                                    isClearable={false}
                                    onChange={(option) =>
                                        setField(
                                            'roundingMethod',
                                            (option as { value: string } | null)
                                                ?.value ?? 'HALF_UP',
                                        )
                                    }
                                />
                            </FormItem>
                            <FormItem label="Decimal precision">
                                <Input
                                    type="number"
                                    min={0}
                                    max={10}
                                    value={form.decimalPrecision}
                                    onChange={(event) =>
                                        setField(
                                            'decimalPrecision',
                                            event.target.value,
                                        )
                                    }
                                />
                            </FormItem>
                            <FormItem label="Rounding level">
                                <Select
                                    value={optionOf(
                                        form.roundingLevel,
                                        ROUNDING_LEVEL_OPTIONS,
                                    )}
                                    options={ROUNDING_LEVEL_OPTIONS}
                                    isClearable={false}
                                    onChange={(option) =>
                                        setField(
                                            'roundingLevel',
                                            (option as { value: string } | null)
                                                ?.value ?? 'PER_LINE_ITEM',
                                        )
                                    }
                                />
                            </FormItem>
                            <FormItem label="Calculation priority">
                                <Input
                                    type="number"
                                    min={0}
                                    value={form.calculationPriority}
                                    onChange={(event) =>
                                        setField(
                                            'calculationPriority',
                                            event.target.value,
                                        )
                                    }
                                />
                            </FormItem>
                        </div>
                    </AdaptiveCard>
                </Tabs.TabContent>

                {!isEdit ? (
                    <Tabs.TabContent value="rate">
                        <AdaptiveCard>
                            <SectionHeader
                                icon={<HiOutlineCalendar />}
                                title="Initial effective-dated rate"
                                description="Optional. The first rate is created atomically with the tax code."
                            />
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                <FormItem label="Rate">
                                    <Input
                                        inputMode="decimal"
                                        value={form.initialRate}
                                        placeholder={
                                            zeroLike
                                                ? '0'
                                                : form.rateUnit === 'PERCENTAGE'
                                                  ? 'e.g. 12'
                                                  : 'e.g. 50.00'
                                        }
                                        onChange={(event) =>
                                            setField(
                                                'initialRate',
                                                event.target.value,
                                            )
                                        }
                                    />
                                    <FieldError fieldErrors={fieldErrors} field="initialRate" />
                                </FormItem>
                                <FormItem label="Effective from">
                                    <Input
                                        type="date"
                                        value={form.effectiveFrom}
                                        onChange={(event) =>
                                            setField(
                                                'effectiveFrom',
                                                event.target.value,
                                            )
                                        }
                                    />
                                </FormItem>
                                <FormItem label="Effective to">
                                    <Input
                                        type="date"
                                        value={form.effectiveTo}
                                        onChange={(event) =>
                                            setField(
                                                'effectiveTo',
                                                event.target.value,
                                            )
                                        }
                                    />
                                    <FieldError fieldErrors={fieldErrors} field="effectiveTo" />
                                </FormItem>
                                <FormItem label="Rate description">
                                    <Input
                                        value={form.rateDescription}
                                        placeholder="Optional note"
                                        onChange={(event) =>
                                            setField(
                                                'rateDescription',
                                                event.target.value,
                                            )
                                        }
                                    />
                                </FormItem>
                            </div>
                            {zeroLike ? (
                                <p className="mt-2 text-xs text-gray-500">
                                    Zero-rated, exempt, and non-taxable tax codes
                                    must use a 0% rate and can activate without a
                                    rate record.
                                </p>
                            ) : null}
                        </AdaptiveCard>
                    </Tabs.TabContent>
                ) : (
                    <Tabs.TabContent value="rates">
                        <AdaptiveCard>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                                        Effective-dated rates
                                    </h3>
                                    <p className="mt-1 text-sm text-gray-500">
                                        {(loadedTaxCode?.rateCount ?? 0) === 0
                                            ? 'No rates configured yet.'
                                            : `${loadedTaxCode?.rateCount} rate${(loadedTaxCode?.rateCount ?? 0) === 1 ? '' : 's'} on record. Existing rate amounts and start dates are immutable.`}
                                    </p>
                                </div>
                                {loadedTaxCode?.currentRate ? (
                                    <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                        Current:{' '}
                                        {formatTaxRate(
                                            loadedTaxCode.currentRate.rate,
                                            loadedTaxCode.currentRate.rateUnit,
                                        )}
                                    </p>
                                ) : null}
                                <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() =>
                                        router.push(
                                            taxCodeHref(taxCodeId ?? '', 'rates'),
                                        )
                                    }
                                >
                                    <HiOutlineCalendar className="mr-1.5 h-4 w-4" />
                                    Manage rate history
                                </Button>
                            </div>
                        </AdaptiveCard>
                    </Tabs.TabContent>
                )}

                <Tabs.TabContent value="glMappings">
                    <AdaptiveCard>
                        <SectionHeader
                            icon={<HiOutlineCash />}
                            title="Recoverability and G/L mappings"
                            description="Mappings must use active posting accounts from the company's assigned chart of accounts."
                        />
                        {!chartOfAccountsId ? (
                            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                                No chart of accounts is assigned to this company.
                                Assign one in Company Accounting Settings before
                                mapping tax G/L accounts.
                            </div>
                        ) : null}

                        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700/60">
                            <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    Tax is recoverable
                                </p>
                                <p className="text-xs text-gray-500">
                                    When disabled, a non-recoverable tax expense
                                    account is required for activation.
                                </p>
                            </div>
                            <Switcher
                                checked={form.isRecoverable}
                                onChange={(checked) =>
                                    setField('isRecoverable', checked)
                                }
                            />
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <FormItem label="Input tax account">
                                <Select
                                    value={optionOf(
                                        form.inputTaxGlAccountId,
                                        glOptions(
                                            ['ASSET', 'EXPENSE'],
                                            form.inputTaxGlAccountId,
                                        ),
                                    )}
                                    options={glOptions(
                                        ['ASSET', 'EXPENSE'],
                                        form.inputTaxGlAccountId,
                                    )}
                                    isClearable
                                    isDisabled={!chartOfAccountsId}
                                    placeholder="Asset or expense posting account"
                                    onChange={(option) =>
                                        setField(
                                            'inputTaxGlAccountId',
                                            (option as { value: string } | null)
                                                ?.value ?? '',
                                        )
                                    }
                                />
                                <FieldError fieldErrors={fieldErrors} field="inputTaxGlAccountId" />
                            </FormItem>
                            <FormItem label="Output tax account">
                                <Select
                                    value={optionOf(
                                        form.outputTaxGlAccountId,
                                        glOptions(
                                            ['LIABILITY'],
                                            form.outputTaxGlAccountId,
                                        ),
                                    )}
                                    options={glOptions(
                                        ['LIABILITY'],
                                        form.outputTaxGlAccountId,
                                    )}
                                    isClearable
                                    isDisabled={!chartOfAccountsId}
                                    placeholder="Liability posting account"
                                    onChange={(option) =>
                                        setField(
                                            'outputTaxGlAccountId',
                                            (option as { value: string } | null)
                                                ?.value ?? '',
                                        )
                                    }
                                />
                                <FieldError fieldErrors={fieldErrors} field="outputTaxGlAccountId" />
                            </FormItem>
                            <FormItem
                                label="Withholding tax payable account"
                                extra="Required when withholding amounts are payable."
                            >
                                <Select
                                    value={optionOf(
                                        form.withholdingPayableGlAccountId,
                                        glOptions(
                                            ['LIABILITY'],
                                            form.withholdingPayableGlAccountId,
                                        ),
                                    )}
                                    options={glOptions(
                                        ['LIABILITY'],
                                        form.withholdingPayableGlAccountId,
                                    )}
                                    isClearable
                                    isDisabled={!chartOfAccountsId}
                                    placeholder="Liability posting account"
                                    onChange={(option) =>
                                        setField(
                                            'withholdingPayableGlAccountId',
                                            (option as { value: string } | null)
                                                ?.value ?? '',
                                        )
                                    }
                                />
                                <FieldError fieldErrors={fieldErrors} field="withholdingPayableGlAccountId" />
                            </FormItem>
                            <FormItem label="Withholding tax receivable account">
                                <Select
                                    value={optionOf(
                                        form.withholdingReceivableGlAccountId,
                                        glOptions(
                                            ['ASSET'],
                                            form.withholdingReceivableGlAccountId,
                                        ),
                                    )}
                                    options={glOptions(
                                        ['ASSET'],
                                        form.withholdingReceivableGlAccountId,
                                    )}
                                    isClearable
                                    isDisabled={!chartOfAccountsId}
                                    placeholder="Asset posting account"
                                    onChange={(option) =>
                                        setField(
                                            'withholdingReceivableGlAccountId',
                                            (option as { value: string } | null)
                                                ?.value ?? '',
                                        )
                                    }
                                />
                                <FieldError fieldErrors={fieldErrors} field="withholdingReceivableGlAccountId" />
                            </FormItem>
                            <FormItem
                                label="Non-recoverable tax expense account"
                                extra={
                                    !form.isRecoverable
                                        ? 'Required for activation when the tax is not recoverable.'
                                        : undefined
                                }
                            >
                                <Select
                                    value={optionOf(
                                        form.nonRecoverableTaxGlAccountId,
                                        glOptions(
                                            ['EXPENSE'],
                                            form.nonRecoverableTaxGlAccountId,
                                        ),
                                    )}
                                    options={glOptions(
                                        ['EXPENSE'],
                                        form.nonRecoverableTaxGlAccountId,
                                    )}
                                    isClearable
                                    isDisabled={!chartOfAccountsId}
                                    placeholder="Expense posting account"
                                    onChange={(option) =>
                                        setField(
                                            'nonRecoverableTaxGlAccountId',
                                            (option as { value: string } | null)
                                                ?.value ?? '',
                                        )
                                    }
                                />
                                <FieldError fieldErrors={fieldErrors} field="nonRecoverableTaxGlAccountId" />
                            </FormItem>
                        </div>
                        {withholding ? (
                            <p className="mt-2 text-xs text-gray-500">
                                Withholding tax codes require at least one
                                withholding payable or receivable account before
                                activation.
                            </p>
                        ) : null}
                    </AdaptiveCard>
                </Tabs.TabContent>

                <Tabs.TabContent value="remarks">
                    <AdaptiveCard>
                        <SectionHeader
                            icon={<HiOutlineDocumentText />}
                            title="Remarks"
                            description="Internal notes retained with the tax code and audit history."
                        />
                        <FormItem label="Remarks">
                            <Input
                                textArea
                                rows={3}
                                value={form.remarks}
                                maxLength={2000}
                                placeholder="Optional internal notes"
                                onChange={(event) =>
                                    setField('remarks', event.target.value)
                                }
                            />
                        </FormItem>
                    </AdaptiveCard>
                </Tabs.TabContent>
            </Tabs>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-6 border-t border-gray-200 dark:border-gray-700">
                <Button variant="plain" onClick={cancel} disabled={saving}>
                    Cancel
                </Button>
                <Button variant="solid" onClick={save} loading={saving}>
                    <HiOutlineSave className="mr-1.5 h-4 w-4" />
                    {isEdit ? 'Save changes' : 'Create tax code'}
                </Button>
            </div>
        </PageContainer>
    )
}

function FieldError({
    fieldErrors,
    field,
}: {
    fieldErrors: Record<string, string>
    field: string
}) {
    const message = fieldErrors[field]
    if (!message) return null
    return (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400 font-medium">
            {message}
        </p>
    )
}

function SectionHeader({
    icon,
    title,
    description,
}: {
    icon: ReactNode
    title: string
    description: string
}) {
    return (
        <div className="mb-5 flex items-start gap-2">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light">
                {icon}
            </span>
            <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {title}
                </h3>
                <p className="mt-0.5 text-sm text-gray-500">{description}</p>
            </div>
        </div>
    )
}

function ToggleRow({
    label,
    description,
    checked,
    onChange,
}: {
    label: string
    description: string
    checked: boolean
    onChange: (checked: boolean) => void
}) {
    return (
        <div className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700/60">
            <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {label}
                </p>
                <p className="text-xs text-gray-500">{description}</p>
            </div>
            <Switcher checked={checked} onChange={onChange} />
        </div>
    )
}

export default TaxCodeFormPage
