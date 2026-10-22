export const OTP_LENGTH = 6
export const OTP_TTL_MS = 10 * 60 * 1000
export const OTP_RESEND_DELAY_MS = 60 * 1000
export const OTP_MAX_ATTEMPTS = 5
export const OTP_MAX_REQUESTS_PER_EMAIL = 3
export const OTP_REQUEST_WINDOW_MS = 15 * 60 * 1000
export const OTP_MAX_REQUESTS_PER_IP = Number(
    process.env.SHOP_OTP_MAX_REQUESTS_PER_IP || 10,
)

export const AUTH_PROVIDER_GOOGLE = 'GOOGLE'
export const AUTH_PROVIDER_EMAIL_OTP = 'EMAIL_OTP'

export const GENERIC_OTP_SENT_MESSAGE =
    'If this Gmail address can receive messages, a verification code has been sent.'

/** Email OTP is sign-in only; new shop accounts must use Google OAuth. */
export const SHOP_NO_ACCOUNT_USE_GOOGLE =
    'No shop account found for this email. Use Continue with Google to create one.'

export const SHOP_ACCOUNT_ALREADY_EXISTS =
    'An account with this email already exists. Sign in with Google or request an email verification code.'
