import axios from 'axios'

export function getApiErrorMessage(err: unknown, fallback: string) {
    if (axios.isAxiosError(err)) {
        const message = err.response?.data?.message
        if (typeof message === 'string' && message.trim()) return message
        if (Array.isArray(message) && message.length > 0) {
            return message.map(String).join(', ')
        }
    }
    if (err instanceof Error && err.message) return err.message
    return fallback
}
