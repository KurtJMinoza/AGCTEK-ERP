import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

export function generateOtpCode(): string {
    return String(randomInt(100000, 1000000))
}

export function hashOtpCode(
    otpId: string,
    emailNormalized: string,
    code: string,
): string {
    const secret = process.env.EMAIL_OTP_SECRET?.trim()
    if (!secret || secret.length < 16) {
        if (process.env.NODE_ENV === 'test') {
            return createHmac('sha256', 'test-email-otp-secret-min-16')
                .update(`${otpId}:${emailNormalized}:${code}`)
                .digest('hex')
        }
        throw new Error('EMAIL_OTP_SECRET is not configured')
    }
    return createHmac('sha256', secret)
        .update(`${otpId}:${emailNormalized}:${code}`)
        .digest('hex')
}

export function verifyOtpHash(
    expectedHex: string,
    otpId: string,
    emailNormalized: string,
    code: string,
): boolean {
    const actual = hashOtpCode(otpId, emailNormalized, code)
    const a = Buffer.from(actual, 'hex')
    const b = Buffer.from(expectedHex, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
}
