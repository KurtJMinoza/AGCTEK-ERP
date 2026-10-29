import type { ReactNode } from 'react'

type CardGridProps = {
    loading?: boolean
    /** Cards rendered (already capped). */
    shown: number
    /** All records available (for "Showing x of y"). */
    total: number
    /** Where the full list lives, e.g. an "Open in SD" link. */
    fullList?: ReactNode
    /** Shown when the section loaded but has no records (a failed load shows the section notice instead). */
    emptyText?: string
    children: ReactNode
}

/**
 * Recent records on Customer 360 as a responsive card grid (1 column mobile, 2–3 desktop). The
 * footer says how many are shown and links to the owning module for the full list.
 */
export default function CardGrid({
    loading,
    shown,
    total,
    fullList,
    emptyText = 'No data found!',
    children,
}: CardGridProps) {
    if (loading && shown === 0) {
        return (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-700" />
                ))}
            </div>
        )
    }
    return (
        <>
            {shown === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">{emptyText}</p>
            ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>
            )}
            <p className="mt-3 text-xs text-gray-500">
                {shown > 0 ? `Showing ${shown}${total > shown ? ` of ${total}` : ''}` : null}
                {shown > 0 && fullList ? ' · ' : null}
                {fullList}
            </p>
        </>
    )
}
