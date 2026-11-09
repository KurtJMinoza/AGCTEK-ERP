'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import Tabs from '@/components/ui/Tabs'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import usePermissions from '@/utils/hooks/usePermissions'
import {
    HiOutlineCalendar,
    HiOutlineClipboardList,
    HiOutlineClock,
    HiOutlineDocumentText,
    HiOutlineLockClosed,
    HiOutlineLockOpen,
    HiOutlinePencil,
    HiOutlineRefresh,
} from 'react-icons/hi'
import { notifyError, notifySuccess } from '../components/FicoCompanySelect'
import { ficoTaxService } from '../services/ficoService'
import type { FicoTaxCode } from '../types'
import {
    FicoStatusCell,
    FicoTwoLineCell,
    formatFicoDate,
} from '../components/ficoTableUi'
import {
    CALCULATION_METHOD_LABELS,
    EFFECTIVE_STATUS_LABELS,
    RATE_UNIT_LABELS,
    ROUNDING_LEVEL_LABELS,
    ROUNDING_METHOD_LABELS,
    TAX_CATEGORY_LABELS,
    TAX_CODE_ROUTE,
    TAX_CODE_STATUS_TONES,
    TAX_RATE_STATUS_TONES,
    TAX_TYPE_LABELS,
    formatTaxRate,
    isZeroLikeTaxType,
    isWithholdingTaxCode,
    taxApplicabilityLabels,
    taxCodeHref,
} from '../components/taxCodeUi'
import TaxCalculationPreview from '../components/TaxCalculationPreview'

type Utilization = {
    taxCodeId: string
    taxCode: string
    taxCodeName: string
    rateCount: number
    auditLogCount: number
    isActive: boolean
    status: string
    canDelete: boolean
}

