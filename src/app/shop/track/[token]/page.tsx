import type { Metadata } from 'next'
import MarketplaceTrackPage from '@/modules/storefront/marketplace/pages/MarketplaceTrackPage'

export const metadata: Metadata = {
    title: 'Track your order | Amalgated Shop',
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
}

type TrackRouteProps = {
    params: Promise<{ token: string }>
}

export default async function TrackRoute({ params }: TrackRouteProps) {
    const { token } = await params
    let decoded = token
    try {
        decoded = decodeURIComponent(token)
    } catch {
        // Malformed escape: let the API reject the raw value.
    }
    return <MarketplaceTrackPage token={decoded} />
}
