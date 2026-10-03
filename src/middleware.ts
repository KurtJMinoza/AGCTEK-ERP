import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'

import authConfig from '@/configs/auth.config'
import {
    authRoutes as _authRoutes,
    publicRoutes as _publicRoutes,
    // protectedRoutes
} from '@/configs/routes.config'
import { REDIRECT_URL_KEY } from '@/constants/app.constant'
import appConfig from '@/configs/app.config'
import {
    MARKETPLACE_PATH,
    isMarketplaceHost,
} from '@/modules/storefront/marketplace/host'
import {
    AWIC_STOREFRONT_PATH,
    isAwicStorefrontHost,
} from '@/modules/storefront/retail/brand'
import { repairErpModulePath } from '@/utils/erp-path'

const { auth } = NextAuth(authConfig)

const publicRoutes = Object.entries(_publicRoutes).map(([key]) => key)
const authRoutes = Object.entries(_authRoutes).map(([key]) => key)

const apiAuthPrefix = `${appConfig.apiPrefix}/auth`

function isSessionActive(
    auth: { user?: unknown; expires?: string } | null | undefined,
): boolean {
    if (!auth?.user) return false
    if (auth.expires && new Date(auth.expires).getTime() <= Date.now()) {
        return false
    }
    return true
}

export default auth((req) => {
    const { nextUrl } = req
    const repairedPath = repairErpModulePath(nextUrl.pathname)
    if (repairedPath && repairedPath !== nextUrl.pathname) {
        const url = nextUrl.clone()
        url.pathname = repairedPath
        return NextResponse.redirect(url)
    }

    const hostname = (req.headers.get('host') ?? '').split(':')[0] ?? ''

    /**
     * Dedicated marketplace host (e.g. shop.localhost):
     * `/` serves the marketplace; ERP paths are not exposed on this host.
     */
    if (isMarketplaceHost(hostname)) {
        const path = nextUrl.pathname

        if (
            path.startsWith(apiAuthPrefix) ||
            path.startsWith('/api') ||
            path.startsWith('/_next')
        ) {
            return
        }

        if (path !== '/') {
            return NextResponse.redirect(new URL(`/${nextUrl.search}`, req.url))
        }

        const rewriteUrl = nextUrl.clone()
        rewriteUrl.pathname = MARKETPLACE_PATH
        return NextResponse.rewrite(rewriteUrl)
    }

    const onAwicHost = isAwicStorefrontHost(hostname)

    /**
     * Dedicated AWIC retail host: `/` serves the storefront; clean paths rewrite
     * into `/awic/*`. Checked after marketplace so shared hosts follow marketplace rules.
     */
    if (onAwicHost) {
        const path = nextUrl.pathname

        if (
            path.startsWith(apiAuthPrefix) ||
            path.startsWith('/api') ||
            path.startsWith('/_next')
        ) {
            return
        }

        if (path === AWIC_STOREFRONT_PATH) {
            return NextResponse.redirect(new URL(`/${nextUrl.search}`, req.url))
        }
        if (path.startsWith(`${AWIC_STOREFRONT_PATH}/`)) {
            const stripped = path.slice(AWIC_STOREFRONT_PATH.length) || '/'
            return NextResponse.redirect(
                new URL(`${stripped}${nextUrl.search}`, req.url),
            )
        }

        const isStorefrontPath =
            path === '/' ||
            path === '/checkout' ||
            /^\/[^/]+$/.test(path)

        if (!isStorefrontPath) {
            return NextResponse.redirect(new URL('/', req.url))
        }

        const rewritePath =
            path === '/' ? AWIC_STOREFRONT_PATH : `${AWIC_STOREFRONT_PATH}${path}`
        const rewriteUrl = nextUrl.clone()
        rewriteUrl.pathname = rewritePath
        return NextResponse.rewrite(rewriteUrl)
    }

    const isSignedIn = isSessionActive(req.auth)

    const isApiAuthRoute = nextUrl.pathname.startsWith(apiAuthPrefix)
    const isNestApiRoute = nextUrl.pathname.startsWith('/api/v1')
    const isSocketRoute = nextUrl.pathname.startsWith('/socket.io')
    const isPublicRoute =
        publicRoutes.includes(nextUrl.pathname) ||
        nextUrl.pathname.startsWith(`${MARKETPLACE_PATH}/`) ||
        nextUrl.pathname.startsWith(`${AWIC_STOREFRONT_PATH}/`)
    const isAuthRoute = authRoutes.includes(nextUrl.pathname)

    /** NextAuth handlers, Nest rewrite (`/api/v1`), and Socket.IO proxy skip page auth. */
    if (isApiAuthRoute || isNestApiRoute || isSocketRoute) return

    if (isAuthRoute) {
        if (isSignedIn) {
            return Response.redirect(
                new URL(appConfig.authenticatedEntryPath, nextUrl),
            )
        }
        return
    }

    if (!isSignedIn && !isPublicRoute) {
        let callbackUrl = nextUrl.pathname
        if (nextUrl.search) {
            callbackUrl += nextUrl.search
        }

        return Response.redirect(
            new URL(
                `${appConfig.unAuthenticatedEntryPath}?${REDIRECT_URL_KEY}=${callbackUrl}`,
                nextUrl,
            ),
        )
    }
})

export const config = {
    matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api)(.*)'],
}