const TaxCodeDetailsPage = () => {
    const params = useParams()
    const router = useRouter()
    const idParam = params?.id
    const taxCodeId = Array.isArray(idParam) ? idParam[0] : idParam
    const { can } = usePermissions()
    const canUpdate = can('fico.tax-codes', 'update')

    const [taxCode, setTaxCode] = useState<FicoTaxCode | null>(null)
    const [utilization, setUtilization] = useState<Utilization | null>(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('overview')
    const [action, setAction] = useState<'ACTIVATE' | 'DEACTIVATE' | null>(null)
    const [reason, setReason] = useState('')
    const [saving, setSaving] = useState(false)

    const load = useCallback(async () => {
        if (!taxCodeId) return
        setLoading(true)
        try {
            const [detail, usage] = await Promise.all([
                ficoTaxService.get(taxCodeId),
                ficoTaxService.utilization(taxCodeId).catch(() => null),
            ])
            setTaxCode(detail)
            setUtilization(usage)
        } catch (error) {
            notifyError(error, 'Unable to load the tax code.')
        } finally {
            setLoading(false)
        }
    }, [taxCodeId])

    useEffect(() => {
        load()
    }, [load])

    const submitAction = async () => {
        if (!taxCode || !action) return
        setSaving(true)
        try {
            const payload = {
                companyId: taxCode.companyId ?? '',
                taxCodeId: taxCode.id,
                ...(reason.trim() ? { reason: reason.trim() } : {}),
            }
            if (action === 'ACTIVATE') {
                await ficoTaxService.activate(taxCode.id, payload)
                notifySuccess('Tax code activated.')
            } else {
                await ficoTaxService.deactivate(taxCode.id, payload)
                notifySuccess('Tax code deactivated.')
            }
            setAction(null)
            setReason('')
            load()
        } catch (error) {
            notifyError(
                error,
                action === 'ACTIVATE'
                    ? 'Unable to activate the tax code.'
                    : 'Unable to deactivate the tax code.',
            )
        } finally {
            setSaving(false)
        }
    }

    if (!taxCodeId) {
        return (
            <PageContainer>
                <PageHeader
                    title="Tax Code Details"
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

    if (loading && !taxCode) {
        return (
            <PageContainer>
                <PageHeader
                    title="Tax Code Details"
                    description="Loading tax code…"
                    breadcrumbs={buildErpBreadcrumbs(taxCodeHref(taxCodeId))}
                />
                <AdaptiveCard>
                    <p className="py-10 text-center text-sm text-gray-500">
                        Loading tax code…
                    </p>
                </AdaptiveCard>
            </PageContainer>
        )
    }

    if (!taxCode) {
        return (
            <PageContainer>
                <PageHeader
                    title="Tax Code Details"
                    breadcrumbs={buildErpBreadcrumbs(taxCodeHref(taxCodeId))}
                />
                <AdaptiveCard>
                    <p className="py-10 text-center text-sm text-gray-500">
                        The tax code could not be loaded.
                    </p>
                </AdaptiveCard>
            </PageContainer>
        )
    }

    const effectiveStatus = taxCode.effectiveStatus ?? taxCode.status
    const rates = taxCode.taxRates ?? []
    const applicability = taxApplicabilityLabels(taxCode)
    const zeroLike = isZeroLikeTaxType(taxCode.taxType)
    const withholding = isWithholdingTaxCode(taxCode)

    return (
        <PageContainer>
            <PageHeader
                title={
                    <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-primary">
                            {taxCode.code}
                        </span>
                        <span>{taxCode.name}</span>
                    </span>
                }
                description={
                    <span className="flex flex-wrap items-center gap-2">
                        <span>
                            {TAX_CATEGORY_LABELS[taxCode.taxCategory] ??
                                taxCode.taxCategory}{' '}
                            ·{' '}
                            {TAX_TYPE_LABELS[taxCode.taxType] ??
                                taxCode.taxType}
                        </span>
                        <FicoStatusCell
                            status={effectiveStatus}
                            map={TAX_CODE_STATUS_TONES}
                        />
                        {taxCode.company ? (
                            <span className="text-gray-500">
                                {taxCode.company.code} — {taxCode.company.name}
                            </span>
                        ) : null}
                    </span>
                }
                breadcrumbs={buildErpBreadcrumbs(taxCodeHref(taxCodeId), {
                    detailLabel: taxCode.code,
                })}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="plain"
                            onClick={load}
                            loading={loading}
                        >
                            <HiOutlineRefresh className="mr-1.5 h-4 w-4" />
                            Refresh
                        </Button>
                        {canUpdate ? (
                            <Button
                                variant="default"
                                onClick={() =>
                                    router.push(
                                        taxCodeHref(taxCode.id, 'edit'),
                                    )
                                }
                            >
                                <HiOutlinePencil className="mr-1.5 h-4 w-4" />
                                Edit
                            </Button>
                        ) : null}
                        <Button
                            variant="default"
                            onClick={() =>
                                router.push(taxCodeHref(taxCode.id, 'rates'))
                            }
                        >
                            <HiOutlineCalendar className="mr-1.5 h-4 w-4" />
                            Rates
                        </Button>
                        <Button
                            variant="default"
                            onClick={() =>
                                router.push(taxCodeHref(taxCode.id, 'history'))
                            }
                        >
                            <HiOutlineClipboardList className="mr-1.5 h-4 w-4" />
                            Audit history
                        </Button>
                        {canUpdate && taxCode.status === 'ACTIVE' ? (
                            <Button
                                variant="solid"
                                onClick={() => {
                                    setReason('')
                                    setAction('DEACTIVATE')
                                }}
                            >
                                <HiOutlineLockClosed className="mr-1.5 h-4 w-4" />
                                Deactivate
                            </Button>
                        ) : null}
                        {canUpdate && taxCode.status !== 'ACTIVE' ? (
                            <Button
                                variant="solid"
                                onClick={() => {
                                    setReason('')
                                    setAction('ACTIVATE')
                                }}
                            >
                                <HiOutlineLockOpen className="mr-1.5 h-4 w-4" />
                                Activate
                            </Button>
                        ) : null}
                    </div>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                <StatCard
                    label="Effective status"
                    value={EFFECTIVE_STATUS_LABELS[effectiveStatus] ?? effectiveStatus}
                    tone={
                        effectiveStatus === 'ACTIVE'
                            ? 'success'
                            : effectiveStatus === 'EXPIRED'
                              ? 'danger'
                              : effectiveStatus === 'SCHEDULED'
                                ? 'info'
                                : 'warning'
                    }
                />
                <StatCard
                    label="Current rate"
                    value={formatTaxRate(
                        taxCode.currentRate?.rate ?? null,
                        taxCode.currentRate?.rateUnit ?? taxCode.rateUnit,
                    )}
                    tone={taxCode.currentRate ? 'info' : 'default'}
                />
                <StatCard
                    label="Rates on record"
                    value={utilization?.rateCount ?? taxCode.rateCount ?? 0}
                    tone="default"
                />
                <StatCard
                    label="Audit events"
                    value={utilization?.auditLogCount ?? 0}
                    tone="default"
                />
                <StatCard
                    label="Recoverability"
                    value={taxCode.isRecoverable ? 'Recoverable' : 'Not recoverable'}
                    tone={taxCode.isRecoverable ? 'success' : 'warning'}
                />
            </div>

            <Tabs
                value={activeTab}
                onChange={(value) => setActiveTab(String(value))}
                className="mb-6"
            >
                <Tabs.TabList>
                    <Tabs.TabNav value="overview">Overview</Tabs.TabNav>
                    <Tabs.TabNav value="rates">Effective rates</Tabs.TabNav>
                    <Tabs.TabNav value="mapping">G/L mappings</Tabs.TabNav>
                    <Tabs.TabNav value="applicability">Applicability</Tabs.TabNav>
                    <Tabs.TabNav value="preview">Calculation preview</Tabs.TabNav>
                </Tabs.TabList>

                <Tabs.TabContent value="overview">
                    <div className="space-y-6">
                        <AdaptiveCard>
                            <SectionTitle
                                icon={<HiOutlineDocumentText />}
                                title="Tax code identity"
                            />
                            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                <Field label="Tax code" value={taxCode.code} mono />
                                <Field label="Name" value={taxCode.name} />
                                <Field
                                    label="Company"
                                    value={
                                        taxCode.company
                                            ? `${taxCode.company.code} — ${taxCode.company.name}`
                                            : taxCode.companyId ?? '—'
                                    }
                                />
                                <Field
                                    label="Registered status"
                                    value={taxCode.status}
                                />
                                <Field
                                    label="Tax category"
                                    value={
                                        TAX_CATEGORY_LABELS[taxCode.taxCategory] ??
                                        taxCode.taxCategory
                                    }
                                />
                                <Field
                                    label="Tax type"
                                    value={
                                        TAX_TYPE_LABELS[taxCode.taxType] ??
                                        taxCode.taxType
                                    }
                                />
                                <Field
                                    label="Jurisdiction"
                                    value={taxCode.taxJurisdiction ?? '—'}
                                />
                                <Field
                                    label="Country"
                                    value={taxCode.countryCode ?? '—'}
                                />
                                <Field
                                    label="Description"
                                    value={taxCode.description ?? '—'}
                                    className="sm:col-span-2 lg:col-span-4"
                                />
                                <Field
                                    label="Remarks"
                                    value={taxCode.remarks ?? '—'}
                                    className="sm:col-span-2 lg:col-span-4"
                                />
                            </dl>
                        </AdaptiveCard>

                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            <AdaptiveCard>
                                <SectionTitle
                                    icon={<HiOutlineClock />}
                                    title="Calculation behavior"
                                />
                                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <Field
                                        label="Calculation method"
                                        value={
                                            CALCULATION_METHOD_LABELS[
                                                taxCode.calculationMethod
                                            ] ?? taxCode.calculationMethod
                                        }
                                    />
                                    <Field
                                        label="Rate unit"
                                        value={
                                            RATE_UNIT_LABELS[taxCode.rateUnit] ??
                                            taxCode.rateUnit
                                        }
                                    />
                                    <Field
                                        label="Rounding method"
                                        value={
                                            ROUNDING_METHOD_LABELS[
                                                taxCode.roundingMethod
                                            ] ?? taxCode.roundingMethod
                                        }
                                    />
                                    <Field
                                        label="Decimal precision"
                                        value={String(taxCode.decimalPrecision)}
                                    />
                                    <Field
                                        label="Rounding level"
                                        value={
                                            ROUNDING_LEVEL_LABELS[
                                                taxCode.roundingLevel
                                            ] ?? taxCode.roundingLevel
                                        }
                                    />
                                    <Field
                                        label="Calculation priority"
                                        value={String(
                                            taxCode.calculationPriority ?? 0,
                                        )}
                                    />
                                </dl>
                            </AdaptiveCard>

                            <AdaptiveCard>
                                <SectionTitle
                                    icon={<HiOutlineCalendar />}
                                    title="Effective rate window"
                                />
                                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <Field
                                        label="Current rate"
                                        value={formatTaxRate(
                                            taxCode.currentRate?.rate ?? null,
                                            taxCode.currentRate?.rateUnit ??
                                                taxCode.rateUnit,
                                        )}
                                    />
                                    <Field
                                        label="Current effective from"
                                        value={formatFicoDate(
                                            taxCode.currentRate?.effectiveFrom,
                                        )}
                                    />
                                    <Field
                                        label="Current effective to"
                                        value={formatFicoDate(
                                            taxCode.currentRate?.effectiveTo,
                                        )}
                                    />
                                    <Field
                                        label="Next scheduled rate"
                                        value={
                                            taxCode.nextRate
                                                ? `${formatTaxRate(
                                                      taxCode.nextRate.rate,
                                                      taxCode.nextRate.rateUnit,
                                                  )} from ${formatFicoDate(
                                                      taxCode.nextRate
                                                          .effectiveFrom,
                                                  )}`
                                                : '—'
                                        }
                                    />
                                </dl>
                                <div className="mt-4">
                                    <Button
                                        size="sm"
                                        variant="default"
                                        onClick={() =>
                                            router.push(
                                                taxCodeHref(
                                                    taxCode.id,
                                                    'rates',
                                                ),
                                            )
                                        }
                                    >
                                        Manage effective-dated rates
                                    </Button>
                                </div>
                            </AdaptiveCard>
                        </div>
                    </div>
                </Tabs.TabContent>

                <Tabs.TabContent value="rates">
                    <AdaptiveCard>
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                                    Effective-dated rates
                                </h3>
                                <p className="mt-1 text-sm text-gray-500">
                                    Rates are immutable once their start date
                                    has passed. Add a new rate to supersede the
                                    current one.
                                </p>
                            </div>
                            <Button
                                size="sm"
                                variant="default"
                                onClick={() =>
                                    router.push(
                                        taxCodeHref(taxCode.id, 'rates'),
                                    )
                                }
                            >
                                Open rate history
                            </Button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left">
                                <thead>
                                    <tr className="border-b border-gray-200 dark:border-gray-700">
                                        <th className="pb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                            Rate
                                        </th>
                                        <th className="pb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                            Unit
                                        </th>
                                        <th className="pb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                            Effective from
                                        </th>
                                        <th className="pb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                            Effective to
                                        </th>
                                        <th className="pb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                            Status
                                        </th>
                                        <th className="pb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                            Description
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rates.map((rate) => (
                                        <tr
                                            key={rate.id}
                                            className="border-b border-gray-50/60 hover:bg-gray-50 dark:border-gray-800/60 dark:hover:bg-gray-800/40"
                                        >
                                            <td className="py-3 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                                {formatTaxRate(
                                                    rate.rate,
                                                    rate.rateUnit,
                                                )}
                                            </td>
                                            <td className="py-3 text-sm text-gray-600 dark:text-gray-300">
                                                {RATE_UNIT_LABELS[
                                                    rate.rateUnit
                                                ] ?? rate.rateUnit}
                                            </td>
                                            <td className="py-3 text-sm text-gray-900 dark:text-gray-100">
                                                {formatFicoDate(
                                                    rate.effectiveFrom,
                                                )}
                                            </td>
                                            <td className="py-3 text-sm text-gray-900 dark:text-gray-100">
                                                {rate.effectiveTo
                                                    ? formatFicoDate(
                                                          rate.effectiveTo,
                                                      )
                                                    : 'Open-ended'}
                                            </td>
                                            <td className="py-3 text-sm">
                                                <FicoStatusCell
                                                    status={
                                                        rate.effectiveStatus ??
                                                        rate.status
                                                    }
                                                    map={TAX_RATE_STATUS_TONES}
                                                />
                                            </td>
                                            <td className="max-w-[16rem] truncate py-3 text-sm text-gray-600 dark:text-gray-400">
                                                {rate.description ?? '—'}
                                            </td>
                                        </tr>
                                    ))}
                                    {rates.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={6}
                                                className="py-8 text-center text-sm text-gray-500"
                                            >
                                                {zeroLike
                                                    ? 'No rate record is required for zero-rated, exempt, or non-taxable codes.'
                                                    : 'No effective-dated rates configured yet. Add a rate before activation.'}
                                            </td>
                                        </tr>
                                    ) : null}
                                </tbody>
                            </table>
                        </div>
                    </AdaptiveCard>
                </Tabs.TabContent>

                <Tabs.TabContent value="mapping">
                    <AdaptiveCard>
                        <div className="mb-4">
                            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                                General ledger mappings
                            </h3>
                            <p className="mt-1 text-sm text-gray-500">
                                Accounts must belong to the company&apos;s
                                assigned chart of accounts, remain active, and
                                allow postings.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <GlAccountField
                                label="Input tax account"
                                account={taxCode.inputTaxGlAccount}
                            />
                            <GlAccountField
                                label="Output tax account"
                                account={taxCode.outputTaxGlAccount}
                            />
                            <GlAccountField
                                label="Withholding tax payable"
                                account={taxCode.withholdingPayableGlAccount}
                            />
                            <GlAccountField
                                label="Withholding tax receivable"
                                account={
                                    taxCode.withholdingReceivableGlAccount
                                }
                            />
                            <GlAccountField
                                label="Non-recoverable tax expense"
                                account={taxCode.nonRecoverableTaxGlAccount}
                            />
                        </div>
                        {withholding ? (
                            <p className="mt-4 text-xs text-gray-500">
                                Withholding tax codes require a payable or
                                receivable mapping before activation.
                            </p>
                        ) : null}
                    </AdaptiveCard>
                </Tabs.TabContent>

                <Tabs.TabContent value="applicability">
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <AdaptiveCard>
                            <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">
                                Transaction applicability
                            </h3>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <ApplicabilityRow
                                    label="Sales"
                                    active={taxCode.isSalesApplicable}
                                />
                                <ApplicabilityRow
                                    label="Purchases"
                                    active={taxCode.isPurchaseApplicable}
                                />
                                <ApplicabilityRow
                                    label="Services"
                                    active={taxCode.isServiceApplicable}
                                />
                                <ApplicabilityRow
                                    label="Inventory"
                                    active={taxCode.isInventoryApplicable}
                                />
                            </div>
                            {applicability.length === 0 ? (
                                <p className="mt-4 text-xs text-amber-600 dark:text-amber-300">
                                    No applicability selected. At least one is
                                    required before activation.
                                </p>
                            ) : null}
                        </AdaptiveCard>

                        <AdaptiveCard>
                            <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">
                                Tax recovery
                            </h3>
                            <div className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-3 dark:border-gray-700/60">
                                <div>
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        {taxCode.isRecoverable
                                            ? 'Recoverable tax'
                                            : 'Non-recoverable tax'}
                                    </p>
                                    <p className="mt-0.5 text-xs text-gray-500">
                                        {taxCode.isRecoverable
                                            ? 'The tax can be recovered through input or output tax accounts.'
                                            : 'The tax is expensed through the non-recoverable tax account.'}
                                    </p>
                                </div>
                                <Tag
                                    className={
                                        taxCode.isRecoverable
                                            ? 'border-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                                            : 'border-0 bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                                    }
                                >
                                    {taxCode.isRecoverable
                                        ? 'Recoverable'
                                        : 'Non-recoverable'}
                                </Tag>
                            </div>
                            {!taxCode.isRecoverable ? (
                                <div className="mt-3">
                                    <GlAccountField
                                        label="Non-recoverable tax expense"
                                        account={
                                            taxCode.nonRecoverableTaxGlAccount
                                        }
                                    />
                                </div>
                            ) : null}
                        </AdaptiveCard>
                    </div>
                </Tabs.TabContent>

                <Tabs.TabContent value="preview">
                    <TaxCalculationPreview
                        companyId={taxCode.companyId ?? ''}
                        taxCodeId={taxCode.id}
                        taxCodeStatus={taxCode.status}
                        defaultTransactionType={
                            taxCode.isSalesApplicable ? 'SALES' : 'PURCHASE'
                        }
                    />
                </Tabs.TabContent>
            </Tabs>

            <ConfirmDialog
                isOpen={Boolean(action)}
                type={action === 'DEACTIVATE' ? 'warning' : 'info'}
                title={
                    action === 'ACTIVATE'
                        ? 'Activate Tax Code'
                        : 'Deactivate Tax Code'
                }
                confirmText={action === 'ACTIVATE' ? 'Activate' : 'Deactivate'}
                confirmButtonProps={{ loading: saving }}
                onConfirm={submitAction}
                onCancel={() => {
                    setAction(null)
                    setReason('')
                }}
            >
                <div className="space-y-3">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        {action === 'ACTIVATE'
                            ? `Activating "${taxCode.code}" makes it selectable in new financial transactions. The backend validates applicability, G/L mappings, and a current or future non-zero rate.`
                            : `Deactivating "${taxCode.code}" prevents its selection in new transactions while preserving all rates and audit history.`}
                    </p>
                    <FormItem label="Reason (optional)">
                        <Input
                            value={reason}
                            placeholder="Explain the change for the audit trail"
                            onChange={(event) => setReason(event.target.value)}
                        />
                    </FormItem>
                </div>
            </ConfirmDialog>
        </PageContainer>
    )
}

