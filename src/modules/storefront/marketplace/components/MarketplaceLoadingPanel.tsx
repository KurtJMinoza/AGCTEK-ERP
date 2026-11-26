'use client'

import Image from 'next/image'
import { MARKETPLACE_LOGO_SRC, MARKETPLACE_NAME } from '../marketplaceUi'

type MarketplaceLoadingPanelProps = {
    label?: string | null
}

/** Centered logo + progress strip used by the overlay and route `loading.tsx`. */
const MarketplaceLoadingPanel = ({
    label,
}: MarketplaceLoadingPanelProps) => (
    <div className="flex w-full max-w-xs flex-col items-center justify-center gap-5 px-6 text-center">
        <div className="relative h-28 w-28 overflow-hidden rounded-full bg-white shadow-md ring-1 ring-gray-100 sm:h-32 sm:w-32">
            <Image
                src={MARKETPLACE_LOGO_SRC}
                alt=""
                fill
                sizes="128px"
                className="object-contain p-3"
                priority
            />
        </div>
        <div className="relative mx-auto h-1.5 w-36 overflow-hidden rounded-full bg-gray-100">
            <div
                className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-shop-600"
                style={{
                    animation:
                        'marketplace-loader-slide 1.05s ease-in-out infinite',
                }}
            />
        </div>
        <style>{`
          @keyframes marketplace-loader-slide {
            0% { transform: translateX(-110%); }
            100% { transform: translateX(220%); }
          }
        `}</style>
        <p className="text-sm font-medium tracking-wide text-gray-600">
            {label || `Loading ${MARKETPLACE_NAME}…`}
        </p>
    </div>
)

export default MarketplaceLoadingPanel
