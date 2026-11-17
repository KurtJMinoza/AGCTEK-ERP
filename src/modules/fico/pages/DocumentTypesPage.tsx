'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import FilterBar, { type FilterChip } from '@/components/shared/FilterBar'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Dropdown from '@/components/ui/Dropdown'
import EllipsisButton from '@/components/shared/EllipsisButton'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import type { OnSortParam } from '@/components/shared/DataTable'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import usePermissions from '@/utils/hooks/usePermissions'
import {
    HiOutlineLockClosed,
    HiOutlineLockOpen,
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineRefresh,
    HiOutlineViewList,
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
    FicoDocumentTypeSummary,
    FicoNumberRange,
} from '../types'
import FicoResponsiveTable, {
    type ColumnDef,
} from '../components/FicoResponsiveTable'
import {
    FicoCodeCell,
    FicoStatusCell,
    formatFicoDate,
} from '../components/ficoTableUi'
import {
    DOCUMENT_CATEGORY_FILTER_OPTIONS,
    DOCUMENT_REVERSAL_FILTER_OPTIONS,
    DOCUMENT_STATUS_FILTER_OPTIONS,
    DOCUMENT_STATUS_TONES,
    DOCUMENT_TYPE_ROUTE,
    documentAccountTypeLabels,
    documentCategoryLabel,
    documentNumberRangeLabel,
    documentTypeHref,
} from '../components/documentTypeUi'

const EMPTY_SUMMARY: FicoDocumentTypeSummary = {
    total: 0,
    active: 0,
    inactive: 0,
    categories: 0,
    reversalAllowed: 0,
    generatedAt: '',
}

const loadNumberRanges = async (companyId: string) => {
    const response = await ficoNumberRangeService.list({
        companyId,
        page: 1,
        pageSize: 500,
    })
    return response.items
}

