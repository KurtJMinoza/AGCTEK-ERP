'use client'

import dynamic from 'next/dynamic'
import Spinner from '@/components/ui/Spinner'
import type { FleetMapProps } from './FleetMap'

const FleetMap = dynamic(() => import('./FleetMap'), {
    ssr: false,
    loading: () => (
        <div className="flex h-full min-h-[420px] items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700">
            <Spinner size={32} />
        </div>
    ),
})

/** SSR-safe wrapper around the Leaflet fleet map. */
export default function FleetMapPanel(props: FleetMapProps) {
    return <FleetMap {...props} />
}
