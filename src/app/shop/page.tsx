import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'AGC Marketplace',
    description:
        'Shop AWIC vitamins and bags, LPG refills and MCONPINCO appliances in one cart.',
}

export { default } from '@/modules/storefront/marketplace/pages/MarketplacePage'
