import { cache } from 'react'
import { resolveErpApiBaseUrl } from '@/configs/app.config'

export type PublicSettings = {
    maintenance_mode: boolean
    allow_user_signup: boolean
    default_user_role: string
    feature_sd_enabled: boolean
    feature_mm_enabled: boolean
    feature_fico_enabled: boolean
    feature_scm_enabled: boolean
    feature_crm_enabled: boolean
    feature_hcm_enabled: boolean
}

/** Used only when the backend is unreachable, so an outage doesn't lock everyone out of the UI. */
const FALLBACK: PublicSettings = {
    maintenance_mode: false,
    allow_user_signup: true,
    default_user_role: 'employee',
    feature_sd_enabled: true,
    feature_mm_enabled: true,
    feature_fico_enabled: true,
    feature_scm_enabled: true,
    feature_crm_enabled: true,
    feature_hcm_enabled: true,
}

/** Non-sensitive system flags from GET /system-settings/public, fetched once per request. */
const getPublicSettings = cache(async (): Promise<PublicSettings> => {
    try {
        const response = await fetch(`${resolveErpApiBaseUrl()}/system-settings/public`, {
            cache: 'no-store',
        })
        if (!response.ok) return FALLBACK
        return { ...FALLBACK, ...((await response.json()) as Partial<PublicSettings>) }
    } catch {
        return FALLBACK
    }
})

export default getPublicSettings
