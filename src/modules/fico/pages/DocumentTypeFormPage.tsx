'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import Tabs from '@/components/ui/Tabs'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    HiOutlineCog,
    HiOutlineDocumentText,
    HiOutlineHashtag,
    HiOutlineInformationCircle,
    HiOutlineRefresh,
    HiOutlineSave,
    HiOutlineX,
} from 'react-icons/hi'
import {
    notifyError,
    notifySuccess,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import {
    ficoDocumentTypeService,
    ficoNumberRangeService,
} from '../services/ficoService'
import type {
    FicoDocumentType,
    FicoDocumentTypeReferenceData,
    FicoNumberRange,
} from '../types'
import {
    DOCUMENT_ACCOUNT_TYPE_OPTIONS,
    DOCUMENT_CATEGORY_OPTIONS,
    DOCUMENT_NUMBER_ASSIGNMENT_OPTIONS,
    DOCUMENT_STATUS_OPTIONS,
    DOCUMENT_STATUS_TONES,
    DOCUMENT_TYPE_ROUTE,
    documentCategoryLabel,
    documentTypeHref,
} from '../components/documentTypeUi'
import { FicoStatusCell } from '../components/ficoTableUi'

type DocumentTypeFormState = {
    companyId: string
    code: string
    name: string
    description: string
    documentCategory: string
    numberRangeId: string
    numberAssignment: string
    externalNumberAllowed: boolean
    numberRangeRequired: boolean
    allowedAccountTypes: string[]
    debitPostingAllowed: boolean
    creditPostingAllowed: boolean
    negativePostingAllowed: boolean
    reversalAllowed: boolean
    reversalDocumentTypeId: string
    originalDocumentReferenceRequired: boolean
    reversalReasonRequired: boolean
    referenceRequired: boolean
    headerTextRequired: boolean
    lineTextRequired: boolean
    status: string
    remarks: string
}

const EMPTY_FORM: DocumentTypeFormState = {
    companyId: '',
    code: '',
    name: '',
    description: '',
    documentCategory: 'GENERAL_JOURNAL',
    numberRangeId: '',
    numberAssignment: 'INTERNAL',
    externalNumberAllowed: false,
    numberRangeRequired: true,
    allowedAccountTypes: ['GL_ACCOUNT'],
    debitPostingAllowed: true,
    creditPostingAllowed: true,
    negativePostingAllowed: false,
    reversalAllowed: true,
    reversalDocumentTypeId: '',
    originalDocumentReferenceRequired: false,
    reversalReasonRequired: false,
    referenceRequired: false,
    headerTextRequired: false,
    lineTextRequired: false,
    status: 'INACTIVE',
    remarks: '',
}

function optionOf(
    value: string,
    options: Array<{ value: string; label: string }>,
) {
    return options.find((option) => option.value === value) ?? null
}

function fromDocumentType(record: FicoDocumentType): DocumentTypeFormState {
    return {
        companyId: record.companyId,
        code: record.code,
        name: record.name,
        description: record.description ?? '',
        documentCategory: record.documentCategory,
        numberRangeId: record.numberRangeId ?? '',
        numberAssignment: record.numberAssignment,
        externalNumberAllowed: record.externalNumberAllowed,
        numberRangeRequired: record.numberRangeRequired,
        allowedAccountTypes: [...record.allowedAccountTypes],
        debitPostingAllowed: record.debitPostingAllowed,
        creditPostingAllowed: record.creditPostingAllowed,
        negativePostingAllowed: record.negativePostingAllowed,
        reversalAllowed: record.reversalAllowed,
        reversalDocumentTypeId: record.reversalDocumentTypeId ?? '',
        originalDocumentReferenceRequired:
            record.originalDocumentReferenceRequired,
        reversalReasonRequired: record.reversalReasonRequired,
        referenceRequired: record.referenceRequired,
        headerTextRequired: record.headerTextRequired,
        lineTextRequired: record.lineTextRequired,
        status: record.status,
        remarks: record.remarks ?? '',
    }
}

const DocumentTypeFormPage = () => {
    const params = useParams()
    const router = useRouter()
    const searchParams = useSearchParams()
    const idParam = params?.id
    const documentTypeId = Array.isArray(idParam) ? idParam[0] : idParam
    const isEdit = Boolean(documentTypeId)

    const {
        companies,
        companyId,
        loading: companyLoading,
    } = useFicoCompanies()

    const [form, setForm] = useState<DocumentTypeFormState>(EMPTY_FORM)
    const [loaded, setLoaded] = useState<FicoDocumentType | null>(null)
    const [referenceData, setReferenceData] =
        useState<FicoDocumentTypeReferenceData | null>(null)
    const [numberRanges, setNumberRanges] = useState<FicoNumberRange[]>([])
    const [reversalCandidates, setReversalCandidates] = useState<
        FicoDocumentType[]
    >([])
    const [loading, setLoading] = useState(isEdit)
    const [loadingRanges, setLoadingRanges] = useState(false)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
    const [initializedCompany, setInitializedCompany] = useState(false)
    const [activeTab, setActiveTab] = useState('general')

    const lockedByUsage = Boolean(loaded?.usage?.journalEntries)

    useEffect(() => {
        ficoDocumentTypeService
            .referenceData()
            .then(setReferenceData)
            .catch((error) =>
                notifyError(
                    error,
                    'Unable to load document type reference data.',
                ),
            )
    }, [])

    useEffect(() => {
        if (isEdit || initializedCompany || companyLoading) return
        const fromQuery = searchParams.get('companyId')
        const preferred =
            companies.find((company) => company.id === fromQuery)?.id ??
            companyId
        if (preferred) {
            setForm((previous) => ({ ...previous, companyId: preferred }))
        }
        setInitializedCompany(true)
    }, [
        isEdit,
        initializedCompany,
        companyLoading,
        companies,
        companyId,
        searchParams,
    ])

    useEffect(() => {
        if (!documentTypeId) return
        let active = true
        setLoading(true)
        ficoDocumentTypeService
            .get(documentTypeId)
            .then((record) => {
                if (!active) return
                setLoaded(record)
                setForm(fromDocumentType(record))
            })
            .catch((error) =>
                notifyError(error, 'Unable to load the document type.'),
            )
            .finally(() => {
                if (active) setLoading(false)
            })
        return () => {
            active = false
        }
    }, [documentTypeId])

    useEffect(() => {
        if (!form.companyId) {
            setNumberRanges([])
            setReversalCandidates([])
            return
        }
        let active = true
        setLoadingRanges(true)
        Promise.all([
            ficoNumberRangeService.list({
                companyId: form.companyId,
                status: 'ACTIVE',
                page: 1,
                pageSize: 500,
            }),
            ficoDocumentTypeService.list({
                companyId: form.companyId,
                page: 1,
                pageSize: 500,
                sortBy: 'code',
            }),
        ])
            .then(([ranges, documentTypes]) => {
                if (!active) return
                setNumberRanges(ranges.items)
                setReversalCandidates(
                    documentTypes.items.filter(
                        (item) => item.id !== documentTypeId,
                    ),
                )
            })
            .catch((error) =>
                notifyError(
                    error,
                    'Unable to load number ranges and reversal document types.',
                ),
            )
            .finally(() => {
                if (active) setLoadingRanges(false)
            })
        return () => {
            active = false
        }
    }, [form.companyId, documentTypeId])

    const setField = <Key extends keyof DocumentTypeFormState>(
        key: Key,
        value: DocumentTypeFormState[Key],
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

    const toggleAccountType = (value: string, checked: boolean) => {
        setForm((previous) => {
            const current = new Set(previous.allowedAccountTypes)
            if (checked) current.add(value)
            else current.delete(value)
            return { ...previous, allowedAccountTypes: [...current] }
        })
        if (fieldErrors.allowedAccountTypes) {
            setFieldErrors((previous) => {
                const next = { ...previous }
                delete next.allowedAccountTypes
                return next
            })
        }
    }

    const selectedRange = useMemo(
        () => numberRanges.find((range) => range.id === form.numberRangeId),
        [numberRanges, form.numberRangeId],
    )

    const categoryOptions = referenceData?.categories?.length
        ? referenceData.categories
        : DOCUMENT_CATEGORY_OPTIONS
    const accountTypeOptions = referenceData?.accountTypes?.length
        ? referenceData.accountTypes
        : DOCUMENT_ACCOUNT_TYPE_OPTIONS
    const assignmentOptions = referenceData?.numberAssignments?.length
        ? referenceData.numberAssignments
        : DOCUMENT_NUMBER_ASSIGNMENT_OPTIONS
    const statusOptions = referenceData?.statuses?.length
        ? referenceData.statuses
        : DOCUMENT_STATUS_OPTIONS

    const companyOptions = companies.map((company) => ({
        value: company.id,
        label: `${company.code} — ${company.name}`,
    }))
    const numberRangeOptions = numberRanges.map((range) => ({
        value: range.id,
        label: `${range.rangeCode} — ${range.rangeName} (${documentCategoryLabel(
            range.documentCategory,
        )})`,
    }))
    const reversalOptions = reversalCandidates.map((item) => ({
        value: item.id,
        label: `${item.code} — ${item.name}${
            item.status === 'ACTIVE' ? '' : ' (inactive)'
        }`,
    }))

    const validate = () => {
        const errors: Record<string, string> = {}
        if (!form.companyId) errors.companyId = 'Select a company.'
        if (!form.code.trim()) errors.code = 'Document type code is required.'
        else if (!/^[A-Za-z0-9_-]+$/.test(form.code.trim()))
            errors.code =
                'Use only letters, numbers, underscores, and hyphens.'
        if (!form.name.trim())
            errors.name = 'Document type name is required.'
        if (!form.documentCategory)
            errors.documentCategory = 'Select a document category.'
        if (form.numberRangeRequired && !form.numberRangeId)
            errors.numberRangeId = 'A number range is required.'
        if (!form.allowedAccountTypes.length)
            errors.allowedAccountTypes =
                'Select at least one allowed account type.'
        if (!form.debitPostingAllowed && !form.creditPostingAllowed)
            errors.postingControls =
                'Allow debit postings, credit postings, or both.'
        setFieldErrors(errors)
        if (Object.keys(errors).length) {
            setFormError(
                'Fix the highlighted fields before saving the document type.',
            )
            if (errors.allowedAccountTypes) setActiveTab('accounts')
            else if (errors.postingControls) setActiveTab('posting')
            else if (errors.numberRangeId) setActiveTab('numbering')
            else setActiveTab('general')
            return false
        }
        setFormError(null)
        return true
    }

    const save = async () => {
        if (!validate()) return
        setSaving(true)
        try {
            const shared = {
                name: form.name.trim(),
                description: form.description.trim() || null,
                documentCategory: form.documentCategory,
                numberRangeId: form.numberRangeId || null,
                numberAssignment: form.numberAssignment,
                externalNumberAllowed: form.externalNumberAllowed,
                numberRangeRequired: form.numberRangeRequired,
                allowedAccountTypes: form.allowedAccountTypes,
                debitPostingAllowed: form.debitPostingAllowed,
                creditPostingAllowed: form.creditPostingAllowed,
                negativePostingAllowed: form.negativePostingAllowed,
                reversalAllowed: form.reversalAllowed,
                reversalDocumentTypeId: form.reversalAllowed
                    ? form.reversalDocumentTypeId || null
                    : null,
                originalDocumentReferenceRequired: form.reversalAllowed
                    ? form.originalDocumentReferenceRequired
                    : false,
                reversalReasonRequired: form.reversalAllowed
                    ? form.reversalReasonRequired
                    : false,
                referenceRequired: form.referenceRequired,
                headerTextRequired: form.headerTextRequired,
                lineTextRequired: form.lineTextRequired,
                remarks: form.remarks.trim() || null,
            }

            if (isEdit && documentTypeId) {
                const updated = await ficoDocumentTypeService.update(
                    documentTypeId,
                    shared,
                )
                notifySuccess('Document type saved.')
                setLoaded(updated)
                setForm(fromDocumentType(updated))
            } else {
                const created = await ficoDocumentTypeService.create({
                    companyId: form.companyId,
                    code: form.code.trim().toUpperCase(),
                    status: form.status,
                    ...shared,
                })
                notifySuccess(
                    `Document type "${created.code}" created${
                        created.status === 'ACTIVE' ? ' and activated' : ''
                    }.`,
                )
                router.push(documentTypeHref(created.id))
            }
        } catch (error) {
            notifyError(error, 'Unable to save the document type.')
        } finally {
            setSaving(false)
        }
    }

    const cancel = () => {
        if (isEdit && documentTypeId) {
            router.push(documentTypeHref(documentTypeId))
        } else {
            router.push(DOCUMENT_TYPE_ROUTE)
        }
    }

    if (loading) {
        return (
            <PageContainer>
                <PageHeader
                    title={isEdit ? 'Edit Document Type' : 'Create Document Type'}
                    description="Loading document type configuration…"
                    breadcrumbs={buildErpBreadcrumbs(
                        isEdit && documentTypeId
                            ? documentTypeHref(documentTypeId)
                            : `${DOCUMENT_TYPE_ROUTE}/create`,
                    )}
                />
                <AdaptiveCard>
                    <p className="py-10 text-center text-sm text-gray-500">
                        Loading document type…
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
                        ? `Edit Document Type ${loaded?.code ?? ''}`
                        : 'Create Document Type'
                }
                description={
                    isEdit
                        ? loaded?.name ??
                          'Update the accounting document classification.'
                        : 'Define the accounting document classification, numbering, account types, posting controls, and reversal behavior.'
                }
                breadcrumbs={buildErpBreadcrumbs(
                    isEdit && documentTypeId
                        ? documentTypeHref(documentTypeId)
                        : `${DOCUMENT_TYPE_ROUTE}/create`,
                    {
                        detailLabel: isEdit
                            ? `Edit ${loaded?.code ?? ''}`.trim()
                            : 'Create Document Type',
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
                            {isEdit ? 'Save changes' : 'Create document type'}
                        </Button>
                    </div>
                }
            />

            {formError ? (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                    {formError}
                </div>
            ) : null}

            {lockedByUsage ? (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    <HiOutlineInformationCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                        Journal entries reference this document type. Category,
                        number range, number assignment, external numbering, and
                        reversal document type are locked to preserve historical
                        behavior. Safe descriptive and control changes remain
                        available.
                    </span>
                </div>
            ) : null}

            <Tabs
                value={activeTab}
                onChange={(value) => setActiveTab(String(value))}
                className="mb-6"
            >
                <Tabs.TabList>
                    <Tabs.TabNav value="general">General</Tabs.TabNav>
                    <Tabs.TabNav value="numbering">Numbering</Tabs.TabNav>
                    <Tabs.TabNav value="accounts">Account Types</Tabs.TabNav>
                    <Tabs.TabNav value="posting">Posting Controls</Tabs.TabNav>
                    <Tabs.TabNav value="reversal">Reversal</Tabs.TabNav>
                </Tabs.TabList>

                <Tabs.TabContent value="general">
                    <AdaptiveCard>
                        <SectionHeader
                            icon={<HiOutlineDocumentText />}
                            title="General information"
                            description="Company ownership, document identifier, classification, and status."
                        />
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <FormItem label="Company" asterisk>
                                <Select
                                    value={optionOf(
                                        form.companyId,
                                        companyOptions,
                                    )}
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
                                <FieldError
                                    fieldErrors={fieldErrors}
                                    field="companyId"
                                />
                            </FormItem>
                            <FormItem label="Document type code" asterisk>
                                <Input
                                    value={form.code}
                                    maxLength={16}
                                    disabled={isEdit}
                                    placeholder="e.g. SA"
                                    onChange={(event) =>
                                        setField(
                                            'code',
                                            event.target.value.toUpperCase(),
                                        )
                                    }
                                />
                                <FieldError
                                    fieldErrors={fieldErrors}
                                    field="code"
                                />
                            </FormItem>
                            <FormItem label="Document type name" asterisk>
                                <Input
                                    value={form.name}
                                    maxLength={160}
                                    placeholder="e.g. General Journal Entry"
                                    onChange={(event) =>
                                        setField('name', event.target.value)
                                    }
                                />
                                <FieldError
                                    fieldErrors={fieldErrors}
                                    field="name"
                                />
                            </FormItem>
                            <FormItem label="Document category" asterisk>
                                <Select
                                    value={optionOf(
                                        form.documentCategory,
                                        categoryOptions,
                                    )}
                                    options={categoryOptions}
                                    isClearable={false}
                                    isDisabled={lockedByUsage}
                                    onChange={(option) =>
                                        setField(
                                            'documentCategory',
                                            (option as { value: string } | null)
                                                ?.value ?? '',
                                        )
                                    }
                                />
                                <FieldError
                                    fieldErrors={fieldErrors}
                                    field="documentCategory"
                                />
                            </FormItem>
                            <FormItem label="Status">
                                {isEdit ? (
                                    <div className="flex h-10 items-center">
                                        <FicoStatusCell
                                            status={form.status}
                                            map={DOCUMENT_STATUS_TONES}
                                        />
                                    </div>
                                ) : (
                                    <Select
                                        value={optionOf(
                                            form.status,
                                            statusOptions,
                                        )}
                                        options={statusOptions}
                                        isClearable={false}
                                        onChange={(option) =>
                                            setField(
                                                'status',
                                                (option as { value: string } | null)
                                                    ?.value ?? 'INACTIVE',
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
                                    maxLength={2000}
                                    value={form.description}
                                    placeholder="Purpose of this document type"
                                    onChange={(event) =>
                                        setField(
                                            'description',
                                            event.target.value,
                                        )
                                    }
                                />
                            </FormItem>
                            <FormItem
                                label="Remarks"
                                className="sm:col-span-2 lg:col-span-3"
                            >
                                <Input
                                    textArea
                                    rows={2}
                                    maxLength={2000}
                                    value={form.remarks}
                                    placeholder="Internal configuration notes"
                                    onChange={(event) =>
                                        setField('remarks', event.target.value)
                                    }
                                />
                            </FormItem>
                        </div>
                    </AdaptiveCard>
                </Tabs.TabContent>

                <Tabs.TabContent value="numbering">
                    <AdaptiveCard>
                        <SectionHeader
                            icon={<HiOutlineHashtag />}
                            title="Numbering configuration"
                            description="Assign an existing active number range. Document numbers are never allocated while saving this configuration."
                        />
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <FormItem label="Number range" asterisk={form.numberRangeRequired}>
                                <Select
                                    value={optionOf(
                                        form.numberRangeId,
                                        numberRangeOptions,
                                    )}
                                    options={numberRangeOptions}
                                    isClearable
                                    isDisabled={lockedByUsage}
                                    isLoading={loadingRanges}
                                    placeholder={
                                        loadingRanges
                                            ? 'Loading number ranges…'
                                            : 'Select an active number range'
                                    }
                                    onChange={(option) =>
                                        setField(
                                            'numberRangeId',
                                            (option as { value: string } | null)
                                                ?.value ?? '',
                                        )
                                    }
                                />
                                <FieldError
                                    fieldErrors={fieldErrors}
                                    field="numberRangeId"
                                />
                            </FormItem>
                            <FormItem label="Number assignment">
                                <Select
                                    value={optionOf(
                                        form.numberAssignment,
                                        assignmentOptions,
                                    )}
                                    options={assignmentOptions}
                                    isClearable={false}
                                    isDisabled={lockedByUsage}
                                    onChange={(option) =>
                                        setField(
                                            'numberAssignment',
                                            (option as { value: string } | null)
                                                ?.value ?? 'INTERNAL',
                                        )
                                    }
                                />
                            </FormItem>
                            <div className="space-y-4">
                                <ToggleRow
                                    title="Number range required"
                                    description="Require a compatible number range for this document type."
                                    checked={form.numberRangeRequired}
                                    disabled={lockedByUsage}
                                    onChange={(checked) =>
                                        setField(
                                            'numberRangeRequired',
                                            checked,
                                        )
                                    }
                                />
                                <ToggleRow
                                    title="External number allowed"
                                    description="Permit externally supplied document numbers when the number range supports them."
                                    checked={form.externalNumberAllowed}
                                    disabled={lockedByUsage}
                                    onChange={(checked) =>
                                        setField(
                                            'externalNumberAllowed',
                                            checked,
                                        )
                                    }
                                />
                            </div>
                        </div>

                        {selectedRange ? (
                            <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-gray-800/40">
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                    {selectedRange.rangeCode} —{' '}
                                    {selectedRange.rangeName}
                                </p>
                                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                                    <div>
                                        <dt className="text-xs uppercase tracking-wide text-gray-500">
                                            Range category
                                        </dt>
                                        <dd className="mt-0.5 text-gray-900 dark:text-gray-100">
                                            {documentCategoryLabel(
                                                selectedRange.documentCategory,
                                            )}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs uppercase tracking-wide text-gray-500">
                                            Numbering
                                        </dt>
                                        <dd className="mt-0.5 text-gray-900 dark:text-gray-100">
                                            {selectedRange.numberingMethod}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs uppercase tracking-wide text-gray-500">
                                            External assignment
                                        </dt>
                                        <dd className="mt-0.5 text-gray-900 dark:text-gray-100">
                                            {selectedRange.allowExternalAssignment
                                                ? 'Allowed'
                                                : 'Not allowed'}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs uppercase tracking-wide text-gray-500">
                                            Validity
                                        </dt>
                                        <dd className="mt-0.5 text-gray-900 dark:text-gray-100">
                                            {selectedRange.validFrom?.slice(
                                                0,
                                                10,
                                            ) ?? 'Open'}{' '}
                                            →{' '}
                                            {selectedRange.validTo?.slice(
                                                0,
                                                10,
                                            ) ?? 'Open'}
                                        </dd>
                                    </div>
                                </dl>
                                {!selectedRange.allowExternalAssignment &&
                                (form.externalNumberAllowed ||
                                    form.numberAssignment === 'EXTERNAL') ? (
                                    <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
                                        This range does not allow external
                                        numbering. Choose another range or switch
                                        to internal assignment.
                                    </p>
                                ) : null}
                                {form.numberAssignment === 'EXTERNAL' &&
                                form.externalNumberAllowed === false ? (
                                    <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                                        External assignment is selected but
                                        external numbers are not allowed.
                                    </p>
                                ) : null}
                            </div>
                        ) : (
                            <p className="mt-4 text-sm text-gray-500">
                                {loadingRanges
                                    ? 'Loading number ranges…'
                                    : 'No active number range is selected. The backend validates category compatibility and range validity.'}
                            </p>
                        )}
                    </AdaptiveCard>
                </Tabs.TabContent>

                <Tabs.TabContent value="accounts">
                    <AdaptiveCard>
                        <SectionHeader
                            icon={<HiOutlineCog />}
                            title="Account type configuration"
                            description="Select the account classifications this document type may reference. These are classifications, not new account master data."
                        />
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {accountTypeOptions.map((option) => (
                                <label
                                    key={option.value}
                                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 px-3 py-3 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/40"
                                >
                                    <Checkbox
                                        checked={form.allowedAccountTypes.includes(
                                            option.value,
                                        )}
                                        onChange={(checked) =>
                                            toggleAccountType(
                                                option.value,
                                                checked,
                                            )
                                        }
                                    >
                                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                            {option.label}
                                        </span>
                                    </Checkbox>
                                </label>
                            ))}
                        </div>
                        <FieldError
                            fieldErrors={fieldErrors}
                            field="allowedAccountTypes"
                        />
                    </AdaptiveCard>
                </Tabs.TabContent>

                <Tabs.TabContent value="posting">
                    <AdaptiveCard>
                        <SectionHeader
                            icon={<HiOutlineCog />}
                            title="Posting controls"
                            description="Basic document controls enforced by future journal entry and automatic posting services."
                        />
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <ToggleRow
                                title="Debit posting allowed"
                                description="Permit debit lines on accounting documents."
                                checked={form.debitPostingAllowed}
                                onChange={(checked) =>
                                    setField('debitPostingAllowed', checked)
                                }
                            />
                            <ToggleRow
                                title="Credit posting allowed"
                                description="Permit credit lines on accounting documents."
                                checked={form.creditPostingAllowed}
                                onChange={(checked) =>
                                    setField('creditPostingAllowed', checked)
                                }
                            />
                            <ToggleRow
                                title="Negative posting allowed"
                                description="Permit negative amounts on posting lines."
                                checked={form.negativePostingAllowed}
                                onChange={(checked) =>
                                    setField('negativePostingAllowed', checked)
                                }
                            />
                            <ToggleRow
                                title="Reference required"
                                description="Require an external reference on documents."
                                checked={form.referenceRequired}
                                onChange={(checked) =>
                                    setField('referenceRequired', checked)
                                }
                            />
                            <ToggleRow
                                title="Header text required"
                                description="Require a document description."
                                checked={form.headerTextRequired}
                                onChange={(checked) =>
                                    setField('headerTextRequired', checked)
                                }
                            />
                            <ToggleRow
                                title="Line text required"
                                description="Require a description on every posting line."
                                checked={form.lineTextRequired}
                                onChange={(checked) =>
                                    setField('lineTextRequired', checked)
                                }
                            />
                        </div>
                        <FieldError
                            fieldErrors={fieldErrors}
                            field="postingControls"
                        />
                    </AdaptiveCard>
                </Tabs.TabContent>

                <Tabs.TabContent value="reversal">
                    <AdaptiveCard>
                        <SectionHeader
                            icon={<HiOutlineRefresh />}
                            title="Reversal configuration"
                            description="Configuration only. Reversal processing is not implemented by this module."
                        />
                        <ToggleRow
                            title="Reversal allowed"
                            description="Permit future reversal documents for this document type."
                            checked={form.reversalAllowed}
                            onChange={(checked) => {
                                setField('reversalAllowed', checked)
                                if (!checked) {
                                    setField('reversalDocumentTypeId', '')
                                    setField(
                                        'originalDocumentReferenceRequired',
                                        false,
                                    )
                                    setField('reversalReasonRequired', false)
                                }
                            }}
                        />

                        {form.reversalAllowed ? (
                            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                                <FormItem label="Reversal document type">
                                    <Select
                                        value={optionOf(
                                            form.reversalDocumentTypeId,
                                            reversalOptions,
                                        )}
                                        options={reversalOptions}
                                        isClearable
                                        isDisabled={lockedByUsage}
                                        isLoading={loadingRanges}
                                        placeholder="Use the same or a dedicated reversal document type"
                                        onChange={(option) =>
                                            setField(
                                                'reversalDocumentTypeId',
                                                (
                                                    option as {
                                                        value: string
                                                    } | null
                                                )?.value ?? '',
                                            )
                                        }
                                    />
                                    <p className="mt-1 text-xs text-gray-500">
                                        Self-references and circular reversal
                                        chains are rejected by the backend.
                                    </p>
                                </FormItem>
                                <div className="space-y-4">
                                    <ToggleRow
                                        title="Original document reference required"
                                        description="Require the reversed document number on reversal documents."
                                        checked={
                                            form.originalDocumentReferenceRequired
                                        }
                                        onChange={(checked) =>
                                            setField(
                                                'originalDocumentReferenceRequired',
                                                checked,
                                            )
                                        }
                                    />
                                    <ToggleRow
                                        title="Reversal reason required"
                                        description="Require an audit reason when reversing."
                                        checked={form.reversalReasonRequired}
                                        onChange={(checked) =>
                                            setField(
                                                'reversalReasonRequired',
                                                checked,
                                            )
                                        }
                                    />
                                </div>
                            </div>
                        ) : (
                            <p className="mt-4 text-sm text-gray-500">
                                Reversal-specific settings are inactive while
                                reversal is disabled.
                            </p>
                        )}
                    </AdaptiveCard>
                </Tabs.TabContent>
            </Tabs>
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
        <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
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
    title,
    description,
    checked,
    disabled = false,
    onChange,
}: {
    title: string
    description: string
    checked: boolean
    disabled?: boolean
    onChange: (checked: boolean) => void
}) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5 dark:border-gray-700">
            <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {title}
                </p>
                <p className="text-xs text-gray-500">{description}</p>
            </div>
            <Switcher
                checked={checked}
                disabled={disabled}
                onChange={onChange}
            />
        </div>
    )
}

export default DocumentTypeFormPage
