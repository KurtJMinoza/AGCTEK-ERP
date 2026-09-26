import { Montserrat, Inter } from 'next/font/google'

export const storefrontHeading = Montserrat({
    subsets: ['latin'],
    weight: ['500', '600', '700'],
    variable: '--font-storefront-heading',
    display: 'swap',
})

export const storefrontBody = Inter({
    subsets: ['latin'],
    weight: ['400', '500', '600'],
    variable: '--font-storefront-body',
    display: 'swap',
})
