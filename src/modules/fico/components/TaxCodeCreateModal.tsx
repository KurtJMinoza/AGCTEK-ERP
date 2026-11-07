'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import { FormItem } from '@/components/ui/Form'
import { HiOutlineCheck, HiOutlineX } from 'react-icons/hi'
import {
    notifySuccess,
    useFicoCompanies,
} from './FicoCompanySelect'
import { ficoGlAccountService, ficoTaxService } from '../services/ficoService'
import type { FicoGlAccount } from '../types'
import {
    CALCULATION_METHOD_LABELS,
    CALCULATION_METHOD_OPTIONS,
    RATE_UNIT_LABELS,
    RATE_UNIT_OPTIONS,
    ROUNDING_LEVEL_OPTIONS,
    ROUNDING_METHOD_OPTIONS,
    TAX_CATEGORY_LABELS,
    TAX_CATEGORY_OPTIONS,
    TAX_TYPE_LABELS,
    TAX_TYPE_OPTIONS,
    formatTaxRate,
    taxCodeHref,
} from './taxCodeUi'

type WizardStep = 'identity' | 'configuration' | 'applicability' | 'rate' | 'glMappings' | 'review'

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

const STEP_ORDER: WizardStep[] = [
    'identity',
    'configuration',
    'applicability',
    'rate',
    'glMappings',
    'review',
]

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

function isZeroLike(taxType: string): boolean {
    return ['ZERO_RATED_TAX', 'EXEMPT_TAX', 'NON_TAXABLE'].includes(taxType)
}

function optionOf(
    value: string,
    options: Array<{ value: string; label: string }>,
) {
    return options.find((option) => option.value === value) ?? null
}

function describeError(error: unknown, fallback: string): string {
    const data = (
        error as {
            response?: {
                data?: {
                    message?:
                        | string
                        | string[]
                        | {
                              message?: string
                              errors?: Array<{ message?: string }>
                          }
                }
            }
        }
    )?.response?.data
    const message = data?.message
    if (Array.isArray(message)) return message.join(', ')
    if (typeof message === 'string' && message.trim()) return message
    if (message && typeof message === 'object') {
        const parts = [
            message.message,
            ...(data.errors ?? []).map((entry) => entry.message),
        ].filter((part): part is string => Boolean(part?.trim()))
        if (parts.length) return parts.join(' ')
    }
    return fallback
}

interface TaxCodeCreateModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}

