'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import FilterBar, { type FilterChip } from '@/components/shared/FilterBar'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Dropdown from '@/components/ui/Dropdown'
import EllipsisButton from '@/components/shared/EllipsisButton'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import usePermissions from '@/utils/hooks/usePermissions'
import {
    HiOutlineCalendar,
    HiOutlineLockClosed,
    HiOutlineLockOpen,
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineRefresh,
} from 'react-icons/hi'
import { notifyError, notifySuccess } from '../components/FicoCompanySelect'
import { ficoErrorMessage, ficoTaxService } from '../services/ficoService'
import type { FicoTaxCode, FicoTaxRate } from '../types'
import FicoResponsiveTable, {
    type ColumnDef,
} from '../components/FicoResponsiveTable'
import {
    FicoStatusCell,
    FicoTwoLineCell,
    formatFicoDate,
} from '../components/ficoTableUi'
import {
    RATE_UNIT_LABELS,
    RATE_UNIT_OPTIONS,
    TAX_CODE_ROUTE,
    TAX_RATE_STATUS_TONES,
    formatTaxRate,
    isZeroLikeTaxType,
    taxCodeHref,
} from '../components/taxCodeUi'

const todayIso = () => new Date().toISOString().slice(0, 10)

type RateFormState = {
    rate: string
    rateUnit: string
    effectiveFrom: string
    effectiveTo: string
    description: string
}

const EMPTY_RATE_FORM: RateFormState = {
    rate: '',
    rateUnit: 'PERCENTAGE',
    effectiveFrom: todayIso(),
    effectiveTo: '',
    description: '',
}

function hasStarted(rate: FicoTaxRate): boolean {
    return rate.effectiveFrom.slice(0, 10) <= todayIso()
}

