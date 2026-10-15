import type { Metadata } from 'next'
import MarketplaceAuthPage from '@/modules/storefront/marketplace/pages/MarketplaceAuthPage'

export const metadata: Metadata = {
    title: 'Create account | Amalgated Shop',
    description:
        'Create an Amalgated Shop account and save your delivery details for checkout.',
}

export default async function SignUpRoute({
    searchParams,
}: {
    searchParams: Promise<{ next?: string | string[] }>
}) {
    const { next } = await searchParams
    return (
        <MarketplaceAuthPage
            initialMode="sign-up"
            next={typeof next === 'string' ? next : null}
        />
    )
}
