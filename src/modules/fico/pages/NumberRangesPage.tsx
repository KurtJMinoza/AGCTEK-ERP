'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import FilterBar from '@/components/shared/FilterBar'
import FormDialog from '@/components/shared/FormDialog'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    HiOutlineCalendar,
    HiOutlineClipboardList,
    HiOutlineHashtag,
    HiOutlineLockClosed,
    HiOutlineLockOpen,
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineRefresh,
} from 'react-icons/hi'
import {
    notifyError,
    notifySuccess,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import { ficoNumberRangeService } from '../services/ficoService'
import type { FicoNumberRange } from '../types'
import FicoResponsiveTable, { type ColumnDef } from '../components/FicoResponsiveTable'
import {
    FicoCodeCell,
    FicoCountCell,
    FicoStatusCell,
    FicoTwoLineCell,
    ficoStatusTone,
} from '../components/ficoTableUi'

const ROUTE = '/modules/fico/number-ranges'

const NUMBER_RANGE_STATUS_TONES: Record<string, string> = {
    ACTIVE: 'success',
    INACTIVE: 'warning',
    EXHAUSTED: 'danger',
}

const NUMBERING_METHOD_TONES: Record<string, string> = {
    INTERNAL: 'default',
    EXTERNAL: 'primary',
}

const RESET_FREQUENCY_TONES: Record<string, string> = {
    NEVER: 'default',
    ANNUALLY: 'info',
    PER_FISCAL_YEAR: 'warning',
}

const NumberRangesPage = () => {
    const { companies, companyId, setCompanyId, loading: companyLoading } =
        useFicoCompanies()
    const [ranges, setRanges] = useState<FicoNumberRange[]>([])
    const [loading, setLoading] = useState(false)
    const [summary, setSummary] = useState<{
        total: number
        active: number
        inactive: number
        exhausted: number
        totalAssignments: number
    }>({
        total: 0,
        active: 0,
        inactive: 0,
        exhausted: 0,
        totalAssignments: 0,
    })
    const [search, setSearch] = useState('')
    const [status, setStatus] = useState('')
    const [documentCategory, setDocumentCategory] = useState('')
    const [numberingMethod, setNumberingMethod] = useState('')
    const [resetFrequency, setResetFrequency] = useState('')
    const [editing, setEditing] = useState<FicoNumberRange | null>(null)
    const [form, setForm] = useState({
        rangeCode: '',
        rangeName: '',
        description: '',
        documentCategory: '',
        numberingMethod: 'INTERNAL',
        prefix: '',
        suffix: '',
        startNumber: '1',
        endNumber: '999999',
        currentNumber: '1',
        paddingLength: '6',
        resetFrequency: 'NEVER',
        allowManualAssignment: true,
        allowExternalAssignment: false,
        allowGaps: false,
        status: 'ACTIVE',
        remarks: '',
    })
    const [deleting, setDeleting] = useState<FicoNumberRange | null>(null)
    const [saving, setSaving] = useState(false)

    const loadRanges = useCallback(() => {
        if (!companyId) return
        setLoading(true)
        ficoNumberRangeService
            .list({
                companyId,
                search: search || undefined,
                status: status || undefined,
                documentCategory: documentCategory || undefined,
                numberingMethod: numberingMethod || undefined,
                resetFrequency: resetFrequency || undefined,
            })
            .then(({ items, total }) => {
                const active = items.filter(
                    (r) => r.status === 'ACTIVE',
                ).length
                const inactive = items.filter(
                    (r) => r.status === 'INACTIVE',
                ).length
                const exhausted = items.filter(
                    (r) => r.status === 'EXHAUSTED',
                ).length
                setRanges(items)
                setSummary({
                    total,
                    active,
                    inactive,
                    exhausted,
                    totalAssignments: 0,
                })
            })
            .catch((error) =>
                notifyError(error, 'Unable to load number ranges.'),
            )
            .finally(() => setLoading(false))
    }, [
        companyId,
        search,
        status,
        documentCategory,
        numberingMethod,
        resetFrequency,
    ])

    useEffect(() => {
        loadRanges()
    }, [loadRanges])

    const columns = useMemo<ColumnDef<FicoNumberRange>[]>(
        () => [
            {
                header: 'Code',
                accessorKey: 'rangeCode',
                cell: ({ row }) => (
                    <FicoCodeCell
                        icon="account"
                        code={row.original.rangeCode}
                        name={row.original.rangeName}
                    />
                ),
            },
            {
                header: 'Company',
                accessorKey: 'company.name',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                        {row.original.company?.name ?? row.original.companyId}
                    </span>
                ),
            },
            {
                header: 'Document Category',
                accessorKey: 'documentCategory',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-900 dark:text-gray-100 truncate max-w-[160px]">
                        {row.original.documentCategory}
                    </span>
                ),
            },
            {
                header: 'Number Format',
                id: 'format',
                cell: ({ row }) => (
                    <div className="flex items-center gap-1">
                        <span className="text-xs font-mono text-primary">
                            {row.original.prefix}
                        </span>
                        <span className="text-xs font-mono text-gray-500">
                            {String(1).padStart(row.original.paddingLength, '0')}
                        </span>
                        <span className="text-xs font-mono text-primary">
                            {row.original.suffix}
                        </span>
                    </div>
                ),
            },
            {
                header: 'Start',
                accessorKey: 'startNumber',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-900 dark:text-gray-100 tabular-nums">
                        {row.original.startNumber}
                    </span>
                ),
            },
            {
                header: 'Current',
                accessorKey: 'currentNumber',
                cell: ({ row }) => (
                    <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                        {row.original.currentNumber}
                    </span>
                ),
            },
            {
                header: 'End',
                accessorKey: 'endNumber',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-900 dark:text-gray-100 tabular-nums">
                        {row.original.endNumber}
                    </span>
                ),
            },
            {
                header: 'Reset Frequency',
                accessorKey: 'resetFrequency',
                cell: ({ row }) => (
                    <span className="text-xs text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                        {row.original.resetFrequency}
                    </span>
                ),
            },
            {
                header: 'Status',
                accessorKey: 'status',
                cell: ({ row }) => (
                    <FicoStatusCell
                        status={row.original.status}
                        map={NUMBER_RANGE_STATUS_TONES as Record<
                            string,
                            'success' | 'default' | 'warning' | 'danger' | 'info'
                        >}
                    />
                ),
            },
            {
                header: '',
                id: 'actions',
                size: 64,
                cell: ({ row }) => {
                    const record = row.original
                    return (
                        <div className="flex flex-wrap justify-end gap-1">
                            <Button
                                size="sm"
                                onClick={() => setEditing(record)}
                            >
                                {record.status === 'ACTIVE'
                                    ? 'Edit'
                                    : 'Configure'}
                            </Button>
                            {record.status !== 'ACTIVE' && (
                                <Button
                                    size="sm"
                                    variant="solid"
                                    onClick={() => {
                                        setEditing(record)
                                    }}
                                >
                                    Activate
                                </Button>
                            )}
                            {record.status === 'ACTIVE' && (
                                <Button
                                    size="sm"
                                    onClick={() => {
                                        setDeleting(record)
                                    }}
                                >
                                    Deactivate
                                </Button>
                            )}
                        </div>
                    )
                },
            },
        ],
        [],
    )

    const rangeMobile = useMemo(
        () => ({
            title: (row: FicoNumberRange) => row.rangeName,
            subtitle: (row: FicoNumberRange) => row.rangeCode,
            status: (row: FicoNumberRange) => ({
                text: row.status,
                tone:
                    NUMBER_RANGE_STATUS_TONES[row.status] as
                        | 'success'
                        | 'default'
                        | 'warning'
                        | 'danger'
                        | 'info',
            }),
            fields: [
                {
                    label: 'Company',
                    value: (row: FicoNumberRange) =>
                        row.company?.name ?? row.companyId,
                },
                {
                    label: 'Document Category',
                    value: (row: FicoNumberRange) => row.documentCategory,
                },
                {
                    label: 'Format',
                    value: (row: FicoNumberRange) =>
                        `${row.prefix}${String(row.startNumber).padStart(row.paddingLength, '0')}${row.suffix}`,
                },
                {
                    label: 'Status',
                    value: (row: FicoNumberRange) => row.status,
                },
            ],
        }),
        [],
    )

    const isCreating = !editing

    return (
        <PageContainer>
            <PageHeader
                title="Number Ranges"
                description="Configure and manage automatic financial document numbering across companies and fiscal years."
                breadcrumbs={buildErpBreadcrumbs(ROUTE)}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="solid"
                            onClick={() => setEditing(null)}
                            disabled={!companyId}
                        >
                            <HiOutlinePlus className="w-4 h-4 mr-1.5" />
                            Create Number Range
                        </Button>
                    </div>
                }
            />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                <StatCard
                    label="Total Number Ranges"
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
                    label="Inactive"
                    value={summary.inactive}
                    tone="warning"
                    loading={loading}
                />
                <StatCard
                    label="Exhausted"
                    value={summary.exhausted}
                    tone="danger"
                    loading={loading}
                />
                <StatCard
                    label="Total Assignments"
                    value={summary.totalAssignments}
                    tone="info"
                    loading={loading}
                />
            </div>

            <AdaptiveCard className="mb-6">
                <FilterBar
                    fields={[
                        {
                            key: 'search',
                            label: 'Search',
                            kind: 'text',
                            value: search,
                            placeholder: 'Code, name, or category',
                            onChange: setSearch,
                        },
                        {
                            key: 'documentCategory',
                            label: 'Document Category',
                            kind: 'text',
                            value: documentCategory,
                            placeholder: 'e.g. Journal Entry',
                            onChange: setDocumentCategory,
                        },
                        {
                            key: 'status',
                            label: 'Status',
                            kind: 'select',
                            value: status,
                            options: [
                                { value: '', label: 'All' },
                                { value: 'ACTIVE', label: 'Active' },
                                { value: 'INACTIVE', label: 'Inactive' },
                                { value: 'EXHAUSTED', label: 'Exhausted' },
                            ],
                            onChange: setStatus,
                        },
                        {
                            key: 'numberingMethod',
                            label: 'Numbering Method',
                            kind: 'select',
                            value: numberingMethod,
                            options: [
                                { value: '', label: 'All' },
                                { value: 'INTERNAL', label: 'Internal' },
                                { value: 'EXTERNAL', label: 'External' },
                            ],
                            onChange: setNumberingMethod,
                        },
                        {
                            key: 'resetFrequency',
                            label: 'Reset Frequency',
                            kind: 'select',
                            value: resetFrequency,
                            options: [
                                { value: '', label: 'All' },
                                { value: 'NEVER', label: 'Never' },
                                { value: 'ANNUALLY', label: 'Annually' },
                                { value: 'PER_FISCAL_YEAR', label: 'Per Fiscal Year' },
                            ],
                            onChange: setResetFrequency,
                        },
                    ]}
                    chips={[
                        ...(search
                            ? [
                                  {
                                      key: 'search',
                                      label: `Search: ${search}`,
                                      onRemove: () => setSearch(''),
                                  },
                              ]
                            : []),
                        ...(documentCategory
                            ? [
                                  {
                                      key: 'documentCategory',
                                      label: `Category: ${documentCategory}`,
                                      onRemove: () => setDocumentCategory(''),
                                  },
                              ]
                            : []),
                        ...(status
                            ? [
                                  {
                                      key: 'status',
                                      label: `Status: ${status}`,
                                      onRemove: () => setStatus(''),
                                  },
                              ]
                            : []),
                    ]}
                    onClear={() => {
                        setSearch('')
                        setStatus('')
                        setDocumentCategory('')
                        setNumberingMethod('')
                        setResetFrequency('')
                    }}
                    actions={
                        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                            <Button
                                onClick={loadRanges}
                                loading={loading}
                                variant="solid"
                                className="w-full sm:w-auto"
                            >
                                <HiOutlineRefresh className="w-4 h-4 mr-1.5" />
                                Apply filters
                            </Button>
                            <Button
                                variant="default"
                                onClick={() => {
                                    setSearch('')
                                    setStatus('')
                                    setDocumentCategory('')
                                    setNumberingMethod('')
                                    setResetFrequency('')
                                    loadRanges()
                                }}
                                className="w-full sm:w-auto"
                            >
                                Reset filters
                            </Button>
                        </div>
                    }
                />
                <FicoResponsiveTable<FicoNumberRange>
                    columns={columns}
                    data={ranges}
                    compact
                    loading={loading}
                    noData={!loading && !ranges.length}
                    getRowId={(row) => row.id}
                    rowClassName={(row) =>
                        row.status === 'EXHAUSTED'
                            ? 'bg-red-50/40 dark:bg-red-950/10'
                            : row.status === 'INACTIVE'
                              ? 'bg-gray-50/40 dark:bg-gray-900/20'
                              : undefined
                    }
                    tableMinWidthClass="min-w-[950px]"
                    hidePagination
                    mobile={rangeMobile}
                    instanceId="fico-number-ranges"
                />
            </AdaptiveCard>

            <FormDialog
                isOpen={Boolean(editing)}
                onClose={() => setEditing(null)}
                title={
                    editing
                        ? `Edit Number Range — ${editing.rangeCode}`
                        : 'Create Number Range'
                }
                description={
                    'Define a document number range. Internal ranges are managed by the system; external ranges allow users to provide their own numbers.'
                }
                size="lg"
                onSubmit={async () => {
                    if (!editing) return
                    setSaving(true)
                    try {
                        if (editing.id) {
                            await ficoNumberRangeService.update(editing.id, {
                                rangeName: form.rangeName,
                                description: form.description || null,
                                documentCategory: form.documentCategory,
                                numberingMethod: form.numberingMethod,
                                prefix: form.prefix,
                                suffix: form.suffix,
                                startNumber: Number(form.startNumber),
                                endNumber: Number(form.endNumber),
                                currentNumber: Number(form.currentNumber),
                                paddingLength: Number(form.paddingLength),
                                resetFrequency: form.resetFrequency,
                                allowManualAssignment:
                                    form.allowManualAssignment,
                                allowExternalAssignment:
                                    form.allowExternalAssignment,
                                allowGaps: form.allowGaps,
                                status: form.status,
                                remarks: form.remarks || null,
                            })
                            notifySuccess(
                                'Number range updated successfully.',
                            )
                        } else {
                            await ficoNumberRangeService.create({
                                companyId: companyId || '',
                                rangeCode: form.rangeCode,
                                rangeName: form.rangeName,
                                description: form.description || null,
                                documentCategory: form.documentCategory,
                                numberingMethod: form.numberingMethod,
                                prefix: form.prefix,
                                suffix: form.suffix,
                                startNumber: Number(form.startNumber),
                                endNumber: Number(form.endNumber),
                                currentNumber: Number(form.currentNumber),
                                paddingLength: Number(form.paddingLength),
                                resetFrequency: form.resetFrequency,
                                allowManualAssignment:
                                    form.allowManualAssignment,
                                allowExternalAssignment:
                                    form.allowExternalAssignment,
                                allowGaps: form.allowGaps,
                                status: form.status,
                                remarks: form.remarks || null,
                            })
                            notifySuccess(
                                'Number range created successfully.',
                            )
                        }
                        setEditing(null)
                        setSaving(false)
                        loadRanges()
                        loadSummary()
                    } catch (error) {
                        setSaving(false)
                        notifyError(
                            error,
                            'Unable to save number range.',
                        )
                    }
                }}
                confirmText={editing ? 'Update' : 'Create'}
                confirmLoading={saving}
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem
                        label="Number Range Code"
                        errorMessage={
                            !form.rangeCode
                                ? 'Code is required.'
                                : undefined
                        }
                        invalid={!form.rangeCode}
                    >
                        <Input
                            placeholder="e.g. JE"
                            value={form.rangeCode}
                            onChange={(e) =>
                                setForm((c) => ({
                                    ...c,
                                    rangeCode: e.target.value.toUpperCase(),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Number Range Name">
                        <Input
                            placeholder="e.g. Journal Entry Numbers"
                            value={form.rangeName}
                            onChange={(e) =>
                                setForm((c) => ({
                                    ...c,
                                    rangeName: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Description">
                        <Input
                            placeholder="Optional description"
                            value={form.description}
                            onChange={(e) =>
                                setForm((c) => ({
                                    ...c,
                                    description: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Document Category">
                        <Input
                            placeholder="e.g. Journal Entry"
                            value={form.documentCategory}
                            onChange={(e) =>
                                setForm((c) => ({
                                    ...c,
                                    documentCategory: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Numbering Method">
                        <Select
                            options={[
                                { value: 'INTERNAL', label: 'Internal' },
                                { value: 'EXTERNAL', label: 'External' },
                            ]}
                            value={{
                                value: form.numberingMethod,
                                label: form.numberingMethod,
                            }}
                            onChange={(option) =>
                                setForm((c) => ({
                                    ...c,
                                    numberingMethod:
                                        (option as { value: string })?.value ??
                                        'INTERNAL',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Prefix">
                        <Input
                            placeholder="e.g. JE-"
                            value={form.prefix}
                            onChange={(e) =>
                                setForm((c) => ({
                                    ...c,
                                    prefix: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Suffix">
                        <Input
                            placeholder="Optional suffix"
                            value={form.suffix}
                            onChange={(e) =>
                                setForm((c) => ({
                                    ...c,
                                    suffix: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Starting Number">
                        <Input
                            type="number"
                            min={1}
                            value={form.startNumber}
                            onChange={(e) =>
                                setForm((c) => ({
                                    ...c,
                                    startNumber: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Ending Number">
                        <Input
                            type="number"
                            min={1}
                            value={form.endNumber}
                            onChange={(e) =>
                                setForm((c) => ({
                                    ...c,
                                    endNumber: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Current Number">
                        <Input
                            type="number"
                            min={1}
                            value={form.currentNumber}
                            onChange={(e) =>
                                setForm((c) => ({
                                    ...c,
                                    currentNumber: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Padding Length">
                        <Input
                            type="number"
                            min={1}
                            max={20}
                            value={form.paddingLength}
                            onChange={(e) =>
                                setForm((c) => ({
                                    ...c,
                                    paddingLength: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Reset Frequency">
                        <Select
                            options={[
                                { value: 'NEVER', label: 'Never' },
                                { value: 'ANNUALLY', label: 'Annually' },
                                { value: 'PER_FISCAL_YEAR', label: 'Per Fiscal Year' },
                            ]}
                            value={{
                                value: form.resetFrequency,
                                label: form.resetFrequency,
                            }}
                            onChange={(option) =>
                                setForm((c) => ({
                                    ...c,
                                    resetFrequency:
                                        (option as { value: string })?.value ??
                                        'NEVER',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Status">
                        <Select
                            options={[
                                { value: 'ACTIVE', label: 'Active' },
                                { value: 'INACTIVE', label: 'Inactive' },
                            ]}
                            value={{
                                value: form.status,
                                label: form.status,
                            }}
                            onChange={(option) =>
                                setForm((c) => ({
                                    ...c,
                                    status:
                                        (option as { value: string })?.value ??
                                        'ACTIVE',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem
                        label="Allow Manual Assignment"
                        className="sm:col-span-2"
                    >
                        <Switcher
                            checked={form.allowManualAssignment}
                            onChange={(checked) =>
                                setForm((c) => ({
                                    ...c,
                                    allowManualAssignment: checked,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem
                        label="Allow External Assignment"
                        className="sm:col-span-2"
                    >
                        <Switcher
                            checked={form.allowExternalAssignment}
                            onChange={(checked) =>
                                setForm((c) => ({
                                    ...c,
                                    allowExternalAssignment: checked,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem
                        label="Allow Number Gaps"
                        className="sm:col-span-2"
                    >
                        <Switcher
                            checked={form.allowGaps}
                            onChange={(checked) =>
                                setForm((c) => ({
                                    ...c,
                                    allowGaps: checked,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Remarks" className="sm:col-span-2">
                        <Input
                            textArea
                            rows={3}
                            value={form.remarks}
                            placeholder="Optional remarks"
                            onChange={(e) =>
                                setForm((c) => ({
                                    ...c,
                                    remarks: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                </div>
            </FormDialog>

            <ConfirmDialog
                isOpen={Boolean(deleting)}
                type="warning"
                title="Deactivate Number Range?"
                confirmText="Deactivate"
                onRequestClose={() => setDeleting(null)}
                onCancel={() => setDeleting(null)}
                onConfirm={async () => {
                    if (!deleting) return
                    try {
                        await ficoNumberRangeService.deactivate(
                            deleting.companyId,
                            deleting.rangeCode,
                        )
                        notifySuccess('Number range deactivated.')
                        setDeleting(null)
                        loadRanges()
                        loadSummary()
                    } catch (error) {
                        notifyError(
                            error,
                            'Unable to deactivate number range.',
                        )
                    }
                }}
            >
                <p>
                    Deactivate the number range for{' '}
                    <span className="font-semibold">
                        {deleting?.rangeCode}
                    </span>
                    ? No new numbers will be issued until reactivated.
                </p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default NumberRangesPage