const TaxCodeRateHistoryPage = () => {
    const params = useParams()
    const router = useRouter()
    const idParam = params?.id
    const taxCodeId = Array.isArray(idParam) ? idParam[0] : idParam
    const { can } = usePermissions()
    const canCreate = can('fico.tax-codes', 'create')
    const canUpdate = can('fico.tax-codes', 'update')

    const [taxCode, setTaxCode] = useState<FicoTaxCode | null>(null)
    const [rates, setRates] = useState<FicoTaxRate[]>([])
    const [loading, setLoading] = useState(true)
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(25)
    const [status, setStatus] = useState('')
    const [effectiveFrom, setEffectiveFrom] = useState('')
    const [effectiveTo, setEffectiveTo] = useState('')

    const [createOpen, setCreateOpen] = useState(false)
    const [createForm, setCreateForm] = useState<RateFormState>(EMPTY_RATE_FORM)
    const [editing, setEditing] = useState<FicoTaxRate | null>(null)
    const [editForm, setEditForm] = useState<RateFormState>(EMPTY_RATE_FORM)
    const [pendingStatus, setPendingStatus] = useState<{
        rate: FicoTaxRate
        next: 'ACTIVE' | 'INACTIVE'
    } | null>(null)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)

    const loadTaxCode = useCallback(async () => {
        if (!taxCodeId) return
        try {
            const detail = await ficoTaxService.get(taxCodeId)
            setTaxCode(detail)
        } catch (error) {
            notifyError(error, 'Unable to load the tax code.')
        }
    }, [taxCodeId])

    const loadRates = useCallback(() => {
        if (!taxCodeId) return
        setLoading(true)
        ficoTaxService
            .listRates({
                taxCodeId,
                status: status || undefined,
                effectiveFrom: effectiveFrom || undefined,
                effectiveTo: effectiveTo || undefined,
                page,
                pageSize,
            })
            .then((response) => {
                setRates(response.items)
                setTotal(response.total)
            })
            .catch((error) =>
                notifyError(error, 'Unable to load the effective-dated rates.'),
            )
            .finally(() => setLoading(false))
    }, [taxCodeId, status, effectiveFrom, effectiveTo, page, pageSize])

    useEffect(() => {
        loadTaxCode()
    }, [loadTaxCode])

    useEffect(() => {
        loadRates()
    }, [loadRates])

    const reloadAll = () => {
        loadTaxCode()
        loadRates()
    }

    const openCreate = () => {
        setFormError(null)
        setCreateForm({
            ...EMPTY_RATE_FORM,
            rateUnit: taxCode?.rateUnit ?? 'PERCENTAGE',
            effectiveFrom: todayIso(),
        })
        setCreateOpen(true)
    }

    const openEdit = (rate: FicoTaxRate) => {
        setFormError(null)
        setEditing(rate)
        setEditForm({
            rate: String(rate.rate),
            rateUnit: rate.rateUnit,
            effectiveFrom: rate.effectiveFrom.slice(0, 10),
            effectiveTo: rate.effectiveTo?.slice(0, 10) ?? '',
            description: rate.description ?? '',
        })
    }

    const validateRate = (form: RateFormState) => {
        const value = Number(form.rate)
        if (!Number.isFinite(value) || value < 0) {
            return 'Rate must be a non-negative number.'
        }
        if (form.rateUnit === 'PERCENTAGE' && value > 100) {
            return 'A percentage rate cannot exceed 100%.'
        }
        if (
            taxCode &&
            isZeroLikeTaxType(taxCode.taxType) &&
            value !== 0
        ) {
            return 'Zero-rated, exempt, and non-taxable tax codes must use a 0% rate.'
        }
        if (!form.effectiveFrom) {
            return 'Select the date the rate becomes effective.'
        }
        if (form.effectiveTo && form.effectiveTo < form.effectiveFrom) {
            return 'Effective to must be on or after effective from.'
        }
        return null
    }

    const submitCreate = async () => {
        if (!taxCode || !taxCodeId) return
        const error = validateRate(createForm)
        if (error) {
            setFormError(error)
            return
        }
        setSaving(true)
        setFormError(null)
        try {
            await ficoTaxService.createRate(taxCodeId, {
                taxCodeId,
                companyId: taxCode.companyId ?? '',
                rate: Number(createForm.rate),
                rateUnit: createForm.rateUnit,
                effectiveFrom: createForm.effectiveFrom,
                effectiveTo: createForm.effectiveTo || null,
                description: createForm.description.trim() || null,
            })
            notifySuccess('Effective-dated tax rate created.')
            setCreateOpen(false)
            reloadAll()
        } catch (err) {
            const message = ficoErrorMessage(
                err,
                'Unable to create the tax rate.',
            )
            setFormError(message)
            notifyError(err, message)
        } finally {
            setSaving(false)
        }
    }

    const submitEdit = async () => {
        if (!editing || !taxCodeId) return
        const started = hasStarted(editing)
        const error = validateRate(editForm)
        if (error) {
            setFormError(error)
            return
        }
        setSaving(true)
        setFormError(null)
        try {
            await ficoTaxService.updateRate(taxCodeId, editing.id, {
                ...(started
                    ? {}
                    : {
                          rate: Number(editForm.rate),
                          rateUnit: editForm.rateUnit,
                          effectiveFrom: editForm.effectiveFrom,
                      }),
                effectiveTo: editForm.effectiveTo || null,
                description: editForm.description.trim() || null,
            })
            notifySuccess('Tax rate updated.')
            setEditing(null)
            reloadAll()
        } catch (err) {
            const message = ficoErrorMessage(err, 'Unable to update the tax rate.')
            setFormError(message)
            notifyError(err, message)
        } finally {
            setSaving(false)
        }
    }

    const submitStatus = async () => {
        if (!pendingStatus || !taxCodeId) return
        setSaving(true)
        try {
            await ficoTaxService.updateRate(taxCodeId, pendingStatus.rate.id, {
                status: pendingStatus.next,
            })
            notifySuccess(
                pendingStatus.next === 'INACTIVE'
                    ? 'Tax rate deactivated.'
                    : 'Tax rate reactivated.',
            )
            setPendingStatus(null)
            reloadAll()
        } catch (error) {
            notifyError(
                error,
                pendingStatus.next === 'INACTIVE'
                    ? 'Unable to deactivate the tax rate.'
                    : 'Unable to reactivate the tax rate.',
            )
        } finally {
            setSaving(false)
        }
    }

    const columns = useMemo<ColumnDef<FicoTaxRate>[]>(
        () => [
            {
                header: 'Rate',
                accessorKey: 'rate',
                cell: ({ row }) => (
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                            {formatTaxRate(
                                row.original.rate,
                                row.original.rateUnit,
                            )}
                        </span>
                        {hasStarted(row.original) ? (
                            <Tag className="border-0 bg-gray-100 text-[10px] font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                                Started
                            </Tag>
                        ) : (
                            <Tag className="border-0 bg-blue-50 text-[10px] font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                                Future
                            </Tag>
                        )}
                    </div>
                ),
            },
            {
                header: 'Unit',
                accessorKey: 'rateUnit',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                        {RATE_UNIT_LABELS[row.original.rateUnit] ??
                            row.original.rateUnit}
                    </span>
                ),
            },
            {
                header: 'Effective Window',
                accessorKey: 'effectiveFrom',
                cell: ({ row }) => (
                    <FicoTwoLineCell
                        primary={formatFicoDate(row.original.effectiveFrom)}
                        secondary={
                            row.original.effectiveTo
                                ? `to ${formatFicoDate(row.original.effectiveTo)}`
                                : 'Open-ended'
                        }
                    />
                ),
            },
            {
                header: 'Status',
                accessorKey: 'effectiveStatus',
                cell: ({ row }) => (
                    <FicoStatusCell
                        status={
                            row.original.effectiveStatus ?? row.original.status
                        }
                        map={TAX_RATE_STATUS_TONES}
                    />
                ),
            },
            {
                header: 'Description',
                accessorKey: 'description',
                cell: ({ row }) => (
                    <span className="line-clamp-2 max-w-[18rem] text-sm text-gray-600 dark:text-gray-400">
                        {row.original.description || '—'}
                    </span>
                ),
            },
            {
                header: 'Created',
                accessorKey: 'createdAt',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-xs text-gray-500">
                        {formatFicoDate(row.original.createdAt)}
                    </span>
                ),
            },
            {
                header: '',
                id: 'actions',
                size: 52,
                cell: ({ row }) => {
                    const rate = row.original
                    const inactive = rate.status === 'INACTIVE'
                    return (
                        <Dropdown
                            renderTitle={<EllipsisButton />}
                            placement="bottom-end"
                        >
                            {canUpdate ? (
                                <Dropdown.Item
                                    eventKey="edit"
                                    onClick={() => openEdit(rate)}
                                >
                                    <HiOutlinePencil className="text-base" />
                                    <span>Edit rate</span>
                                </Dropdown.Item>
                            ) : null}
                            {canUpdate && !inactive ? (
                                <Dropdown.Item
                                    eventKey="deactivate"
                                    onClick={() =>
                                        setPendingStatus({
                                            rate,
                                            next: 'INACTIVE',
                                        })
                                    }
                                >
                                    <HiOutlineLockClosed className="text-base" />
                                    <span>Deactivate rate</span>
                                </Dropdown.Item>
                            ) : null}
                            {canUpdate && inactive ? (
                                <Dropdown.Item
                                    eventKey="activate"
                                    onClick={() =>
                                        setPendingStatus({
                                            rate,
                                            next: 'ACTIVE',
                                        })
                                    }
                                >
                                    <HiOutlineLockOpen className="text-base" />
                                    <span>Reactivate rate</span>
                                </Dropdown.Item>
                            ) : null}
                        </Dropdown>
                    )
                },
            },
        ],
        [canUpdate],
    )

    if (!taxCodeId) {
        return (
            <PageContainer>
                <PageHeader
                    title="Tax Rate History"
                    breadcrumbs={buildErpBreadcrumbs(TAX_CODE_ROUTE)}
                />
                <AdaptiveCard>
                    <p className="py-10 text-center text-sm text-gray-500">
                        No tax code was selected.
                    </p>
                </AdaptiveCard>
            </PageContainer>
        )
    }

    return (
        <PageContainer>
            <PageHeader
                title="Effective-Dated Tax Rates"
                description={
                    taxCode
                        ? `${taxCode.code} — ${taxCode.name}. Rates are preserved historically; new effective periods replace open-ended rates automatically.`
                        : 'View and manage effective-dated tax rates.'
                }
                breadcrumbs={buildErpBreadcrumbs(
                    taxCodeHref(taxCodeId, 'rates'),
                    { detailLabel: taxCode?.code ?? 'Rates' },
                )}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="plain"
                            onClick={() => router.push(taxCodeHref(taxCodeId))}
                        >
                            Back to details
                        </Button>
                        {canCreate ? (
                            <Button
                                variant="solid"
                                onClick={openCreate}
                                disabled={!taxCode}
                            >
                                <HiOutlinePlus className="mr-1.5 h-4 w-4" />
                                Add rate
                            </Button>
                        ) : null}
                    </div>
                }
            />

            <AdaptiveCard className="mb-6">
                <FilterBar
                    fields={[
                        {
                            key: 'status',
                            label: 'Status',
                            kind: 'select',
                            value: status,
                            options: [
                                { value: 'ACTIVE', label: 'Active' },
                                { value: 'SCHEDULED', label: 'Scheduled' },
                                { value: 'EXPIRED', label: 'Expired' },
                                { value: 'INACTIVE', label: 'Inactive' },
                            ],
                            onChange: (value) => {
                                setStatus(value)
                                setPage(1)
                            },
                        },
                        {
                            key: 'effectiveFrom',
                            label: 'Effective on or after',
                            kind: 'text',
                            inputType: 'date',
                            value: effectiveFrom,
                            onChange: (value) => {
                                setEffectiveFrom(value)
                                setPage(1)
                            },
                        },
                        {
                            key: 'effectiveTo',
                            label: 'Effective on or before',
                            kind: 'text',
                            inputType: 'date',
                            value: effectiveTo,
                            onChange: (value) => {
                                setEffectiveTo(value)
                                setPage(1)
                            },
                        },
                    ]}
                    chips={[
                        status
                            ? {
                                  key: 'status',
                                  label: `Status: ${status}`,
                                  onRemove: () => {
                                      setStatus('')
                                      setPage(1)
                                  },
                              }
                            : null,
                        effectiveFrom
                            ? {
                                  key: 'effectiveFrom',
                                  label: `From: ${effectiveFrom}`,
                                  onRemove: () => {
                                      setEffectiveFrom('')
                                      setPage(1)
                                  },
                              }
                            : null,
                        effectiveTo
                            ? {
                                  key: 'effectiveTo',
                                  label: `To: ${effectiveTo}`,
                                  onRemove: () => {
                                      setEffectiveTo('')
                                      setPage(1)
                                  },
                              }
                            : null,
                    ].filter(Boolean) as FilterChip[]}
                    onClear={() => {
                        setStatus('')
                        setEffectiveFrom('')
                        setEffectiveTo('')
                        setPage(1)
                    }}
                    actions={
                        <Button
                            size="sm"
                            variant="plain"
                            onClick={loadRates}
                            disabled={loading}
                        >
                            <HiOutlineRefresh className="mr-1 h-4 w-4" />
                            Refresh
                        </Button>
                    }
                />
            </AdaptiveCard>

            <FicoResponsiveTable<FicoTaxRate>
                title="Tax Rates"
                columns={columns}
                data={rates}
                loading={loading}
                pagingData={{ pageIndex: page, pageSize, total }}
                onPaginationChange={setPage}
                onSelectChange={(size) => {
                    setPageSize(size)
                    setPage(1)
                }}
                noData={!loading && !rates.length}
                mobile={{
                    title: (row) =>
                        formatTaxRate(row.rate, row.rateUnit),
                    subtitle: (row) =>
                        `${formatFicoDate(row.effectiveFrom)} → ${
                            row.effectiveTo
                                ? formatFicoDate(row.effectiveTo)
                                : 'open'
                        }`,
                    status: (row) => ({
                        text: row.effectiveStatus ?? row.status,
                        tone:
                            (TAX_RATE_STATUS_TONES[
                                row.effectiveStatus ?? row.status
                            ] ?? 'default') as never,
                    }),
                    fields: [
                        {
                            label: 'Unit',
                            value: (row) =>
                                RATE_UNIT_LABELS[row.rateUnit] ?? row.rateUnit,
                        },
                        {
                            label: 'Description',
                            value: (row) => row.description || '—',
                        },
                    ],
                }}
            />

            <FormDialog
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                title="Add Effective-Dated Rate"
                description={
                    taxCode
                        ? `New rate for ${taxCode.code} — ${taxCode.name}. A later start date automatically closes a previous open-ended rate.`
                        : ''
                }
                icon={<HiOutlineCalendar />}
                size="lg"
                confirmLoading={saving}
                onSubmit={submitCreate}
            >
                <RateFormFields
                    form={createForm}
                    setForm={setCreateForm}
                    error={formError}
                    zeroLike={isZeroLikeTaxType(taxCode?.taxType)}
                    lockIdentity={false}
                />
            </FormDialog>

            <FormDialog
                isOpen={Boolean(editing)}
                onClose={() => setEditing(null)}
                title="Edit Tax Rate"
                description={
                    editing
                        ? hasStarted(editing)
                            ? 'This rate has already started. Only the end date and description can be changed; create a new effective-dated rate to change the amount.'
                            : 'This rate starts in the future. Its amount, unit, and start date can still be corrected.'
                        : ''
                }
                icon={<HiOutlinePencil />}
                size="lg"
                confirmLoading={saving}
                onSubmit={submitEdit}
            >
                <RateFormFields
                    form={editForm}
                    setForm={setEditForm}
                    error={formError}
                    zeroLike={isZeroLikeTaxType(taxCode?.taxType)}
                    lockIdentity={Boolean(editing && hasStarted(editing))}
                />
            </FormDialog>

            <ConfirmDialog
                isOpen={Boolean(pendingStatus)}
                type={pendingStatus?.next === 'INACTIVE' ? 'warning' : 'info'}
                title={
                    pendingStatus?.next === 'INACTIVE'
                        ? 'Deactivate Tax Rate'
                        : 'Reactivate Tax Rate'
                }
                confirmText={
                    pendingStatus?.next === 'INACTIVE'
                        ? 'Deactivate'
                        : 'Reactivate'
                }
                confirmButtonProps={{ loading: saving }}
                onConfirm={submitStatus}
                onCancel={() => setPendingStatus(null)}
            >
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    {pendingStatus?.next === 'INACTIVE'
                        ? `Rate ${formatTaxRate(
                              pendingStatus?.rate.rate ?? null,
                              pendingStatus?.rate.rateUnit,
                          )} will no longer be selected for transactions that fall inside its effective window. The record is retained for audit.`
                        : `Rate ${formatTaxRate(
                              pendingStatus?.rate.rate ?? null,
                              pendingStatus?.rate.rateUnit,
                          )} will become usable again for transactions inside its effective window.`}
                </p>
            </ConfirmDialog>
        </PageContainer>
    )
}

