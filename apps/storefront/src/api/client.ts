import Constants from 'expo-constants'
import { Platform } from 'react-native'
import type { CommerceApi } from './commerceApi'
import { HttpCommerceApi } from './httpCommerceApi'
import { MockCommerceApi } from './mockCommerceApi'

/**
 * Nest API base URL.
 * - Android emulator: 10.0.2.2 → host localhost
 * - iOS simulator / web: localhost
 * - Physical device: set EXPO_PUBLIC_API_URL to your LAN IP
 */
function resolveApiBase(): string {
    const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim()
    if (fromEnv) return fromEnv.replace(/\/$/, '')

    const hostUri = Constants.expoConfig?.hostUri ?? Constants.linkingUri ?? ''
    const metroHost = hostUri.split(':')[0]
    if (
        metroHost &&
        metroHost !== 'localhost' &&
        metroHost !== '127.0.0.1' &&
        !metroHost.includes('exp.direct')
    ) {
        return `http://${metroHost}:3011`
    }

    if (Platform.OS === 'android') {
        return 'http://10.0.2.2:3011'
    }
    return 'http://localhost:3011'
}

export const API_BASE = resolveApiBase()

/**
 * Next.js origin that serves uploaded product photos (`/uploads/...`).
 * Defaults to the API host on the ERP web dev port (3010).
 */
export const WEB_BASE = (
    process.env.EXPO_PUBLIC_WEB_URL?.trim() ||
    API_BASE.replace(/:3011$/, ':3010')
).replace(/\/$/, '')

/** Live ERP data unless EXPO_PUBLIC_USE_MOCK_API=true (offline demo). */
export const USE_MOCK_API =
    process.env.EXPO_PUBLIC_USE_MOCK_API?.trim().toLowerCase() === 'true'

export const commerceApi: CommerceApi = USE_MOCK_API
    ? new MockCommerceApi()
    : new HttpCommerceApi(API_BASE, WEB_BASE)
