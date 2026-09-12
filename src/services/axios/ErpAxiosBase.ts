import axios from 'axios'
import { getSession } from 'next-auth/react'
import appConfig from '@/configs/app.config'

const ErpAxiosBase = axios.create({
    timeout: 60000,
    baseURL: `${appConfig.apiBaseUrl}/api/v1`,
    withCredentials: true,
})

ErpAxiosBase.interceptors.request.use(async (config) => {
    if (config.data instanceof FormData) {
        config.headers.delete('Content-Type')
    }

    const method = config.method?.toUpperCase()
    if (method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        try {
            const session = await getSession()
            const userId = session?.user?.id
            if (userId) {
                config.headers.set('X-User-Id', userId)
            }
        } catch {
            // Session unavailable (SSR/build) — backend guard will reject mutations without header.
        }
    }

    return config
})

export default ErpAxiosBase