function RateFormFields({
    form,
    setForm,
    error,
    zeroLike,
    lockIdentity,
}: {
    form: RateFormState
    setForm: (updater: (previous: RateFormState) => RateFormState) => void
    error: string | null
    zeroLike?: boolean
    lockIdentity: boolean
}) {
    return (
        <div className="space-y-4">
            {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                    {error}
                </div>
            ) : null}
            {lockIdentity ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    The rate amount, unit, and start date are immutable after
                    the effective date has passed. Create a new rate to change
                    them.
                </div>
            ) : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormItem label="Rate" asterisk>
                    <Input
                        inputMode="decimal"
                        value={form.rate}
                        disabled={lockIdentity}
                        placeholder={
                            zeroLike
                                ? '0'
                                : form.rateUnit === 'PERCENTAGE'
                                  ? 'e.g. 12'
                                  : 'e.g. 50.00'
                        }
                        onChange={(event) =>
                            setForm((previous) => ({
                                ...previous,
                                rate: event.target.value,
                            }))
                        }
                    />
                </FormItem>
                <FormItem label="Rate unit">
                    <Select
                        value={
                            RATE_UNIT_OPTIONS.find(
                                (option) => option.value === form.rateUnit,
                            ) ?? null
                        }
                        options={RATE_UNIT_OPTIONS}
                        isClearable={false}
                        isDisabled={lockIdentity}
                        onChange={(option) =>
                            setForm((previous) => ({
                                ...previous,
                                rateUnit:
                                    (option as { value: string } | null)
                                        ?.value ?? 'PERCENTAGE',
                            }))
                        }
                    />
                </FormItem>
                <FormItem label="Effective from" asterisk>
                    <Input
                        type="date"
                        value={form.effectiveFrom}
                        disabled={lockIdentity}
                        onChange={(event) =>
                            setForm((previous) => ({
                                ...previous,
                                effectiveFrom: event.target.value,
                            }))
                        }
                    />
                </FormItem>
                <FormItem label="Effective to">
                    <Input
                        type="date"
                        value={form.effectiveTo}
                        onChange={(event) =>
                            setForm((previous) => ({
                                ...previous,
                                effectiveTo: event.target.value,
                            }))
                        }
                    />
                </FormItem>
            </div>
            <FormItem label="Description">
                <Input
                    textArea
                    rows={2}
                    value={form.description}
                    placeholder="Optional note for the rate change"
                    onChange={(event) =>
                        setForm((previous) => ({
                            ...previous,
                            description: event.target.value,
                        }))
                    }
                />
            </FormItem>
            {zeroLike ? (
                <p className="text-xs text-gray-500">
                    Zero-rated, exempt, and non-taxable tax codes must use a 0%
                    rate.
                </p>
            ) : null}
        </div>
    )
}

export default TaxCodeRateHistoryPage
