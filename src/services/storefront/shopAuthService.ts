import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type { RetailClientSession } from './retailClientService'

type ApiClient = RetailClientSession['client'] & { email: string }

type ShopAuthSessionResponse = {
    client: ApiClient
    token: string
    expiresAt: string
    needsProfile?: boolean
    redirectTo?: string
    message?: string
}

export type ShopEmailRequestResult = { message: string }

/** Rejected OTP carries the exact wrong digit positions from the backend. */
export class ShopOtpMismatchError extends Error {
    readonly mismatchedDigits: number[]

    constructor(message: string, mismatchedDigits: number[]) {
        super(message)
        this.name = 'ShopOtpMismatchError'
        this.mismatchedDigits = mismatchedDigits
    }
}

function readMismatchedDigits(error: unknown): number[] | null {
    const data = (
        error as {
            response?: { data?: { mismatchedDigits?: unknown } }
        }
    )?.response?.data
    const value = data?.mismatchedDigits
    if (!Array.isArray(value)) return null
    return value.filter(
        (digit): digit is number =>
            typeof digit === 'number' &&
            Number.isInteger(digit) &&
            digit >= 0 &&
            digit < 6,
    )
}

export const normalizeGmailInput = (raw: string) => raw.trim().toLowerCase()

export const isGmailInput = (normalized: string) =>
    /^[^\s@]+@gmail\.com$/.test(normalized)

export const GMAIL_VALIDATION_MESSAGE =
    'Please use a Gmail address ending in @gmail.com.'

export type ShopAuthPublicConfig = {
    googleClientId: string | null
    googleSignInEnabled: boolean
}

export async function fetchShopAuthPublicConfig(): Promise<ShopAuthPublicConfig> {
    const { data } = await ErpAxiosBase.get<ShopAuthPublicConfig>(
        '/shop/auth/public-config',
    )
    return data
}

export async function requestShopEmailCode(
    email: string,
): Promise<ShopEmailRequestResult> {
    const { data } = await ErpAxiosBase.post<ShopEmailRequestResult>(
        '/shop/auth/email/request-code',
        { email: normalizeGmailInput(email) },
    )
    return data
}

export async function verifyShopEmailCode(payload: {
    email: string
    code: string
    firstName?: string
}): Promise<RetailClientSession & { needsProfile?: boolean }> {
    let data: ShopAuthSessionResponse
    try {
        const response = await ErpAxiosBase.post<ShopAuthSessionResponse>(
            '/shop/auth/email/verify-code',
            {
                email: normalizeGmailInput(payload.email),
                code: payload.code.trim(),
                ...(payload.firstName?.trim()
                    ? { firstName: payload.firstName.trim() }
                    : {}),
            },
        )
        data = response.data
    } catch (error) {
        const digits = readMismatchedDigits(error)
        if (digits !== null) {
            const message = (
                error as { response?: { data?: { message?: string } } }
            )?.response?.data?.message
            throw new ShopOtpMismatchError(
                message || 'The verification code is incorrect.',
                digits,
            )
        }
        throw error
    }
    return {
        client: data.client,
        token: data.token,
        expiresAt: data.expiresAt,
        needsProfile: data.needsProfile,
    }
}

export async function signInWithGoogleCredential(
    credential: string,
): Promise<RetailClientSession & { needsProfile?: boolean }> {
    const { data } = await ErpAxiosBase.post<ShopAuthSessionResponse>(
        '/shop/auth/google',
        { credential },
    )
    return {
        client: data.client,
        token: data.token,
        expiresAt: data.expiresAt,
        needsProfile: data.needsProfile,
    }
}

export async function shopAuthLogout(token: string): Promise<void> {
    await ErpAxiosBase.post(
        '/shop/auth/logout',
        {},
        { headers: { Authorization: `Bearer ${token}` } },
    )
}
