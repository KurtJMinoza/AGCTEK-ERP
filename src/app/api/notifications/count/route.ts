import { NextResponse } from 'next/server'
import { resolveErpApiBaseUrl } from '@/configs/app.config'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const baseUrl = resolveErpApiBaseUrl()
        const url = `${baseUrl}/notifications/count?${searchParams.toString()}`

        const headers: Record<string, string> = {}
        const auth = request.headers.get('authorization')
        if (auth) headers['authorization'] = auth
        const userId = request.headers.get('x-user-id')
        if (userId) headers['x-user-id'] = userId

        const res = await fetch(url, { headers })
        const data = await res.json()
        return NextResponse.json(data, { status: res.status })
    } catch (error) {
        return NextResponse.json(
            {
                count: 0,
                error:
                    error instanceof Error
                        ? error.message
                        : 'Failed to fetch notification count',
            },
            { status: 500 },
        )
    }
}
