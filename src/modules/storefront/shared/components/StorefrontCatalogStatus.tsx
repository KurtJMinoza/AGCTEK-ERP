'use client'

import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'

type StorefrontCatalogStatusProps = {
    loading: boolean
    error: string | null
    empty: boolean
    onRetry: () => void
}

/** Loading / error / empty placeholder for a storefront product grid; renders nothing once products show. */
const StorefrontCatalogStatus = ({
    loading,
    error,
    empty,
    onRetry,
}: StorefrontCatalogStatusProps) => {
    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <Spinner size={36} />
            </div>
        )
    }
    if (error) {
        return (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    We couldn&apos;t load products right now. {error}
                </p>
                <Button size="sm" onClick={onRetry}>
                    Try again
                </Button>
            </div>
        )
    }
    if (empty) {
        return (
            <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">
                No products available yet.
            </p>
        )
    }
    return null
}

export default StorefrontCatalogStatus
