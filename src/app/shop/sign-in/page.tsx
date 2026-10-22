import type { Metadata } from 'next'
import MarketplaceAuthPage from '@/modules/storefront/marketplace/pages/MarketplaceAuthPage'

export const metadata: Metadata = {
    title: 'Sign in | Amalgated Shop',
    description: 'Sign in to check out faster with saved delivery details.',
}

export default async function SignInRoute({
    searchParams,
}: {
    searchParams: Promise<{ next?: string | string[] }>
}) {
    const { next } = await searchParams
    return (
        <MarketplaceAuthPage
            next={typeof next === 'string' ? next : null}
        />
    )
}
