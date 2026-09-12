import axios from 'axios'

export function getApiErrorMessage(err: unknown, fallback = 'Operation failed'): string {
    if (axios.isAxiosError(err)) {
        if (!err.response) {
            return 'Cannot reach the API server. Make sure the backend is running on port 3001.'
        }
        const message = err.response.data?.message
        if (typeof message === 'string' && message.trim()) return message
        if (Array.isArray(message) && message.length > 0) {
            return message.map(String).join(', ')
        }
    }
    if (err instanceof Error && err.message.trim()) return err.message
    return fallback
}
