'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import FilterBar, { type FilterChip } from '@/components/shared/FilterBar'
import FormDialog from '@/components/shared/FormDialog'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Dropdown from '@/components/ui/Dropdown'
import EllipsisButton from '@/components/shared/EllipsisButton'
import Input from '@/components/ui/Input'
import Switcher from '@/components/ui/Switcher'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import usePermissions from '@/utils/hooks/usePermissions'
import {
    HiOutlineCalendar,
    HiOutlineClipboardList,
    HiOutlineDuplicate,
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
import { ficoTaxService } from '../services/ficoService'
import type {
    FicoTaxCode,
    FicoTaxCodeSummary,
} from '../types'
import FicoResponsiveTable, {
    type ColumnDef,
} from '../components/FicoResponsiveTable'
import {
    FicoCodeCell,
    FicoStatusCell,
} from '../components/ficoTableUi'
import {
    CALCULATION_METHOD_LABELS,
    TAX_CATEGORY_LABELS,
    TAX_CODE_FILTER_STATUS_OPTIONS,
    TAX_CODE_ROUTE,
    TAX_CODE_STATUS_TONES,
    TAX_TYPE_LABELS,
    formatTaxRate,
    taxCodeHref,
} from '../components/taxCodeUi'

const EMPTY_SUMMARY: FicoTaxCodeSummary = {
    total: 0,
    active: 0,
    inactive: 0,
    draft: 0,
    expired: 0,
    scheduled: 0,
    upcomingRateChanges: 0,
    generatedAt: '',
}

type DuplicateForm = {
    code: string
    name: string
    includeRates: boolean
}

const TaxCodesPage = () => {
    const router = useRouter()
    const {
        companies,
        companyId,
        setCompanyId,
        loading: companyLoading,
    } = useFicoCompanies()
    const { can } = usePermissions()
    const canCreate = can('fico.tax-codes', 'create')
    const canUpdate = can('fico.tax-codes', 'update')

    const [taxCodes, setTaxCodes] = useState<FicoTaxCode[]>([])
    const [summary, setSummary] = useState<FicoTaxCodeSummary>(EMPTY_SUMMARY)
    const [loading, setLoading] = useState(false)
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(25)

    const [search, setSearch] = useState('')
    const [status, setStatus] = useState('')

    const [actionTarget, setActionTarget] = useState<{
        action: 'ACTIVATE' | 'DEACTIVATE'
        record: FicoTaxCode
    } | null>(null)
    const [actionReason, setActionReason] = useState('')
    const [duplicateSource, setDuplicateSource] = useState<FicoTaxCode | null>(
        null,
    )
    const [duplicateForm, setDuplicateForm] = useState<DuplicateForm>({
        code: '',
        name: '',
        includeRates: true,
    })
    const [saving, setSaving] = useState(false)

    const resetPage = () => setPage(1)

    const load = useCallback(() => {
        if (!companyId) {
            setTaxCodes([])
            setTotal(0)
            setSummary(EMPTY_SUMMARY)
            return
        }
        setLoading(true)
        Promise.all([
            ficoTaxService.list({
                companyId,
                search: search.trim() || undefined,
                status: status || undefined,
                page,
                pageSize,
            }),
            ficoTaxService.summary(companyId),
        ])
            .then(([list, summaryResult]) => {
                setTaxCodes(list.items)
                setTotal(list.total)
                setSummary(summaryResult)
            })
            .catch((error) => notifyError(error, 'Unable to load tax codes.'))
            .finally(() => setLoading(false))
    }, [
        companyId,
        search,
        status,
        page,
        pageSize,
    ])

    useEffect(() => {
        load()
    }, [load])

    const openDuplicate = (record: FicoTaxCode) => {
        setDuplicateSource(record)
        setDuplicateForm({
            code: `${record.code}-COPY`.slice(0, 32),
            name: `${record.name} (copy)`,
            includeRates: true,
        })
    }

    const submitDuplicate = async () => {
        if (!duplicateSource) return
        if (!duplicateForm.code.trim()) {
            notifyError(null, 'Enter a code for the duplicated tax code.')
            return
        }
        setSaving(true)
        try {
            const result = await ficoTaxService.duplicate(duplicateSource.id, {
                code: duplicateForm.code.trim(),
                name: duplicateForm.name.trim() || undefined,
                includeRates: duplicateForm.includeRates,
            })
            notifySuccess(
                `Tax code duplicated as "${result.taxCode.code}". Review it before activation.`,
            )
            setDuplicateSource(null)
            router.push(taxCodeHref(result.taxCode.id))
        } catch (error) {
            notifyError(error, 'Unable to duplicate the tax code.')
        } finally {
            setSaving(false)
        }
    }

    const submitAction = async () => {
        if (!actionTarget) return
        setSaving(true)
        try {
            const payload = {
                companyId: actionTarget.record.companyId ?? companyId,
                taxCodeId: actionTarget.record.id,
                ...(actionReason.trim()
                    ? { reason: actionReason.trim() }
                    : {}),
            }
            if (actionTarget.action === 'ACTIVATE') {
                await ficoTaxService.activate(actionTarget.record.id, payload)
                notifySuccess('Tax code activated.')
            } else {
                await ficoTaxService.deactivate(actionTarget.record.id, payload)
                notifySuccess('Tax code deactivated.')
            }
            setActionTarget(null)
            setActionReason('')
            load()
        } catch (error) {
            notifyError(
                error,
                actionTarget.action === 'ACTIVATE'
                    ? 'Unable to activate the tax code.'
                    : 'Unable to deactivate the tax code.',
            )
        } finally {
            setSaving(false)
        }
    }

    const columns = useMemo<ColumnDef<FicoTaxCode>[]>(
        () => [
            {
                header: 'Tax Code',
                accessorKey: 'code',
                cell: ({ row }) => (
                    <FicoCodeCell
                        icon="account"
                        code={row.original.code}
                        name={row.original.name}
                        onClick={() =>
                            router.push(taxCodeHref(row.original.id))
                        }
                    />
                ),
            },
            {
                header: 'Tax Code Name',
                accessorKey: 'name',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                        {row.original.name}
                    </span>
                ),
            },
            {
                header: 'Tax Category',
                accessorKey: 'taxCategory',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                        {TAX_CATEGORY_LABELS[
                            row.original.taxCategory
                        ] ?? row.original.taxCategory}
                    </span>
                ),
            },
            {
                header: 'Tax Type',
                accessorKey: 'taxType',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                        {TAX_TYPE_LABELS[row.original.taxType] ??
                            row.original.taxType}
                    </span>
                ),
            },
            {
                header: 'Tax Rate',
                accessorKey: 'effectiveRate',
                cell: ({ row }) => {
                    const record = row.original
                    const rate =
                        record.currentRate ?? record.nextRate ?? record.latestRate
                    return (
                        <span className="text-sm tabular-nums text-gray-900 dark:text-gray-100">
                            {formatTaxRate(
                                rate?.rate ?? null,
                                record.effectiveRateUnit ?? record.rateUnit,
                            )}
                        </span>
                    )
                },
            },
            {
                header: 'Calculation Method',
                accessorKey: 'calculationMethod',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                        {CALCULATION_METHOD_LABELS[
                            row.original.calculationMethod
                        ] ?? row.original.calculationMethod}
                    </span>
                ),
            },
            {
                header: 'Applicability',
                accessorKey: 'isSalesApplicable',
                cell: ({ row }) => {
                    const record = row.original
                    const apps: string[] = []
                    if (record.isSalesApplicable) apps.push('Sales')
                    if (record.isPurchaseApplicable) apps.push('Purchases')
                    if (record.isServiceApplicable) apps.push('Services')
                    if (record.isInventoryApplicable) apps.push('Inventory')
                    return (
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                            {apps.length ? apps.join(', ') : '—'}
                        </span>
                    )
                },
            },
            {
                header: 'Recoverable',
                accessorKey: 'isRecoverable',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                        {row.original.isRecoverable ? 'Yes' : 'No'}
                    </span>
                ),
            },
            {
                header: 'Status',
                accessorKey: 'effectiveStatus',
                cell: ({ row }) => (
                    <FicoStatusCell
                        status={
                            row.original.effectiveStatus ??
                            row.original.status
                        }
                        map={TAX_CODE_STATUS_TONES}
                    />
                ),
            },
            {
                header: '',
                id: 'actions',
                size: 52,
                cell: ({ row }) => {
                    const record = row.original
                    const effective = record.effectiveStatus ?? record.status
                    return (
                        <Dropdown
                            renderTitle={<EllipsisButton />}
                            placement="bottom-end"
                        >
                            <Dropdown.Item
                                eventKey="view"
                                onClick={() =>
                                    router.push(taxCodeHref(record.id))
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
                                            taxCodeHref(record.id, 'edit'),
                                        )
                                    }
                                >
                                    <HiOutlinePencil className="text-base" />
                                    <span>Edit tax code</span>
                                </Dropdown.Item>
                            ) : null}
                            <Dropdown.Item
                                eventKey="rates"
                                onClick={() =>
                                    router.push(taxCodeHref(record.id, 'rates'))
                                }
                            >
                                <HiOutlineCalendar className="text-base" />
                                <span>Rate history</span>
                            </Dropdown.Item>
                            <Dropdown.Item
                                eventKey="history"
                                onClick={() =>
                                    router.push(
                                        taxCodeHref(record.id, 'history'),
                                    )
                                }
                            >
                                <HiOutlineClipboardList className="text-base" />
                                <span>Audit history</span>
                            </Dropdown.Item>
                            {canCreate ? (
                                <Dropdown.Item
                                    eventKey="duplicate"
                                    onClick={() => openDuplicate(record)}
                                >
                                    <HiOutlineDuplicate className="text-base" />
                                    <span>Duplicate</span>
                                </Dropdown.Item>
                            ) : null}
                            {canUpdate &&
                            effective !== 'ACTIVE' &&
                            record.status !== 'ACTIVE' ? (
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
        [router, canCreate, canUpdate],
    )

    const hasFilters = Boolean(search || status)

    return (
        <PageContainer>
            <PageHeader
                title="Tax Codes"
                description="Configure tax classifications, effective-dated rates, calculation methods, recoverability, and G/L mappings for financial transactions."
                breadcrumbs={buildErpBreadcrumbs(TAX_CODE_ROUTE)}
                actions={
                    canCreate ? (
                        <Button
                            variant="solid"
                            onClick={() =>
                                router.push(`${TAX_CODE_ROUTE}/create`)
                            }
                            disabled={companyLoading}
                        >
                            <HiOutlinePlus className="mr-1.5 h-4 w-4" />
                            Create Tax Code
                        </Button>
                    ) : null
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                <StatCard
                    label="Total Tax Codes"
                    value={summary.total}
                    tone="default"
                />
                <StatCard label="Active" value={summary.active} tone="success" />
                <StatCard
                    label="Scheduled"
                    value={summary.scheduled}
                    tone="info"
                />
                <StatCard
                    label="Upcoming Rate Changes"
                    value={summary.upcomingRateChanges}
                    tone="info"
                />
                <StatCard
                    label="Expired"
                    value={summary.expired}
                    tone="danger"
                />
                <StatCard
                    label="Draft / Inactive"
                    value={summary.draft + summary.inactive}
                    tone="warning"
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
                            placeholder: 'Code, name, or jurisdiction',
                            onChange: (value) => {
                                setSearch(value)
                                resetPage()
                            },
                            silent: true,
                        },
                        {
                            key: 'status',
                            label: 'Status',
                            kind: 'select',
                            value: status,
                            options: TAX_CODE_FILTER_STATUS_OPTIONS,
                            onChange: (value) => {
                                setStatus(value)
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
                        status
                            ? {
                                  key: 'status',
                                  label: `Status: ${
                                      TAX_CODE_FILTER_STATUS_OPTIONS.find(
                                          (option) => option.value === status,
                                      )?.label ?? status
                                  }`,
                                  onRemove: () => {
                                      setStatus('')
                                      resetPage()
                                  },
                              }
                            : null,
                    ].filter(Boolean) as FilterChip[]}
                    onClear={
                        hasFilters
                            ? () => {
                                  setSearch('')
                                  setStatus('')
                                  resetPage()
                              }
                            : undefined
                    }
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

            <FicoResponsiveTable<FicoTaxCode>
                title="Tax Codes"
                columns={columns}
                data={taxCodes}
                loading={loading}
                pagingData={{ pageIndex: page, pageSize, total }}
                onPaginationChange={setPage}
                onSelectChange={(size) => {
                    setPageSize(size)
                    setPage(1)
                }}
                noData={!loading && !taxCodes.length}
                fit
                mobile={{
                    title: (row) => `${row.code} — ${row.name}`,
                    subtitle: (row) =>
                        `${TAX_CATEGORY_LABELS[row.taxCategory] ?? row.taxCategory} · ${TAX_TYPE_LABELS[row.taxType] ?? row.taxType}`,
                    status: (row) => ({
                        text:
                            row.effectiveStatus?.replace(/_/g, ' ') ??
                            row.status,
                        tone:
                            (TAX_CODE_STATUS_TONES[
                                row.effectiveStatus ?? row.status
                            ] ?? 'default') as never,
                    }),
                    fields: [
                        {
                            label: 'Rate',
                            value: (row) =>
                                formatTaxRate(
                                    (row.currentRate ?? row.nextRate ?? row.latestRate)
                                        ?.rate ?? null,
                                    row.effectiveRateUnit ?? row.rateUnit,
                                ),
                        },
                        {
                            label: 'Calculation',
                            value: (row) =>
                                CALCULATION_METHOD_LABELS[
                                    row.calculationMethod
                                ] ?? row.calculationMethod,
                        },
                        {
                            label: 'Jurisdiction',
                            value: (row) =>
                                row.taxJurisdiction ||
                                row.countryCode ||
                                '—',
                        },
                    ],
                    onPress: (row) => router.push(taxCodeHref(row.id)),
                }}
            />

            <FormDialog
                isOpen={Boolean(duplicateSource)}
                onClose={() => setDuplicateSource(null)}
                title="Duplicate Tax Code"
                description={
                    duplicateSource
                        ? `Create a draft copy of "${duplicateSource.code} — ${duplicateSource.name}".`
                        : ''
                }
                icon={<HiOutlineDuplicate />}
                size="md"
                confirmLoading={saving}
                onSubmit={submitDuplicate}
            >
                <div className="space-y-4">
                    <FormItem label="New tax code" asterisk>
                        <Input
                            value={duplicateForm.code}
                            maxLength={32}
                            placeholder="e.g. VAT12-COPY"
                            onChange={(event) =>
                                setDuplicateForm((previous) => ({
                                    ...previous,
                                    code: event.target.value.toUpperCase(),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Name">
                        <Input
                            value={duplicateForm.name}
                            maxLength={160}
                            placeholder="Tax code name"
                            onChange={(event) =>
                                setDuplicateForm((previous) => ({
                                    ...previous,
                                    name: event.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <div className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700/60">
                        <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                Copy effective-dated rates
                            </p>
                            <p className="text-xs text-gray-500">
                                The duplicate starts as a draft. G/L mappings
                                are copied only within the same company.
                            </p>
                        </div>
                        <Switcher
                            checked={duplicateForm.includeRates}
                            onChange={(checked) =>
                                setDuplicateForm((previous) => ({
                                    ...previous,
                                    includeRates: checked,
                                }))
                            }
                        />
                    </div>
                </div>
            </FormDialog>

            <ConfirmDialog
                isOpen={Boolean(actionTarget)}
                type={
                    actionTarget?.action === 'DEACTIVATE' ? 'warning' : 'info'
                }
                title={
                    actionTarget?.action === 'ACTIVATE'
                        ? 'Activate Tax Code'
                        : 'Deactivate Tax Code'
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
                        {actionTarget?.action === 'ACTIVATE'
                            ? `Activating "${actionTarget?.record.code}" makes it selectable in new financial transactions. G/L mappings and a current or future non-zero rate must be configured.`
                            : `Deactivating "${actionTarget?.record.code}" prevents its selection in new transactions while preserving all rates, mappings, and audit history.`}
                    </p>
                    <FormItem label="Reason (optional)">
                        <Input
                            value={actionReason}
                            placeholder="Explain the change for the audit trail"
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

export default TaxCodesPage
