import { NextResponse } from 'next/server'
import { resolveErpApiBaseUrl } from '@/configs/app.config'
import { auth } from '@/auth'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const productId = searchParams.get('productId')
        if (!productId) {
            return NextResponse.json({ eligible: false }, { status: 400 })
        }

        const session = await auth()
        const resolvedUserId = (session?.user as { id?: string } | undefined)
            ?.id

        if (!resolvedUserId) {
            return NextResponse.json({ eligible: false })
        }

        const baseUrl = resolveErpApiBaseUrl()
        const url = `${baseUrl}/reviews/eligibility?productId=${encodeURIComponent(productId)}&userId=${encodeURIComponent(resolvedUserId)}`

        const res = await fetch(url, {
            headers: {
                'x-user-id': resolvedUserId,
                Accept: 'application/json',
            },
            cache: 'no-store',
        })

        if (!res.ok) {
            return NextResponse.json({ eligible: false })
        }

        const data = await res.json()
        return NextResponse.json({ eligible: data.eligible === true })
    } catch {
        return NextResponse.json({ eligible: false })
    }
}