function SectionTitle({
    icon,
    title,
}: {
    icon: ReactNode
    title: string
}) {
    return (
        <div className="mb-4 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light">
                {icon}
            </span>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {title}
            </h3>
        </div>
    )
}

function Field({
    label,
    value,
    mono,
    className,
}: {
    label: string
    value: ReactNode
    mono?: boolean
    className?: string
}) {
    return (
        <div className={className}>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {label}
            </dt>
            <dd
                className={`mt-1 text-sm text-gray-900 dark:text-gray-100 ${mono ? 'font-mono font-semibold' : ''}`}
            >
                {value}
            </dd>
        </div>
    )
}

function GlAccountField({
    label,
    account,
}: {
    label: string
    account?: {
        accountCode: string
        accountName: string
        accountType?: string
        status?: string
    } | null
}) {
    return (
        <div className="rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700/60">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {label}
            </p>
            <FicoTwoLineCell
                primary={account?.accountCode ?? 'Not configured'}
                secondary={account?.accountName}
                mono
            />
        </div>
    )
}

function ApplicabilityRow({
    label,
    active,
}: {
    label: string
    active: boolean
}) {
    return (
        <div className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700/60">
            <span className="text-sm text-gray-900 dark:text-gray-100">
                {label}
            </span>
            <Tag
                className={
                    active
                        ? 'border-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                        : 'border-0 bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
                }
            >
                {active ? 'Applicable' : 'Not applicable'}
            </Tag>
        </div>
    )
}

export default TaxCodeDetailsPage
