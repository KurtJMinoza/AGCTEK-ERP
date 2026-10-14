import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
    title: 'Create account | Amalgated Marketplace',
    description:
        'Create an Amalgated Marketplace account and save your delivery details for checkout.',
}

export default async function SignUpRoute({
    searchParams,
}: {
    searchParams: Promise<{ next?: string | string[] }>
}) {
    const { next } = await searchParams
    const returnPath =
        typeof next === 'string' ? `&next=${encodeURIComponent(next)}` : ''
    redirect(`/shop?auth=sign-up${returnPath}`)
}
