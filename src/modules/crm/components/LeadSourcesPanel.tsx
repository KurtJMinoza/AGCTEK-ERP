'use client'

import Link from 'next/link'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import type { CrmLeadSources } from '../types'
import { CRM_PATHS, crmHref } from '../utils/deepLinks'
import { formatEnumLabel, formatMoney } from '../utils/format'

/** Source mix for leads created in the selected period. */
export default function LeadSourcesPanel({
    data,
    loading,
    error,
    periodLabel,
}: {
    data: CrmLeadSources | null
    loading: boolean
    error: string | null
    periodLabel: string
}) {
    return (
        <AdaptiveCard className="mb-4">
            <div className="mb-3">
                <h5>Lead sources</h5>
                <p className="text-xs text-gray-500">
                    Leads created in the {periodLabel.toLowerCase()} · conversion by current
                    status · won amount from linked Closed Won deals in the same window
                </p>
            </div>

            {error ? (
                <p className="text-sm text-rose-600">{error}</p>
            ) : loading && !data ? (
                <p className="text-sm text-gray-500">Loading…</p>
            ) : data ? (
                data.totals.leadsCreated === 0 && data.totals.wonCount === 0 ? (
                    <p className="py-4 text-center text-sm text-gray-500">
                        No leads created in this period.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[36rem] text-left text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 text-xs uppercase text-gray-500 dark:border-gray-700">
                                    <th className="px-2 py-2 font-semibold">Source</th>
                                    <th className="px-2 py-2 text-right font-semibold">Leads</th>
                                    <th className="px-2 py-2 text-right font-semibold">
                                        Converted
                                    </th>
                                    <th className="px-2 py-2 text-right font-semibold">Conv %</th>
                                    <th className="px-2 py-2 text-right font-semibold">
                                        Won amount
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.sources.map((row) => (
                                    <tr
                                        key={row.source}
                                        className="border-b border-gray-50 last:border-0 dark:border-gray-800"
                                    >
                                        <td className="px-2 py-2">
                                            <Link
                                                href={crmHref(CRM_PATHS.leads, {
                                                    source: row.source,
                                                    createdFrom: data.periodFrom,
                                                })}
                                                className="font-medium text-primary hover:underline"
                                            >
                                                {formatEnumLabel(row.source)}
                                            </Link>
                                        </td>
                                        <td className="px-2 py-2 text-right tabular-nums">
                                            {row.leadsCreated}
                                        </td>
                                        <td className="px-2 py-2 text-right tabular-nums">
                                            <Link
                                                href={crmHref(CRM_PATHS.leads, {
                                                    source: row.source,
                                                    status: 'CONVERTED',
                                                    createdFrom: data.periodFrom,
                                                })}
                                                className="hover:underline"
                                            >
                                                {row.converted}
                                            </Link>
                                        </td>
                                        <td className="px-2 py-2 text-right tabular-nums heading-text">
                                            {row.conversionRate == null
                                                ? '—'
                                                : `${row.conversionRate}%`}
                                        </td>
                                        <td className="px-2 py-2 text-right tabular-nums">
                                            {row.won.byCurrency.length === 0
                                                ? '—'
                                                : row.won.byCurrency
                                                      .map((c) =>
                                                          formatMoney(
                                                              Number(c.amount),
                                                              c.currency,
                                                          ),
                                                      )
                                                      .join(' · ')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t border-gray-100 text-sm font-semibold dark:border-gray-700">
                                    <td className="px-2 py-2">Total</td>
                                    <td className="px-2 py-2 text-right tabular-nums">
                                        {data.totals.leadsCreated}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums">
                                        {data.totals.converted}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums">
                                        {data.totals.conversionRate == null
                                            ? '—'
                                            : `${data.totals.conversionRate}%`}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums text-gray-500">
                                        {data.totals.wonCount} won
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )
            ) : (
                <p className="text-sm text-gray-500">Lead sources unavailable.</p>
            )}
        </AdaptiveCard>
    )
}
