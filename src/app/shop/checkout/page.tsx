import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Checkout',
    description: 'Review your selection and place your order.',
}

export { default } from '@/modules/storefront/marketplace/pages/MarketplaceCheckoutPage'