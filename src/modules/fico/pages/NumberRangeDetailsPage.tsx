'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    HiOutlineCalendar,
    HiOutlineClipboardList,
    HiOutlineDocument,
    HiOutlineLockClosed,
    HiOutlineLockOpen,
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineRefresh,
} from 'react-icons/hi'
import { notifyError, notifySuccess } from '../components/FicoCompanySelect'
import { ficoNumberRangeService } from '../services/ficoService'
import type { FicoNumberRange } from '../types'
import { ficoStatusTone } from '../components/ficoTableUi'

const ROUTE = '/modules/fico/number-ranges'

const NumberRangeDetailsPage = () => {
    const params = useParams()
    const rangeId = String(params?.id ?? '')
    const [range, setRange] = useState<any>(null)
    const [utilization, setUtilization] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const load = useCallback(async () => {
        if (!rangeId) return
        setLoading(true)
        try {
            const [detail, util] = await Promise.all([
                ficoNumberRangeService.get(rangeId),
                ficoNumberRangeService.utilization(rangeId),
            ])
            setRange(detail)
            setUtilization(util)
        } catch (error) {
            notifyError(error, 'Unable to load number range details.')
        } finally {
            setLoading(false)
        }
    }, [rangeId])

    useEffect(() => {
        load()
    }, [load])

    const handleActivate = async () => {
        if (!range) return
        setSaving(true)
        try {
            await ficoNumberRangeService.activate(
                range.companyId,
                range.rangeCode,
            )
            notifySuccess('Number range activated.')
            setSaving(false)
            load()
        } catch (error) {
            setSaving(false)
            notifyError(error, 'Unable to activate number range.')
        }
    }

    const handleDeactivate = async () => {
        if (!range) return
        setSaving(true)
        try {
            await ficoNumberRangeService.deactivate(
                range.companyId,
                range.rangeCode,
            )
            notifySuccess('Number range deactivated.')
            setSaving(false)
            load()
        } catch (error) {
            setSaving(false)
            notifyError(error, 'Unable to deactivate number range.')
        }
    }

    const formatNumber = (prefix: string, seq: number, padding: number, suffix: string = '') =>
        `${prefix}${String(seq).padStart(padding, '0')}${suffix}`

    return (
        <PageContainer>
            <PageHeader
                title={range?.rangeCode ?? 'Number Range'}
                description={
                    range
                        ? `Document number range for ${range.documentCategory}`
                        : 'Loading number range details...'
                }
                breadcrumbs={buildErpBreadcrumbs(`${ROUTE}/${rangeId}`, {
                    detailLabel: range?.rangeName ?? range?.rangeCode,
                })}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={load}
                            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-lg"
                        >
                            <HiOutlineRefresh className="w-4 h-4" />
                            Refresh
                        </button>
                        <Link
                            href={ROUTE}
                            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary hover:underline rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
                        >
                            <HiOutlinePlus className="w-4 h-4" />{' '}
                            Back to ranges
                        </Link>
                    </div>
                }
            />

            {range ? (
                <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                        <StatCard
                            label="Status"
                            value={range.status}
                            tone={
                                range.status === 'ACTIVE'
                                    ? 'success'
                                    : range.status === 'INACTIVE'
                                      ? 'warning'
                                      : 'danger'
                            }
                        />
                        <StatCard
                            label="Total Allocated"
                            value={utilization?.totalAllocated ?? 0}
                            tone="default"
                        />
                        <StatCard
                            label="Current Sequence"
                            value={range.currentNumber}
                            tone="info"
                        />
                        <StatCard
                            label="Remaining"
                            value={utilization?.remaining ?? 0}
                            tone="default"
                        />
                        <StatCard
                            label="Utilization"
                            value={`${utilization?.utilizationPercent ?? 0}%`}
                            tone={
                                (utilization?.utilizationPercent ?? 0) >= 90
                                    ? 'danger'
                                    : (utilization?.utilizationPercent ?? 0) >= 70
                                      ? 'warning'
                                      : 'default'
                            }
                        />
                    </div>

                    <AdaptiveCard className="mb-6">
                        <div className="mb-4 flex items-center gap-2">
                            <HiOutlineDocument className="w-5 h-5 text-primary" />
                            <h3 className="text-base font-semibold">
                                General Information
                            </h3>
                        </div>
                        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <div className="flex flex-col gap-1">
                                <dt className="text-xs uppercase text-gray-500">
                                    Range Code
                                </dt>
                                <dd className="text-sm font-mono font-medium">
                                    {range.rangeCode}
                                </dd>
                            </div>
                            <div className="flex flex-col gap-1">
                                <dt className="text-xs uppercase text-gray-500">
                                    Range Name
                                </dt>
                                <dd className="text-sm font-medium">
                                    {range.rangeName}
                                </dd>
                            </div>
                            <div className="flex flex-col gap-1">
                                <dt className="text-xs uppercase text-gray-500">
                                    Company
                                </dt>
                                <dd className="text-sm">
                                    {range.company
                                        ? `${range.company.code} — ${range.company.name}`
                                        : range.companyId}
                                </dd>
                            </div>
                            <div className="flex flex-col gap-1">
                                <dt className="text-xs uppercase text-gray-500">
                                    Document Category
                                </dt>
                                <dd className="text-sm truncate">
                                    {range.documentCategory}
                                </dd>
                            </div>
                            <div className="flex flex-col gap-1">
                                <dt className="text-xs uppercase text-gray-500">
                                    Numbering Method
                                </dt>
                                <dd className="text-sm">
                                    {range.numberingMethod}
                                </dd>
                            </div>
                            <div className="flex flex-col gap-1">
                                <dt className="text-xs uppercase text-gray-500">
                                    Assignment Type
                                </dt>
                                <dd className="text-sm">
                                    {range.assignmentType}
                                </dd>
                            </div>
                            <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
                                <dt className="text-xs uppercase text-gray-500">
                                    Description
                                </dt>
                                <dd className="text-sm">
                                    {range.description || '—'}
                                </dd>
                            </div>
                            <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
                                <dt className="text-xs uppercase text-gray-500">
                                    Remarks
                                </dt>
                                <dd className="text-sm">
                                    {range.remarks || '—'}
                                </dd>
                            </div>
                        </dl>
                    </AdaptiveCard>

                    <AdaptiveCard className="mb-6">
                        <div className="mb-4 flex items-center gap-2">
                            <HiOutlineCalendar className="w-5 h-5 text-primary" />
                            <h3 className="text-base font-semibold">
                                Numbering Configuration
                            </h3>
                        </div>
                        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <div className="flex flex-col gap-1">
                                <dt className="text-xs uppercase text-gray-500">
                                    Prefix
                                </dt>
                                <dd className="text-sm font-mono">
                                    {range.prefix || '—'}
                                </dd>
                            </div>
                            <div className="flex flex-col gap-1">
                                <dt className="text-xs uppercase text-gray-500">
                                    Suffix
                                </dt>
                                <dd className="text-sm font-mono">
                                    {range.suffix || '—'}
                                </dd>
                            </div>
                            <div className="flex flex-col gap-1">
                                <dt className="text-xs uppercase text-gray-500">
                                    Starting Number
                                </dt>
                                <dd className="text-sm font-mono tabular-nums">
                                    {range.startNumber}
                                </dd>
                            </div>
                            <div className="flex flex-col gap-1">
                                <dt className="text-xs uppercase text-gray-500">
                                    Ending Number
                                </dt>
                                <dd className="text-sm font-mono tabular-nums">
                                    {range.endNumber}
                                </dd>
                            </div>
                            <div className="flex flex-col gap-1">
                                <dt className="text-xs uppercase text-gray-500">
                                    Padding Length
                                </dt>
                                <dd className="text-sm tabular-nums">
                                    {range.paddingLength}
                                </dd>
                            </div>
                            <div className="flex flex-col gap-1">
                                <dt className="text-xs uppercase text-gray-500">
                                    Next Number Preview
                                </dt>
                                <dd className="text-sm font-mono font-medium text-primary">
                                    {formatNumber(
                                        range.prefix,
                                        range.currentNumber + 1,
                                        range.paddingLength,
                                        range.suffix,
                                    )}
                                </dd>
                            </div>
                            <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
                                <dt className="text-xs uppercase text-gray-500">
                                    Valid From
                                </dt>
                                <dd className="text-sm">
                                    {range.validFrom
                                        ? new Date(
                                              range.validFrom,
                                          ).toLocaleDateString()
                                        : '—'}
                                </dd>
                            </div>
                            <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
                                <dt className="text-xs uppercase text-gray-500">
                                    Valid To
                                </dt>
                                <dd className="text-sm">
                                    {range.validTo
                                        ? new Date(range.validTo).toLocaleDateString()
                                        : '—'}
                                </dd>
                            </div>
                        </dl>
                    </AdaptiveCard>

                    <AdaptiveCard className="mb-6">
                        <div className="flex items-center gap-2">
                            <HiOutlineClipboardList className="w-5 h-5 text-primary" />
                            <h3 className="text-base font-semibold">
                                Validity & Reset Settings
                            </h3>
                        </div>
                        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <div className="flex flex-col gap-1">
                                <dt className="text-xs uppercase text-gray-500">
                                    Reset Frequency
                                </dt>
                                <dd className="text-sm">
                                    {range.resetFrequency}
                                </dd>
                            </div>
                            <div className="flex flex-col gap-1">
                                <dt className="text-xs uppercase text-gray-500">
                                    Fiscal Year
                                </dt>
                                <dd className="text-sm">
                                    {range.fiscalYear
                                        ? `${range.fiscalYear.code} — ${range.fiscalYear.name}`
                                        : '—'}
                                </dd>
                            </div>
                        </dl>
                        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700/60">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                                Assignment Controls
                            </h4>
                            <div className="flex flex-wrap gap-3">
                                <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-green-500 dark:bg-green-400" />
                                    <span className="text-sm">
                                        Manual Assignment:{' '}
                                        {range.allowManualAssignment
                                            ? 'Allowed'
                                            : 'Blocked'}
                                    </span>
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400" />
                                    <span className="text-sm">
                                        External Assignment:{' '}
                                        {range.allowExternalAssignment
                                            ? 'Allowed'
                                            : 'Blocked'}
                                    </span>
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400" />
                                    <span className="text-sm">
                                        Number Gaps:{' '}
                                        {range.allowGaps
                                            ? 'Allowed'
                                            : 'Not Allowed'}
                                    </span>
                                </span>
                            </div>
                        </div>
                    </AdaptiveCard>

                    <AdaptiveCard>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <HiOutlineLockClosed className="w-5 h-5 text-primary" />
                                <div>
                                    <h3 className="text-base font-semibold">
                                        Range Actions
                                    </h3>
                                    <p className="mt-1 text-sm text-gray-500">
                                        Manage the activation state of this number range.
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {range.status === 'ACTIVE' ? (
                                    <Button
                                        size="sm"
                                        onClick={handleDeactivate}
                                        loading={saving}
                                    >
                                        Deactivate
                                    </Button>
                                ) : (
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        onClick={handleActivate}
                                        loading={saving}
                                    >
                                        Activate
                                    </Button>
                                )}
                                <Link
                                    href={`${ROUTE}/${rangeId}/history`}
                                    className="text-sm font-medium text-primary hover:underline"
                                >
                                    <HiOutlineClipboardList className="w-4 h-4 mr-1" />
                                    View History
                                </Link>
                            </div>
                        </div>
                    </AdaptiveCard>
                </>
            ) : (
                <AdaptiveCard className="py-12 text-center">
                    <HiOutlineDocument className="w-10 h-10 mx-auto text-gray-400 mb-3" />
                    <p className="text-sm text-gray-500">
                        {loading
                            ? 'Loading number range…'
                            : 'The number range could not be loaded.'}
                    </p>
                </AdaptiveCard>
            )}
        </PageContainer>
    )
}

export default NumberRangeDetailsPage
