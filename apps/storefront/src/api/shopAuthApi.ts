import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { API_BASE } from './client'
import { CommerceApiError } from './commerceApi'
import type { Customer } from '../types'

/** Same shop auth contract as the live /shop marketplace (`shop-auth.controller.ts`). */
const API_PREFIX = '/api/v1'

export type ShopAuthSession = {
    client: Customer
    token: string
    expiresAt: string
    needsProfile?: boolean
}

export type ShopAuthPublicConfig = {
    googleClientId: string | null
    googleSignInEnabled: boolean
}

export const normalizeGmailInput = (raw: string) => raw.trim().toLowerCase()
export const isGmailInput = (normalized: string) =>
    /^[^\s@]+@gmail\.com$/.test(normalized)
export const GMAIL_VALIDATION_MESSAGE =
    'Use a Gmail address ending in @gmail.com.'

type ApiClient = {
    customerId: string
    email?: string | null
    firstName?: string | null
    fullName?: string | null
    phone?: string | null
    addressLine1?: string | null
    city?: string | null
    region?: string | null
    postalCode?: string | null
    country?: string | null
}

type ApiSession = {
    client: ApiClient
    token: string
    expiresAt: string
    needsProfile?: boolean
    message?: string
}

const toCustomer = (client: ApiClient): Customer => ({
    customerId: client.customerId,
    fullName: client.fullName || client.firstName || '',
    email: client.email || '',
    phone: client.phone || '',
    addressLine1: client.addressLine1 || '',
    city: client.city || '',
    region: client.region || '',
    postalCode: client.postalCode || '',
    country: client.country || 'PH',
})

const toSession = (data: ApiSession): ShopAuthSession => ({
    client: toCustomer(data.client),
    token: data.token,
    expiresAt: data.expiresAt,
    needsProfile: data.needsProfile,
})

const messageOf = (body: unknown, fallback: string) => {
    const message = (body as { message?: string | string[] } | null)?.message
    if (Array.isArray(message)) return message.join('; ')
    if (typeof message === 'string' && message.trim()) return message.trim()
    return fallback
}

async function call<T>(path: string, body?: unknown): Promise<T> {
    let res: Response
    try {
        res = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        })
    } catch {
        throw new CommerceApiError(
            `Can't reach the store right now (${API_BASE}). Check your connection and try again.`,
            'NETWORK',
        )
    }

    const raw = await res.text()
    let parsed: unknown = null
    try {
        parsed = raw ? JSON.parse(raw) : null
    } catch {
        parsed = raw
    }
    if (!res.ok) {
        const code =
            res.status === 401
                ? 'UNAUTHORIZED'
                : res.status === 409
                  ? 'CONFLICT'
                  : res.status >= 500
                    ? 'NETWORK'
                    : 'VALIDATION'
        const body = parsed as { mismatchedDigits?: unknown } | null
        const digits = Array.isArray(body?.mismatchedDigits)
            ? body.mismatchedDigits.filter(
                  (digit): digit is number =>
                      typeof digit === 'number' &&
                      Number.isInteger(digit) &&
                      digit >= 0 &&
                      digit < 6,
              )
            : undefined
        throw new CommerceApiError(
            messageOf(parsed, `Request failed (${res.status})`),
            code,
            digits,
        )
    }
    return parsed as T
}

export async function fetchShopAuthPublicConfig(): Promise<ShopAuthPublicConfig> {
    let res: Response
    try {
        res = await fetch(`${API_BASE}${API_PREFIX}/shop/auth/public-config`, {
            headers: { Accept: 'application/json' },
        })
    } catch {
        throw new CommerceApiError(
            "Can't reach the store right now.",
            'NETWORK',
        )
    }
    if (!res.ok)
        throw new CommerceApiError('Unable to load sign-in options.', 'NETWORK')
    const data = (await res.json()) as ShopAuthPublicConfig
    return {
        googleClientId: data.googleClientId ?? null,
        googleSignInEnabled: Boolean(data.googleSignInEnabled),
    }
}

/** Step 1 of Gmail auth: backend sends the six-digit code to the address. */
export async function requestShopEmailCode(email: string): Promise<string> {
    const data = await call<{ message?: string }>(
        '/shop/auth/email/request-code',
        {
            email: normalizeGmailInput(email),
        },
    )
    return data.message ?? 'Verification code sent. Check your Gmail.'
}

/**
 * Step 2 of Gmail auth. `firstName` creates the account for a new Gmail address.
 * Backend returns `needsProfile` when an existing shopper still lacks a name.
 */
export async function verifyShopEmailCode(payload: {
    email: string
    code: string
    firstName?: string
}): Promise<ShopAuthSession> {
    const data = await call<ApiSession>('/shop/auth/email/verify-code', {
        email: normalizeGmailInput(payload.email),
        code: payload.code.trim(),
        ...(payload.firstName?.trim()
            ? { firstName: payload.firstName.trim() }
            : {}),
    })
    return toSession(data)
}

export async function signInWithGoogleCredential(
    credential: string,
): Promise<ShopAuthSession> {
    return toSession(
        await call<ApiSession>('/shop/auth/google', { credential }),
    )
}

const readParam = (url: string, key: string): string | null => {
    const match = url.match(new RegExp(`(?:[#?&])${key}=([^&]+)`))
    return match ? decodeURIComponent(match[1]) : null
}

/**
 * Google Identity Services browser flow ported to Expo WebBrowser.
 * Register `redirectUri` under Authorized redirect URIs for the OAuth client.
 */
export async function signInWithGoogle(
    clientId: string,
): Promise<ShopAuthSession> {
    const redirectUri = Linking.createURL('google-callback')
    const url =
        'https://accounts.google.com/o/oauth2/v2/auth?' +
        new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: 'id_token',
            scope: 'openid email profile',
            nonce: Math.random().toString(36).slice(2),
        }).toString()

    const result = await WebBrowser.openAuthSessionAsync(url, redirectUri)
    if (result.type !== 'success') {
        throw new CommerceApiError(
            'Google sign-in was cancelled.',
            'VALIDATION',
        )
    }

    const credential = readParam(result.url, 'id_token')
    if (!credential) {
        const reason =
            readParam(result.url, 'error_description') ??
            readParam(result.url, 'error') ??
            'No Google credential was returned.'
        throw new CommerceApiError(reason, 'VALIDATION')
    }
    return signInWithGoogleCredential(credential)
}

export async function logoutShopSession(token: string): Promise<void> {
    try {
        await fetch(`${API_BASE}${API_PREFIX}/shop/auth/logout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: '{}',
        })
    } catch {
        // Local sign-out still succeeds when the server is unreachable.
    }
}
