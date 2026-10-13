import { NextResponse } from 'next/server'
import { resolveErpApiBaseUrl } from '@/configs/app.config'

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params
        const baseUrl = resolveErpApiBaseUrl()
        const backendUrl = `${baseUrl}/sd/sales-orders/${encodeURIComponent(id)}/confirm`

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        }
        const auth = request.headers.get('authorization')
        if (auth) headers['authorization'] = auth
        const userId = request.headers.get('x-user-id')
        if (userId) headers['x-user-id'] = userId

        const res = await fetch(backendUrl, {
            method: 'POST',
            headers,
        })

        const data = await res.json()
        return NextResponse.json(data, { status: res.status })
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : 'Failed to approve order',
            },
            { status: 500 },
        )
    }
}
