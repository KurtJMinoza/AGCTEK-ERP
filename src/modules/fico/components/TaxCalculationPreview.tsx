'use client'

import { useMemo, useState } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import Tag from '@/components/ui/Tag'
import { HiOutlineCalculator, HiOutlineRefresh } from 'react-icons/hi'
import { ficoErrorMessage, ficoTaxService } from '../services/ficoService'
import type { FicoTaxCalculationResult } from '../types'
import {
    CALCULATION_METHOD_LABELS,
    RATE_UNIT_LABELS,
    TAX_APPLICATION_TYPE_OPTIONS,
    TAX_TYPE_LABELS,
    formatTaxAmount,
    formatTaxRate,
} from './taxCodeUi'

const CLASSIFICATION_LABELS: Record<string, string> = {
    STANDARD: 'Standard taxable',
    ZERO_RATED: 'Zero-rated',
    EXEMPT: 'Exempt',
    NON_TAXABLE: 'Non-taxable',
    WITHHOLDING: 'Withholding tax',
}

const CLASSIFICATION_TONE: Record<string, string> = {
    STANDARD:
        'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    ZERO_RATED:
        'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300',
    EXEMPT:
        'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    NON_TAXABLE:
        'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
    WITHHOLDING:
        'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
}

function todayIso() {
    return new Date().toISOString().slice(0, 10)
}

type TaxCalculationPreviewProps = {
    companyId: string
    taxCodeId: string
    taxCodeStatus?: string
    defaultTransactionType?: string
    defaultAmount?: string
    className?: string
}

/**
 * Read-only tax calculation preview. Calls the backend decimal-safe engine and
 * only renders its result — no tax math, posting, or number-range consumption
 * happens in the browser.
 */
