import type { Metadata } from 'next'
import MarketplaceNotificationsPage from '@/modules/storefront/marketplace/pages/MarketplaceNotificationsPage'

export const metadata: Metadata = {
    title: 'Notifications | AGCTEK Storefront',
    description: 'Track your order updates and account notifications.',
}

export default function NotificationsPage() {
    return <MarketplaceNotificationsPage />
}
