import type { Metadata } from 'next'
import MarketplaceOtpPage from '@/modules/storefront/marketplace/pages/MarketplaceOtpPage'

export const metadata: Metadata = {
    title: 'Verify your Gmail | Amalgated Shop',
}

export default async function OtpRoute({
    searchParams,
}: {
    searchParams: Promise<{ next?: string | string[] }>
}) {
    const { next } = await searchParams
    return <MarketplaceOtpPage next={typeof next === 'string' ? next : null} />
}
