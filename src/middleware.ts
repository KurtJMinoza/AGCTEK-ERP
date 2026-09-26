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
    AWIC_STOREFRONT_PATH,
    isAwicStorefrontHost,
} from '@/modules/storefront/retail/brand'

const { auth } = NextAuth(authConfig)

const publicRoutes = Object.entries(_publicRoutes).map(([key]) => key)
const authRoutes = Object.entries(_authRoutes).map(([key]) => key)

const apiAuthPrefix = `${appConfig.apiPrefix}/auth`

export default auth((req) => {
    const { nextUrl } = req
    const hostname = (req.headers.get('host') ?? '').split(':')[0] ?? ''
    const onAwicHost = isAwicStorefrontHost(hostname)

    /**
     * Dedicated AWIC host (e.g. awic.localhost / awic.com):
     * - `/` serves the storefront
     * - clean paths rewrite into `/awic/*`
     * - ERP paths are not exposed on this host
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

        // Prefer clean URLs: /awic → /
        if (path === AWIC_STOREFRONT_PATH) {
            return NextResponse.redirect(new URL(`/${nextUrl.search}`, req.url))
        }
        if (path.startsWith(`${AWIC_STOREFRONT_PATH}/`)) {
            const stripped = path.slice(AWIC_STOREFRONT_PATH.length) || '/'
            return NextResponse.redirect(
                new URL(`${stripped}${nextUrl.search}`, req.url),
            )
        }

        // Only storefront surfaces on this host
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

    const isSignedIn = !!req.auth

    const isApiAuthRoute = nextUrl.pathname.startsWith(apiAuthPrefix)
    const isPublicRoute =
        publicRoutes.includes(nextUrl.pathname) ||
        nextUrl.pathname.startsWith(`${AWIC_STOREFRONT_PATH}/`)
    const isAuthRoute = authRoutes.includes(nextUrl.pathname)

    /** Skip auth middleware for api routes */
    if (isApiAuthRoute) return

    if (isAuthRoute) {
        if (isSignedIn) {
            /** Redirect to authenticated entry path if signed in & path is auth route */
            return Response.redirect(
                new URL(appConfig.authenticatedEntryPath, nextUrl),
            )
        }
        return
    }

    /** Redirect to authenticated entry path if signed in & path is public route */
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

    /** Uncomment this and `import { protectedRoutes } from '@/configs/routes.config'` if you want to enable role based access */
    // if (isSignedIn && nextUrl.pathname !== '/access-denied' && !nextUrl.pathname.startsWith(appConfig.apiPrefix)) {
    //     const routeMeta = protectedRoutes[nextUrl.pathname]
    //     const existingRoute = routeMeta
    //     const includedRole = routeMeta?.authority.some((role) => req.auth?.user?.authority.includes(role))
    //     if (existingRoute && !includedRole) {
    //         return Response.redirect(
    //             new URL('/access-denied', nextUrl),
    //         )
    //     }
    // }
})

export const config = {
    matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api)(.*)'],
}
