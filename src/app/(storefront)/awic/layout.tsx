import {
    storefrontBody,
    storefrontHeading,
} from '@/app/(storefront)/awic/fonts'
import { AWIC_BRAND } from '@/modules/storefront/retail/brand'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
    title: AWIC_BRAND.initials,
    description: `${AWIC_BRAND.fullName} — bags, vitamins, and everyday goods.`,
    icons: {
        icon: '/storefront/aw-logo-new.png',
        shortcut: '/storefront/aw-logo-new.png',
        apple: '/storefront/aw-logo-new.png',
    },
}

export default function StorefrontShopLayout({
    children,
}: {
    children: ReactNode
}) {
    return (
        <div
            className={`${storefrontHeading.variable} ${storefrontBody.variable} min-h-screen bg-brand-canvas font-storefront-body text-brand-ink antialiased`}
        >
            {children}
        </div>
    )
}
