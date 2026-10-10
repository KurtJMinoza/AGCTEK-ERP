import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
    title: 'Sign in | AGC Marketplace',
    description: 'Sign in to check out faster with saved delivery details.',
}

export default async function SignInRoute({
    searchParams,
}: {
    searchParams: Promise<{ next?: string | string[] }>
}) {
    const { next } = await searchParams
    const returnPath =
        typeof next === 'string' ? `&next=${encodeURIComponent(next)}` : ''
    redirect(`/shop?auth=sign-in${returnPath}`)
}
