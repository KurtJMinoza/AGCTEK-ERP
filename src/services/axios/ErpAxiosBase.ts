import axios from 'axios'
import { getSession } from 'next-auth/react'
import { resolveErpApiBaseUrl } from '@/configs/app.config'
import { MAINTENANCE_PATH } from '@/constants/route.constant'

const MAINTENANCE_ERROR_CODE = 'SYSTEM_MAINTENANCE'
const SESSION_CACHE_MS = 5000

const ErpAxiosBase = axios.create({
    timeout: 60000,
    withCredentials: true,
})

let cachedUserId: { value: string; at: number } | null = null
let pendingUserId: Promise<string | undefined> | null = null

/** Shares one session lookup across concurrent requests; anonymous results are never cached. */
async function resolveUserId(): Promise<string | undefined> {
    if (cachedUserId && Date.now() - cachedUserId.at < SESSION_CACHE_MS) {
        return cachedUserId.value
    }
    if (!pendingUserId) {
        pendingUserId = getSession()
            .then((session) => {
                const userId = session?.user?.id
                cachedUserId = userId ? { value: userId, at: Date.now() } : null
                return userId
            })
            .finally(() => {
                pendingUserId = null
            })
    }
    return pendingUserId
}

ErpAxiosBase.interceptors.request.use(async (config) => {
    config.baseURL = resolveErpApiBaseUrl()

    if (config.data instanceof FormData) {
        config.headers.delete('Content-Type')
    }

    if (typeof window !== 'undefined' && !config.headers.has('X-User-Id')) {
        try {
            const userId = await resolveUserId()
            if (userId) {
                config.headers.set('X-User-Id', userId)
            }
        } catch {
            // Session unavailable — backend guards reject requests that need an actor.
        }
    }

    return config
})

ErpAxiosBase.interceptors.response.use(
    (response) => response,
    (error) => {
        if (
            typeof window !== 'undefined' &&
            error?.response?.status === 503 &&
            error.response.data?.code === MAINTENANCE_ERROR_CODE &&
            window.location.pathname !== MAINTENANCE_PATH
        ) {
            window.location.replace(MAINTENANCE_PATH)
        }
        return Promise.reject(error)
    },
)

export default ErpAxiosBase