export default function TaxCodeCreateModal({
    isOpen,
    onClose,
    onSuccess,
}: TaxCodeCreateModalProps) {
    const {
        rows,
        companies,
        companyId: selectedCompanyId,
        loading: companyLoading,
    } = useFicoCompanies()
    const router = useRouter()

    const [currentStep, setCurrentStep] = useState<WizardStep>('identity')
    const [form, setForm] = useState<TaxCodeFormState>(EMPTY_FORM)
    const [glAccounts, setGlAccounts] = useState<FicoGlAccount[]>([])
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

    const companyRow = useMemo(
        () => rows.find((row) => row.company.id === form.companyId),
        [rows, form.companyId],
    )
    const chartOfAccountsId =
        companyRow?.settings?.chartOfAccountsId ?? null

    const stepIndex = STEP_ORDER.indexOf(currentStep)
    const isFirstStep = stepIndex === 0
    const isLastStep = stepIndex === STEP_ORDER.length - 1

    // Prefill company
    useEffect(() => {
        if (!isOpen) return
        const preferred =
            rows.find((row) => row.company.id === selectedCompanyId)?.company.id ??
            selectedCompanyId
        if (preferred && !form.companyId) {
            setForm((previous) => ({ ...previous, companyId: preferred }))
        }
    }, [isOpen, rows, selectedCompanyId, form.companyId])

    // Load G/L accounts when company/COA changes
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
            .catch(() => setGlAccounts([]))
        return () => {
            active = false
        }
    }, [chartOfAccountsId])

    const setField = <Key extends keyof TaxCodeFormState>(
        key: Key,
        value: TaxCodeFormState[Key],
    ) => {
        setForm((previous) => ({ ...previous, [key]: value }))
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
            ...defaultApplicability(category),
        }))
    }

    const changeTaxType = (taxType: string) => {
        setForm((previous) => ({
            ...previous,
            taxType,
            ...(isZeroLike(taxType)
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

    // Step-level validation
    const validateStep = (step: WizardStep): boolean => {
        const errors: Record<string, string> = {}
        const zeroLike = isZeroLike(form.taxType)

        switch (step) {
            case 'identity':
                if (!form.companyId) errors.companyId = 'Select a company.'
                if (!form.code.trim()) errors.code = 'Enter a tax code.'
                if (!form.name.trim()) errors.name = 'Enter a tax code name.'
                if (!form.taxCategory || !form.taxType) {
                    errors.taxType = 'Select a tax category and tax type.'
                }
                break
            case 'configuration':
                if (!form.roundingMethod) {
                    errors.roundingMethod = 'Select a rounding method.'
                }
                if (!form.roundingLevel) {
                    errors.roundingLevel = 'Select a rounding level.'
                }
                break
            case 'rate':
                if (!zeroLike && form.initialRate.trim()) {
                    const initial = Number(form.initialRate)
                    if (!Number.isFinite(initial) || initial < 0) {
                        errors.initialRate = 'Enter a valid non-negative rate.'
                    }
                    if (
                        form.rateUnit === 'PERCENTAGE' &&
                        initial > 100
                    ) {
                        errors.initialRate =
                            'A percentage rate cannot exceed 100%.'
                    }
                    if (zeroLike && initial !== 0) {
                        errors.initialRate =
                            'Zero-rated, exempt and non-taxable tax codes must use a 0% rate.'
                    }
                }
                if (
                    form.effectiveTo &&
                    form.effectiveFrom &&
                    form.effectiveTo < form.effectiveFrom
                ) {
                    errors.effectiveTo =
                        'Effective-to date must be on or after effective-from date.'
                }
                break
            case 'glMappings':
                if (!form.isRecoverable && !form.nonRecoverableTaxGlAccountId) {
                    errors.nonRecoverableTaxGlAccountId =
                        'Non-recoverable tax expense account is required.'
                }
                break
        }

        setFieldErrors(errors)
        return Object.keys(errors).length === 0
    }

    const canGoNext = () => validateStep(currentStep)

    const goNext = () => {
        if (canGoNext() && !isLastStep) {
            setCurrentStep(STEP_ORDER[stepIndex + 1])
        }
    }

    const goBack = () => {
        if (!isFirstStep) {
            setCurrentStep(STEP_ORDER[stepIndex - 1])
        }
    }

    const save = async () => {
        setFormError(null)
        if (!canGoNext()) return

        const precision = Number.parseInt(form.decimalPrecision, 10)
        const priority = Number.parseInt(form.calculationPriority, 10)

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
                rateDescription: form.rateDescription.trim() || null,
                status: form.status,
                remarks: form.remarks.trim() || null,
            })
            notifySuccess(
                form.status === 'ACTIVE'
                    ? 'Tax code created and activated.'
                    : 'Tax code created as a draft.',
            )
            setSaving(false)
            onClose()
            onSuccess()
            router.push(taxCodeHref(created.id))
        } catch (error) {
            const data = (
                error as {
                    response?: {
                        data?: {
                            message?: string
                            errors?: Array<{
                                field?: string
                                message?: string
                            }>
                        }
                    }
                }
            )?.response?.data
            const fieldErrorList = data?.errors ?? []
            setFieldErrors({})
            fieldErrorList.forEach((entry) => {
                if (entry.field && entry.message) {
                    setFieldErrors((previous) => ({
                        ...previous,
                        [entry.field]: entry.message,
                    }))
                }
            })
            setFormError(
                fieldErrorList.length > 0
                    ? 'Fix the highlighted fields below.'
                    : describeError(
                          error,
                          'Unable to save the tax code.',
                      ),
            )
        } finally {
            setSaving(false)
        }
    }

    const companyOptions = companies.map((company) => ({
        value: company.id,
        label: `${company.code} — ${company.name}`,
    }))

    const stepper = (
        <div className="flex items-center gap-2 mb-6 px-2">
            {STEP_ORDER.map((step, index) => {
                const isActive = index === stepIndex
                const isCompleted = index < stepIndex
                return (
                    <div
                        key={step}
                        className="flex items-center gap-1"
                    >
                        {index > 0 && (
                            <div className="w-4 h-0.5">
                                {isCompleted ? (
                                    <div className="h-0.5 bg-green-600 dark:bg-green-500" />
                                ) : (
                                    <div className="h-0.5 bg-gray-200 dark:bg-gray-700" />
                                )}
                            </div>
                        )}
                        <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                                isActive
                                    ? 'bg-blue-600 text-white dark:bg-blue-500'
                                    : isCompleted
                                      ? 'bg-green-600 text-white dark:bg-green-500'
                                      : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                            }`}
                        >
                            {index + 1}
                        </div>
                    </div>
                )
            })}
        </div>
    )

    if (!isOpen) return null

    return (
        <Dialog
            isOpen={isOpen}
            onOpenAutoFocus={undefined}
            width={1000}
            onClose={onClose}
        >
            <div className="p-6">
                <div className="mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Create Tax Code
                    </h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Configure tax classification, calculation, rates, and G/L
                        mappings step by step.
                    </p>
                </div>

                {stepper}

                {formError ? (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                        {formError}
                    </div>
                ) : null}

                <div className="space-y-6">
                    {/* Step 1: Identity */}
                    {currentStep === 'identity' && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <FormItem label="Company" asterisk>
                                <Select
                                    value={optionOf(
                                        form.companyId,
                                        companyOptions,
                                    )}
                                    options={companyOptions}
                                    isClearable={false}
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
                            <FormItem label="Tax category" asterisk>
                                <Select
                                    value={optionOf(
                                        form.taxCategory,
                                        TAX_CATEGORY_OPTIONS,
                                    )}
                                    options={TAX_CATEGORY_OPTIONS}
                                    isClearable={false}
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
                                    onChange={(option) =>
                                        changeTaxType(
                                            (option as { value: string } | null)
                                                ?.value ?? '',
                                        )
                                    }
                                />
                                <FieldError fieldErrors={fieldErrors} field="taxType" />
                            </FormItem>
                            <FormItem label="Status">
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
                                    placeholder="Purpose and usage notes"
                                    onChange={(event) =>
                                        setField(
                                            'description',
                                            event.target.value,
                                        )
                                    }
                                />
                            </FormItem>
                        </div>
                    )}

                    {/* Step 2: Configuration */}
                    {currentStep === 'configuration' && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <FormItem label="Calculation method">
                                <Select
                                    value={optionOf(
                                        form.calculationMethod,
                                        CALCULATION_METHOD_OPTIONS,
                                    )}
                                    options={CALCULATION_METHOD_OPTIONS}
                                    isClearable={false}
                                    onChange={(option) =>
                                        setField(
                                            'calculationMethod',
                                            (option as { value: string } | null)
                                                ?.value ?? 'TAX_EXCLUSIVE',
                                        )
                                    }
                                />
                                <FieldError fieldErrors={fieldErrors} field="calculationMethod" />
                            </FormItem>
                            <FormItem label="Rate unit">
                                <Select
                                    value={optionOf(
                                        form.rateUnit,
                                        RATE_UNIT_OPTIONS,
                                    )}
                                    options={RATE_UNIT_OPTIONS}
                                    isClearable={false}
                                    onChange={(option) =>
                                        setField(
                                            'rateUnit',
                                            (option as { value: string } | null)
                                                ?.value ?? 'PERCENTAGE',
                                        )
                                    }
                                />
                                <FieldError fieldErrors={fieldErrors} field="rateUnit" />
                            </FormItem>
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
                                <FieldError fieldErrors={fieldErrors} field="roundingMethod" />
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
                                <FieldError fieldErrors={fieldErrors} field="roundingLevel" />
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
                    )}

                    {/* Step 3: Applicability */}
                    {currentStep === 'applicability' && (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div
                                className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700/60"
                            >
                                <div>
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        Sales
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        Customer invoices and sales orders
                                    </p>
                                </div>
                                <Switcher
                                    checked={form.isSalesApplicable}
                                    onChange={(value) =>
                                        setField('isSalesApplicable', value)
                                    }
                                />
                            </div>
                            <div
                                className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700/60"
                            >
                                <div>
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        Purchases
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        Supplier invoices and purchase orders
                                    </p>
                                </div>
                                <Switcher
                                    checked={form.isPurchaseApplicable}
                                    onChange={(value) =>
                                        setField('isPurchaseApplicable', value)
                                    }
                                />
                            </div>
                            <div
                                className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700/60"
                            >
                                <div>
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        Services
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        Service invoices and credit notes
                                    </p>
                                </div>
                                <Switcher
                                    checked={form.isServiceApplicable}
                                    onChange={(value) =>
                                        setField('isServiceApplicable', value)
                                    }
                                />
                            </div>
                            <div
                                className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700/60"
                            >
                                <div>
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        Inventory
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        Inventory-related financial documents
                                    </p>
                                </div>
                                <Switcher
                                    checked={form.isInventoryApplicable}
                                    onChange={(value) =>
                                        setField('isInventoryApplicable', value)
                                    }
                                />
                            </div>
                            <FieldError fieldErrors={fieldErrors} field="isSalesApplicable" />
                        </div>
                    )}

                    {/* Step 4: Initial Rate */}
                    {currentStep === 'rate' && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <FormItem label="Rate">
                                <Input
                                    inputMode="decimal"
                                    value={form.initialRate}
                                    placeholder={
                                        isZeroLike(form.taxType)
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
                    )}

                    {/* Step 5: G/L Mappings */}
                    {currentStep === 'glMappings' && (
                        <div className="space-y-6">
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

                            {!chartOfAccountsId ? (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                                    No chart of accounts is assigned to this company.
                                    Assign one in Company Accounting Settings before
                                    mapping tax G/L accounts.
                                </div>
                            ) : null}

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
                        </div>
                    )}

                    {/* Step 6: Review */}
                    {currentStep === 'review' && (
                        <div className="space-y-6">
                            <div className="bg-gray-50 rounded-lg p-4 dark:bg-gray-800/50">
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                                    Review before creating
                                </h3>
                                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                    <div className="col-span-2">
                                        <dt className="text-xs font-medium text-gray-500">
                                            Tax Code
                                        </dt>
                                        <dd className="text-gray-900 dark:text-gray-100">
                                            {form.code}
                                        </dd>
                                    </div>
                                    <div className="col-span-2">
                                        <dt className="text-xs font-medium text-gray-500">
                                            Name
                                        </dt>
                                        <dd className="text-gray-900 dark:text-gray-100">
                                            {form.name}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs font-medium text-gray-500">
                                            Category
                                        </dt>
                                        <dd className="text-gray-900 dark:text-gray-100">
                                            {TAX_CATEGORY_LABELS[form.taxCategory] ??
                                                form.taxCategory}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs font-medium text-gray-500">
                                            Type
                                        </dt>
                                        <dd className="text-gray-900 dark:text-gray-100">
                                            {TAX_TYPE_LABELS[form.taxType] ??
                                                form.taxType}
                                        </dd>
                                    </div>
                                    <div className="col-span-2">
                                        <dt className="text-xs font-medium text-gray-500">
                                            Company
                                        </dt>
                                        <dd className="text-gray-900 dark:text-gray-100">
                                            {companyRow?.company.code ?? form.companyId}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs font-medium text-gray-500">
                                            Calculation
                                        </dt>
                                        <dd className="text-gray-900 dark:text-gray-100">
                                            {CALCULATION_METHOD_LABELS[form.calculationMethod] ??
                                                form.calculationMethod}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs font-medium text-gray-500">
                                            Rate Unit
                                        </dt>
                                        <dd className="text-gray-900 dark:text-gray-100">
                                            {RATE_UNIT_LABELS[form.rateUnit] ??
                                                form.rateUnit}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs font-medium text-gray-500">
                                            Initial Rate
                                        </dt>
                                        <dd className="text-gray-900 dark:text-gray-100 tabular-nums">
                                            {formatTaxRate(
                                                form.initialRate
                                                    ? Number(form.initialRate)
                                                    : null,
                                                form.rateUnit,
                                            ) || '—'}
                                        </dd>
                                    </div>
                                    <div className="col-span-2">
                                        <dt className="text-xs font-medium text-gray-500">
                                            Applicability
                                        </dt>
                                        <dd className="text-gray-900 dark:text-gray-100">
                                            {[
                                                form.isSalesApplicable && 'Sales',
                                                form.isPurchaseApplicable && 'Purchases',
                                                form.isServiceApplicable && 'Services',
                                                form.isInventoryApplicable && 'Inventory',
                                            ]
                                                .filter(Boolean)
                                                .join(', ') || '—'}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs font-medium text-gray-500">
                                            Recoverable
                                        </dt>
                                        <dd className="text-gray-900 dark:text-gray-100">
                                            {form.isRecoverable ? 'Yes' : 'No'}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs font-medium text-gray-500">
                                            Status
                                        </dt>
                                        <dd className="text-gray-900 dark:text-gray-100">
                                            {form.status}
                                        </dd>
                                    </div>
                                </dl>
                            </div>

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
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <Button
                        type="button"
                        variant="plain"
                        onClick={() => onClose()}
                        disabled={saving}
                    >
                        Cancel
                    </Button>
                    {!isFirstStep ? (
                        <Button
                            type="button"
                            variant="default"
                            onClick={goBack}
                            disabled={saving}
                        >
                            <HiOutlineX className="mr-1.5 h-4 w-4" /> Back
                        </Button>
                    ) : null}
                    {isLastStep ? (
                        <Button
                            type="button"
                            variant="solid"
                            onClick={save}
                            disabled={saving}
                            loading={saving}
                        >
                            {saving ? (
                                'Creating...'
                            ) : (
                                <>
                                    <HiOutlineCheck className="mr-1.5 h-4 w-4" />
                                    Create Tax Code
                                </>
                            )}
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            variant="solid"
                            onClick={goNext}
                            disabled={saving}
                            loading={saving}
                        >
                            {saving ? 'Next...' : 'Next'}
                        </Button>
                    )}
                </div>
            </div>
        </Dialog>
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
