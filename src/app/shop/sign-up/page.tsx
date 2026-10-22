import { redirect } from 'next/navigation'
import { MARKETPLACE_SIGN_IN_PATH } from '@/modules/storefront/marketplace/host'

export default async function SignUpRedirect({
    searchParams,
}: {
    searchParams: Promise<{ next?: string | string[] }>
}) {
    const { next } = await searchParams
    const q =
        typeof next === 'string' && next.trim()
            ? `?${new URLSearchParams({ next }).toString()}`
            : ''
    redirect(`${MARKETPLACE_SIGN_IN_PATH}${q}`)
}
