import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { OTP_LENGTH } from './shop-auth.constants'

const HINT_SEPARATOR = ':'
const HINT_HEX_LENGTH = 8

export function generateOtpCode(): string {
    return String(randomInt(100000, 1000000))
}

function otpSecret(): string {
    const secret = process.env.EMAIL_OTP_SECRET?.trim()
    if (!secret || secret.length < 16) {
        if (process.env.NODE_ENV === 'test') {
            return 'test-email-otp-secret-min-16'
        }
        throw new Error('EMAIL_OTP_SECRET is not configured')
    }
    return secret
}

function digest(secret: string, value: string): string {
    return createHmac('sha256', secret).update(value).digest('hex')
}

function digitHint(
    secret: string,
    otpId: string,
    emailNormalized: string,
    index: number,
    digit: string,
): string {
    return digest(
        secret,
        `${otpId}:${emailNormalized}:digit:${index}:${digit}`,
    ).slice(0, HINT_HEX_LENGTH)
}

function safeEqualHex(a: string, b: string): boolean {
    const left = Buffer.from(a, 'hex')
    const right = Buffer.from(b, 'hex')
    return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * Full code hash plus one short HMAC per digit. The digit hints let the API
 * report which positions are wrong without storing the plain code.
 */
export function hashOtpCode(
    otpId: string,
    emailNormalized: string,
    code: string,
): string {
    const secret = otpSecret()
    const full = digest(secret, `${otpId}:${emailNormalized}:${code}`)
    const hints = Array.from({ length: OTP_LENGTH }, (_, index) =>
        digitHint(secret, otpId, emailNormalized, index, code[index] ?? ''),
    ).join('')
    return `${full}${HINT_SEPARATOR}${hints}`
}

export function verifyOtpHash(
    expectedHex: string,
    otpId: string,
    emailNormalized: string,
    code: string,
): boolean {
    const [full] = expectedHex.split(HINT_SEPARATOR)
    return safeEqualHex(
        digest(otpSecret(), `${otpId}:${emailNormalized}:${code}`),
        full ?? '',
    )
}

/** Wrong digit indexes. Empty when the stored hash predates digit hints. */
export function mismatchedOtpDigits(
    expectedHex: string,
    otpId: string,
    emailNormalized: string,
    code: string,
): number[] {
    const [, hints] = expectedHex.split(HINT_SEPARATOR)
    if (!hints || hints.length !== OTP_LENGTH * HINT_HEX_LENGTH) return []
    const secret = otpSecret()
    return Array.from({ length: OTP_LENGTH }, (_, index) => index).filter(
        (index) =>
            !safeEqualHex(
                hints.slice(
                    index * HINT_HEX_LENGTH,
                    (index + 1) * HINT_HEX_LENGTH,
                ),
                digitHint(
                    secret,
                    otpId,
                    emailNormalized,
                    index,
                    code[index] ?? '',
                ),
            ),
    )
}
