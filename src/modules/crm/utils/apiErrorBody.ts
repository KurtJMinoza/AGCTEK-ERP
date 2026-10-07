import axios from 'axios'

/** Structured error body (e.g. `{ code, message, quotationId }` from SD quotation 409s). */
export function apiErrorBody<T extends object = Record<string, unknown>>(
    err: unknown,
): (Partial<T> & { code?: string }) | null {
    if (!axios.isAxiosError(err)) return null
    const data = err.response?.data
    return data && typeof data === 'object' ? (data as Partial<T> & { code?: string }) : null
}
