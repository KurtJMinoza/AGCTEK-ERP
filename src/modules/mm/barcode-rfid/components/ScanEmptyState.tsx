'use client'

import AdaptiveCard from '@/components/shared/AdaptiveCard'
import { HiOutlineQrcode } from 'react-icons/hi'

type ScanEmptyStateProps = {
    title?: string
    description?: string
}

const ScanEmptyState = ({
    title = 'No scan result yet',
    description = 'Scan or enter a barcode, then run Lookup to resolve master data.',
}: ScanEmptyStateProps) => (
    <AdaptiveCard bodyClass="py-12">
        <div className="flex flex-col items-center justify-center text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-gray-800">
                <HiOutlineQrcode className="text-3xl" />
            </span>
            <h4 className="text-base font-semibold heading-text">{title}</h4>
            <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
                {description}
            </p>
        </div>
    </AdaptiveCard>
)

export default ScanEmptyState
