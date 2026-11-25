'use client'

import AdaptiveCard from '@/components/shared/AdaptiveCard'
import type { FicoJournalWorkbenchSummary } from '../../types'

const tiles = (
    summary: FicoJournalWorkbenchSummary | null,
): Array<{ label: string; value: number }> => [
    { label: 'Total journals', value: summary?.total ?? 0 },
    { label: 'Draft', value: summary?.draft ?? 0 },
    { label: 'Pending approval', value: summary?.pendingApproval ?? 0 },
    { label: 'Ready to post', value: summary?.readyToPost ?? 0 },
    { label: 'Posted', value: summary?.posted ?? 0 },
    { label: 'Reversed', value: summary?.reversed ?? 0 },
]

export default function JournalSummaryBar({
    summary,
    loading,
}: {
    summary: FicoJournalWorkbenchSummary | null
    loading?: boolean
}) {
    return (
        <AdaptiveCard className="mb-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {tiles(summary).map((tile) => (
                    <div
                        key={tile.label}
                        className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800/40"
                    >
                        <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            {tile.label}
                        </div>
                        <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                            {loading ? '—' : tile.value.toLocaleString()}
                        </div>
                    </div>
                ))}
            </div>
        </AdaptiveCard>
    )
}