const DocumentTypesPage = () => {
    const router = useRouter()
    const {
        companies,
        companyId,
        setCompanyId,
        loading: companyLoading,
    } = useFicoCompanies()
    const { can } = usePermissions()
    const canCreate = can('fico.document-types', 'create')
    const canUpdate = can('fico.document-types', 'update')

    const [documentTypes, setDocumentTypes] = useState<FicoDocumentType[]>([])
    const [summary, setSummary] =
        useState<FicoDocumentTypeSummary>(EMPTY_SUMMARY)
    const [referenceData, setReferenceData] =
        useState<FicoDocumentTypeReferenceData | null>(null)
    const [numberRanges, setNumberRanges] = useState<FicoNumberRange[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(25)
    const [sortBy, setSortBy] = useState('code')
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

    const [search, setSearch] = useState('')
    const [status, setStatus] = useState('')
    const [documentCategory, setDocumentCategory] = useState('')
    const [reversalAllowed, setReversalAllowed] = useState('')
    const [numberRangeId, setNumberRangeId] = useState('')

    const [actionTarget, setActionTarget] = useState<{
        action: 'ACTIVATE' | 'DEACTIVATE'
        record: FicoDocumentType
    } | null>(null)
    const [actionReason, setActionReason] = useState('')
    const [saving, setSaving] = useState(false)

    const resetPage = () => setPage(1)

    useEffect(() => {
        ficoDocumentTypeService
            .referenceData()
            .then(setReferenceData)
            .catch((loadError) =>
                notifyError(
                    loadError,
                    'Unable to load document type reference data.',
                ),
            )
    }, [])

    useEffect(() => {
        if (!companyId) {
            setNumberRanges([])
            return
        }
        let active = true
        loadNumberRanges(companyId)
            .then((ranges) => {
                if (active) setNumberRanges(ranges)
            })
            .catch((loadError) =>
                notifyError(loadError, 'Unable to load number ranges.'),
            )
        return () => {
            active = false
        }
    }, [companyId])

    const load = useCallback(() => {
        if (!companyId) {
            setDocumentTypes([])
            setTotal(0)
            setSummary(EMPTY_SUMMARY)
            return
        }
        setLoading(true)
        setError(null)
        Promise.all([
            ficoDocumentTypeService.list({
                companyId,
                search: search.trim() || undefined,
                status: status || undefined,
                documentCategory: documentCategory || undefined,
                reversalAllowed: reversalAllowed || undefined,
                numberRangeId: numberRangeId || undefined,
                sortBy,
                sortOrder,
                page,
                pageSize,
            }),
            ficoDocumentTypeService.summary(companyId),
        ])
            .then(([list, summaryResult]) => {
                setDocumentTypes(list.items)
                setTotal(list.total)
                setSummary(summaryResult)
            })
            .catch((loadError) => {
                setError(
                    (loadError as { message?: string })?.message ??
                        'Unable to load document types.',
                )
                notifyError(loadError, 'Unable to load document types.')
            })
            .finally(() => setLoading(false))
    }, [
        companyId,
        search,
        status,
        documentCategory,
        reversalAllowed,
        numberRangeId,
        sortBy,
        sortOrder,
        page,
        pageSize,
    ])

    useEffect(() => {
        load()
    }, [load])

    const submitAction = async () => {
        if (!actionTarget) return
        setSaving(true)
        try {
            const payload = actionReason.trim()
                ? { reason: actionReason.trim() }
                : {}
            if (actionTarget.action === 'ACTIVATE') {
                await ficoDocumentTypeService.activate(
                    actionTarget.record.id,
                    payload,
                )
                notifySuccess('Document type activated.')
            } else {
                await ficoDocumentTypeService.deactivate(
                    actionTarget.record.id,
                    payload,
                )
                notifySuccess('Document type deactivated.')
            }
            setActionTarget(null)
            setActionReason('')
            load()
        } catch (actionError) {
            notifyError(
                actionError,
                actionTarget.action === 'ACTIVATE'
                    ? 'Unable to activate the document type.'
                    : 'Unable to deactivate the document type.',
            )
        } finally {
            setSaving(false)
        }
    }

    const handleSort = (sort: OnSortParam) => {
        if (!sort.key) return
        setSortBy(String(sort.key))
        setSortOrder(sort.order === 'desc' ? 'desc' : 'asc')
        setPage(1)
    }

    const columns = useMemo<ColumnDef<FicoDocumentType>[]>(
        () => [
            {
                header: 'Document Type',
                accessorKey: 'code',
                cell: ({ row }) => (
                    <FicoCodeCell
                        icon="posting"
                        code={row.original.code}
                        name={row.original.name}
                        onClick={() =>
                            router.push(documentTypeHref(row.original.id))
                        }
                    />
                ),
            },
            {
                header: 'Description',
                accessorKey: 'name',
                cell: ({ row }) => (
                    <span className="line-clamp-2 max-w-[15rem] text-sm text-gray-700 dark:text-gray-300">
                        {row.original.description || row.original.name}
                    </span>
                ),
            },
            {
                header: 'Company',
                accessorKey: 'company.code',
                cell: ({ row }) => (
                    <span
                        className="text-sm text-gray-900 dark:text-gray-100"
                        title={
                            row.original.company
                                ? `${row.original.company.code} — ${row.original.company.name}`
                                : undefined
                        }
                    >
                        {row.original.company?.code ?? '—'}
                    </span>
                ),
            },
            {
                header: 'Category',
                accessorKey: 'documentCategory',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                        {documentCategoryLabel(row.original.documentCategory)}
                    </span>
                ),
            },
            {
                header: 'Number Range',
                accessorKey: 'numberRange.rangeCode',
                cell: ({ row }) => (
                    <span
                        className="text-sm text-gray-900 dark:text-gray-100"
                        title={documentNumberRangeLabel(
                            row.original.numberRange,
                        )}
                    >
                        {row.original.numberRange?.rangeCode ?? '—'}
                    </span>
                ),
            },
            {
                header: 'Account Types',
                accessorKey: 'allowedAccountTypes',
                enableSorting: false,
                cell: ({ row }) => (
                    <span
                        className="line-clamp-2 max-w-[13rem] text-sm text-gray-700 dark:text-gray-300"
                        title={documentAccountTypeLabels(
                            row.original.allowedAccountTypes,
                        )}
                    >
                        {documentAccountTypeLabels(
                            row.original.allowedAccountTypes,
                        )}
                    </span>
                ),
            },
            {
                header: 'Reversal',
                accessorKey: 'reversalAllowed',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                        {row.original.reversalAllowed ? 'Yes' : 'No'}
                    </span>
                ),
            },
            {
                header: 'Status',
                accessorKey: 'status',
                cell: ({ row }) => (
                    <FicoStatusCell
                        status={row.original.status}
                        map={DOCUMENT_STATUS_TONES}
                    />
                ),
            },
            {
                header: 'Updated At',
                accessorKey: 'updatedAt',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-sm text-gray-500">
                        {formatFicoDate(row.original.updatedAt)}
                    </span>
                ),
            },
            {
                header: '',
                id: 'actions',
                size: 52,
                enableSorting: false,
                cell: ({ row }) => {
                    const record = row.original
                    return (
                        <Dropdown
                            renderTitle={<EllipsisButton />}
                            placement="bottom-end"
                        >
                            <Dropdown.Item
                                eventKey="view"
                                onClick={() =>
                                    router.push(documentTypeHref(record.id))
                                }
                            >
                                <HiOutlineViewList className="text-base" />
                                <span>View details</span>
                            </Dropdown.Item>
                            {canUpdate ? (
                                <Dropdown.Item
                                    eventKey="edit"
                                    onClick={() =>
                                        router.push(
                                            documentTypeHref(record.id, 'edit'),
                                        )
                                    }
                                >
                                    <HiOutlinePencil className="text-base" />
                                    <span>Edit document type</span>
                                </Dropdown.Item>
                            ) : null}
                            {canUpdate && record.status !== 'ACTIVE' ? (
                                <Dropdown.Item
                                    eventKey="activate"
                                    onClick={() => {
                                        setActionTarget({
                                            action: 'ACTIVATE',
                                            record,
                                        })
                                        setActionReason('')
                                    }}
                                >
                                    <HiOutlineLockOpen className="text-base" />
                                    <span>Activate</span>
                                </Dropdown.Item>
                            ) : null}
                            {canUpdate && record.status === 'ACTIVE' ? (
                                <Dropdown.Item
                                    eventKey="deactivate"
                                    onClick={() => {
                                        setActionTarget({
                                            action: 'DEACTIVATE',
                                            record,
                                        })
                                        setActionReason('')
                                    }}
                                >
                                    <HiOutlineLockClosed className="text-base" />
                                    <span>Deactivate</span>
                                </Dropdown.Item>
                            ) : null}
                        </Dropdown>
                    )
                },
            },
        ],
        [router, canUpdate],
    )

    const categoryOptions = useMemo(
        () =>
            referenceData?.categories?.length
                ? referenceData.categories
                : DOCUMENT_CATEGORY_FILTER_OPTIONS,
        [referenceData],
    )

    const numberRangeOptions = useMemo(
        () =>
            numberRanges.map((range) => ({
                value: range.id,
                label: `${range.rangeCode} — ${range.rangeName}`,
            })),
        [numberRanges],
    )

    const hasFilters = Boolean(
        search ||
            status ||
            documentCategory ||
            reversalAllowed ||
            numberRangeId,
    )

    const clearFilters = () => {
        setSearch('')
        setStatus('')
        setDocumentCategory('')
        setReversalAllowed('')
        setNumberRangeId('')
        resetPage()
    }

    return (
        <PageContainer>
            <PageHeader
                title="Document Types"
                description="Central accounting document classification master for journal entries, AP, AR, asset accounting, and MM/SD postings."
                breadcrumbs={buildErpBreadcrumbs(DOCUMENT_TYPE_ROUTE)}
                actions={
                    canCreate ? (
                        <Button
                            variant="solid"
                            onClick={() =>
                                router.push(`${DOCUMENT_TYPE_ROUTE}/create`)
                            }
                            disabled={companyLoading}
                        >
                            <HiOutlinePlus className="mr-1.5 h-4 w-4" />
                            Create Document Type
                        </Button>
                    ) : null
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                    label="Total Document Types"
                    value={summary.total}
                    tone="default"
                />
                <StatCard label="Active" value={summary.active} tone="success" />
                <StatCard
                    label="Inactive"
                    value={summary.inactive}
                    tone="warning"
                />
                <StatCard
                    label="Categories"
                    value={summary.categories}
                    tone="info"
                />
            </div>

            <AdaptiveCard className="mb-6">
                <FilterBar
                    fields={[
                        {
                            key: 'companyId',
                            label: 'Company',
                            kind: 'select',
                            value: companyId,
                            options: companies.map((company) => ({
                                value: company.id,
                                label: `${company.code} — ${company.name}`,
                            })),
                            onChange: (value) => {
                                setCompanyId(value)
                                resetPage()
                            },
                        },
                        {
                            key: 'search',
                            label: 'Search',
                            kind: 'text',
                            inputType: 'search',
                            value: search,
                            placeholder: 'Document type code or name',
                            onChange: (value) => {
                                setSearch(value)
                                resetPage()
                            },
                            silent: true,
                        },
                        {
                            key: 'documentCategory',
                            label: 'Category',
                            kind: 'select',
                            value: documentCategory,
                            options: categoryOptions,
                            onChange: (value) => {
                                setDocumentCategory(value)
                                resetPage()
                            },
                        },
                        {
                            key: 'status',
                            label: 'Status',
                            kind: 'select',
                            value: status,
                            options: DOCUMENT_STATUS_FILTER_OPTIONS,
                            onChange: (value) => {
                                setStatus(value)
                                resetPage()
                            },
                        },
                        {
                            key: 'reversalAllowed',
                            label: 'Reversal',
                            kind: 'select',
                            value: reversalAllowed,
                            options: DOCUMENT_REVERSAL_FILTER_OPTIONS,
                            onChange: (value) => {
                                setReversalAllowed(value)
                                resetPage()
                            },
                        },
                        {
                            key: 'numberRangeId',
                            label: 'Number Range',
                            kind: 'select',
                            value: numberRangeId,
                            options: numberRangeOptions,
                            onChange: (value) => {
                                setNumberRangeId(value)
                                resetPage()
                            },
                        },
                    ]}
                    chips={[
                        search
                            ? {
                                  key: 'search',
                                  label: `Search: ${search}`,
                                  onRemove: () => {
                                      setSearch('')
                                      resetPage()
                                  },
                              }
                            : null,
                        documentCategory
                            ? {
                                  key: 'documentCategory',
                                  label: `Category: ${documentCategoryLabel(documentCategory)}`,
                                  onRemove: () => {
                                      setDocumentCategory('')
                                      resetPage()
                                  },
                              }
                            : null,
                        status
                            ? {
                                  key: 'status',
                                  label: `Status: ${
                                      DOCUMENT_STATUS_FILTER_OPTIONS.find(
                                          (option) => option.value === status,
                                      )?.label ?? status
                                  }`,
                                  onRemove: () => {
                                      setStatus('')
                                      resetPage()
                                  },
                              }
                            : null,
                        reversalAllowed
                            ? {
                                  key: 'reversalAllowed',
                                  label:
                                      DOCUMENT_REVERSAL_FILTER_OPTIONS.find(
                                          (option) =>
                                              option.value === reversalAllowed,
                                      )?.label ?? reversalAllowed,
                                  onRemove: () => {
                                      setReversalAllowed('')
                                      resetPage()
                                  },
                              }
                            : null,
                        numberRangeId
                            ? {
                                  key: 'numberRangeId',
                                  label: `Number range: ${
                                      numberRangeOptions.find(
                                          (option) =>
                                              option.value === numberRangeId,
                                      )?.label ?? numberRangeId
                                  }`,
                                  onRemove: () => {
                                      setNumberRangeId('')
                                      resetPage()
                                  },
                              }
                            : null,
                    ].filter(Boolean) as FilterChip[]}
                    onClear={hasFilters ? clearFilters : undefined}
                    actions={
                        <Button
                            size="sm"
                            variant="plain"
                            onClick={load}
                            disabled={loading}
                        >
                            <HiOutlineRefresh className="mr-1 h-4 w-4" />
                            Refresh
                        </Button>
                    }
                />
            </AdaptiveCard>

            {error ? (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                    {error}
                </div>
            ) : null}

            <FicoResponsiveTable<FicoDocumentType>
                title="Document Types"
                columns={columns}
                data={documentTypes}
                loading={loading}
                pagingData={{ pageIndex: page, pageSize, total }}
                onPaginationChange={setPage}
                onSelectChange={(size) => {
                    setPageSize(size)
                    setPage(1)
                }}
                onSort={handleSort}
                noData={!loading && !documentTypes.length}
                fit
                mobile={{
                    title: (row) => `${row.code} — ${row.name}`,
                    subtitle: (row) =>
                        `${documentCategoryLabel(row.documentCategory)} · ${
                            row.numberRange?.rangeCode ?? 'No number range'
                        }`,
                    status: (row) => ({
                        text: row.status,
                        tone: (DOCUMENT_STATUS_TONES[row.status] ??
                            'default') as never,
                    }),
                    fields: [
                        {
                            label: 'Account types',
                            value: (row) =>
                                documentAccountTypeLabels(
                                    row.allowedAccountTypes,
                                ),
                        },
                        {
                            label: 'Reversal',
                            value: (row) =>
                                row.reversalAllowed ? 'Allowed' : 'Not allowed',
                        },
                        {
                            label: 'Updated',
                            value: (row) => formatFicoDate(row.updatedAt),
                        },
                    ],
                    onPress: (row) => router.push(documentTypeHref(row.id)),
                }}
            />

            <ConfirmDialog
                isOpen={Boolean(actionTarget)}
                type={
                    actionTarget?.action === 'DEACTIVATE' ? 'warning' : 'info'
                }
                title={
                    actionTarget?.action === 'ACTIVATE'
                        ? 'Activate Document Type'
                        : 'Deactivate Document Type'
                }
                confirmText={
                    actionTarget?.action === 'ACTIVATE'
                        ? 'Activate'
                        : 'Deactivate'
                }
                confirmButtonProps={{ loading: saving }}
                onConfirm={submitAction}
                onCancel={() => {
                    setActionTarget(null)
                    setActionReason('')
                }}
            >
                <div className="space-y-3">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        {actionTarget
                            ? `${actionTarget.record.code} — ${actionTarget.record.name}`
                            : ''}
                    </p>
                    <p className="text-sm text-gray-500">
                        {actionTarget?.action === 'ACTIVATE'
                            ? 'Active document types become selectable for new accounting transactions after all configuration checks pass.'
                            : 'Inactive document types remain available for historical documents but cannot be selected for new transactions.'}
                    </p>
                    <FormItem label="Reason (optional)">
                        <Input
                            textArea
                            rows={2}
                            maxLength={500}
                            value={actionReason}
                            placeholder="Explain the status change"
                            onChange={(event) =>
                                setActionReason(event.target.value)
                            }
                        />
                    </FormItem>
                </div>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default DocumentTypesPage
