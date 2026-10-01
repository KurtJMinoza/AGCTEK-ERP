import { isAxiosError } from 'axios'

/** Turns an ERP API failure into an Error carrying the backend's validation message. */
export function toApiError(error: unknown, fallback: string): Error {
    if (isAxiosError(error)) {
        const message = error.response?.data?.message
        if (Array.isArray(message)) return new Error(message.join('; '))
        if (typeof message === 'string') return new Error(message)
        if (!error.response) {
            return new Error(`${fallback}: ERP backend is unreachable`)
        }
        if (error.response.status >= 500) {
            return new Error(
                `${fallback}: ERP backend error (${error.response.status}). Check that the API server is running.`,
            )
        }
    }
    return error instanceof Error ? error : new Error(fallback)
}
