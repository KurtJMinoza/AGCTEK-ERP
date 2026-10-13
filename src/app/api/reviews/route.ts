import { NextResponse } from 'next/server'
import { resolveErpApiBaseUrl } from '@/configs/app.config'
import { auth } from '@/auth'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const baseUrl = resolveErpApiBaseUrl()
        const url = `${baseUrl}/reviews?${searchParams.toString()}`

        const res = await fetch(url, {
            headers: {
                Accept: 'application/json',
            },
            cache: 'no-store',
        })
        const data = await res.json()
        return NextResponse.json(data, { status: res.status })
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : 'Failed to fetch reviews',
            },
            { status: 500 },
        )
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const session = await auth()
        const resolvedUserId =
            body.userId ||
            (session?.user as { id?: string } | undefined)?.id ||
            undefined

        if (!resolvedUserId) {
            return NextResponse.json(
                {
                    error:
                        'Forbidden: You must be logged in as a verified purchaser to review this product.',
                },
                { status: 403 },
            )
        }

        const baseUrl = resolveErpApiBaseUrl()

        // Strict verification: check if user has an SdSalesOrder with status DELIVERED containing this productId
        const eligibilityUrl = `${baseUrl}/reviews/eligibility?productId=${encodeURIComponent(body.productId)}&userId=${encodeURIComponent(resolvedUserId)}`
        const eligibilityRes = await fetch(eligibilityUrl, {
            headers: {
                'x-user-id': resolvedUserId,
                Accept: 'application/json',
            },
            cache: 'no-store',
        })

        if (!eligibilityRes.ok) {
            return NextResponse.json(
                {
                    error:
                        'Forbidden: Only verified purchasers with a delivered order can review this product.',
                },
                { status: 403 },
            )
        }

        const eligibilityData = (await eligibilityRes.json()) as { eligible?: boolean }
        if (!eligibilityData.eligible) {
            return NextResponse.json(
                {
                    error:
                        'Forbidden: Only verified purchasers with a delivered order can review this product.',
                },
                { status: 403 },
            )
        }

        const url = `${baseUrl}/reviews`
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-user-id': resolvedUserId,
        }

        const payload = {
            productId: body.productId,
            userId: resolvedUserId,
            rating: Number(body.rating),
            comment: String(body.comment || ''),
            imageUrls: Array.isArray(body.imageUrls) ? body.imageUrls : [],
        }

        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        })

        const data = await res.json()
        return NextResponse.json(data, { status: res.status })
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : 'Failed to create review',
            },
            { status: 500 },
        )
    }
}