const TaxCalculationPreview = ({
    companyId,
    taxCodeId,
    taxCodeStatus,
    defaultTransactionType = 'SALES',
    defaultAmount = '',
    className,
}: TaxCalculationPreviewProps) => {
    const [amount, setAmount] = useState(defaultAmount)
    const [transactionDate, setTransactionDate] = useState(todayIso)
    const [transactionType, setTransactionType] = useState(
        defaultTransactionType,
    )
    const [result, setResult] = useState<FicoTaxCalculationResult | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const selectedType = useMemo(
        () =>
            TAX_APPLICATION_TYPE_OPTIONS.find(
                (option) => option.value === transactionType,
            ) ?? null,
        [transactionType],
    )

    const disabled = !companyId || !taxCodeId || taxCodeStatus !== 'ACTIVE'

    const calculate = async () => {
        if (!companyId || !taxCodeId) return
        if (!amount.trim()) {
            setError('Enter an amount to preview the tax calculation.')
            return
        }
        setLoading(true)
        setError(null)
        try {
            const response = await ficoTaxService.calculate({
                taxCodeId,
                companyId,
                transactionDate,
                transactionType,
                amount: amount.trim(),
                dryRun: true,
            })
            setResult(response)
        } catch (err) {
            setResult(null)
            setError(
                ficoErrorMessage(
                    err,
                    'Unable to calculate the tax preview for these inputs.',
                ),
            )
        } finally {
            setLoading(false)
        }
    }

    return (
        <AdaptiveCard className={className}>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                    <HiOutlineCalculator className="h-5 w-5 text-primary" />
                    <div>
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                            Tax calculation preview
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                            Uses the applicable effective-dated rate. Preview
                            only — no posting or document number is created.
                        </p>
                    </div>
                </div>
                {result?.appliedRateEffectiveFrom ? (
                    <Tag className="border-0 bg-gray-100 text-[11px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-200">
                        Rate effective {result.appliedRateEffectiveFrom} →{' '}
                        {result.appliedRateEffectiveTo ?? 'open'}
                    </Tag>
                ) : null}
            </div>

            {taxCodeStatus && taxCodeStatus !== 'ACTIVE' ? (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    Activate the tax code to use the calculation preview.
                </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <FormItem label="Amount" asterisk>
                    <Input
                        value={amount}
                        inputMode="decimal"
                        placeholder="0.00"
                        onChange={(event) => setAmount(event.target.value)}
                    />
                </FormItem>
                <FormItem label="Transaction date" asterisk>
                    <Input
                        type="date"
                        value={transactionDate}
                        onChange={(event) =>
                            setTransactionDate(event.target.value)
                        }
                    />
                </FormItem>
                <FormItem label="Transaction type" asterisk>
                    <Select
                        value={selectedType}
                        options={TAX_APPLICATION_TYPE_OPTIONS}
                        onChange={(option) =>
                            setTransactionType(
                                (option as { value: string } | null)?.value ??
                                    '',
                            )
                        }
                        isClearable={false}
                    />
                </FormItem>
                <FormItem label="&nbsp;">
                    <Button
                        variant="solid"
                        className="w-full"
                        loading={loading}
                        disabled={disabled}
                        onClick={calculate}
                    >
                        <HiOutlineCalculator className="mr-1.5 h-4 w-4" />
                        Calculate
                    </Button>
                </FormItem>
            </div>

            {error ? (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                    {error}
                </div>
            ) : null}

            {result ? (
                <div className="mt-6 space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${CLASSIFICATION_TONE[result.classification] ?? CLASSIFICATION_TONE.STANDARD}`}
                        >
                            {CLASSIFICATION_LABELS[result.classification] ??
                                result.classification}
                        </span>
                        <span className="text-xs text-gray-500">
                            {TAX_TYPE_LABELS[result.taxType] ?? result.taxType} ·{' '}
                            {CALCULATION_METHOD_LABELS[
                                result.calculationMethod
                            ] ?? result.calculationMethod}{' '}
                            · rate{' '}
                            {formatTaxRate(result.taxRate, result.rateUnit)}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <StatCard
                            label="Net amount"
                            value={formatTaxAmount(result.netAmount)}
                            tone="default"
                        />
                        <StatCard
                            label="Tax amount"
                            value={formatTaxAmount(result.taxAmount)}
                            tone={
                                result.taxAmount > 0 ? 'info' : 'success'
                            }
                        />
                        <StatCard
                            label="Gross amount"
                            value={formatTaxAmount(result.grossAmount)}
                            tone="info"
                        />
                        <StatCard
                            label="Taxable base"
                            value={formatTaxAmount(result.taxableBase)}
                            tone="default"
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700/60 dark:bg-gray-800/40">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                Recoverable tax
                            </p>
                            <p className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                {formatTaxAmount(result.recoverableTax)}
                            </p>
                        </div>
                        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700/60 dark:bg-gray-800/40">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                Non-recoverable tax
                            </p>
                            <p className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                {formatTaxAmount(result.nonRecoverableTax)}
                            </p>
                        </div>
                    </div>

                    {result.breakdown.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left">
                                <thead>
                                    <tr className="border-b border-gray-200 dark:border-gray-700">
                                        <th className="pb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                            Component
                                        </th>
                                        <th className="pb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                            Rate
                                        </th>
                                        <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                            Tax
                                        </th>
                                        <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                            Recoverable
                                        </th>
                                        <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                            Non-recoverable
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.breakdown.map((line) => (
                                        <tr
                                            key={line.componentName}
                                            className="border-b border-gray-50/60 dark:border-gray-800/60"
                                        >
                                            <td className="py-2 text-sm text-gray-900 dark:text-gray-100">
                                                {line.componentName}
                                            </td>
                                            <td className="py-2 text-sm tabular-nums text-gray-600 dark:text-gray-300">
                                                {formatTaxRate(
                                                    line.lineRate,
                                                    result.rateUnit,
                                                )}
                                            </td>
                                            <td className="py-2 text-right text-sm tabular-nums text-gray-900 dark:text-gray-100">
                                                {formatTaxAmount(
                                                    line.taxAmount,
                                                )}
                                            </td>
                                            <td className="py-2 text-right text-sm tabular-nums text-gray-600 dark:text-gray-300">
                                                {formatTaxAmount(
                                                    line.recoverableAmount,
                                                )}
                                            </td>
                                            <td className="py-2 text-right text-sm tabular-nums text-gray-600 dark:text-gray-300">
                                                {formatTaxAmount(
                                                    line.nonRecoverableAmount,
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : null}

                    <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-500">
                            Rate unit:{' '}
                            {RATE_UNIT_LABELS[result.rateUnit] ??
                                result.rateUnit}
                        </p>
                        <Button
                            size="sm"
                            variant="plain"
                            onClick={calculate}
                            loading={loading}
                        >
                            <HiOutlineRefresh className="mr-1 h-4 w-4" />
                            Recalculate
                        </Button>
                    </div>
                </div>
            ) : null}
        </AdaptiveCard>
    )
}

export default TaxCalculationPreview
