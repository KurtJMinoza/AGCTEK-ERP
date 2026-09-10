import Constants from 'expo-constants'
import { Platform } from 'react-native'
import type { AuthUser, Driver, Trip } from '../types'

/**
 * Nest API base URL.
 * - Android emulator: 10.0.2.2 → host localhost
 * - iOS simulator / web: localhost
 * - Physical device: set EXPO_PUBLIC_API_URL to your LAN IP
 */
function resolveApiBase(): string {
    const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim()
    if (fromEnv) return fromEnv.replace(/\/$/, '')

    const hostUri =
        Constants.expoConfig?.hostUri ??
        Constants.linkingUri ??
        ''
    // Prefer same host as Metro when on a device
    const metroHost = hostUri.split(':')[0]
    if (
        metroHost &&
        metroHost !== 'localhost' &&
        metroHost !== '127.0.0.1' &&
        !metroHost.includes('exp.direct')
    ) {
        return `http://${metroHost}:3001`
    }

    if (Platform.OS === 'android') {
        return 'http://10.0.2.2:3001'
    }
    return 'http://localhost:3001'
}

export const API_BASE = resolveApiBase()

async function request<T>(
    path: string,
    init?: RequestInit,
): Promise<T> {
    const url = `${API_BASE}${path}`
    const res = await fetch(url, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(init?.headers ?? {}),
        },
    })

    const text = await res.text()
    let data: unknown = null
    if (text) {
        try {
            data = JSON.parse(text)
        } catch {
            data = text
        }
    }

    if (!res.ok) {
        const message =
            typeof data === 'object' &&
            data &&
            'message' in data &&
            (data as { message?: string | string[] }).message
                ? Array.isArray((data as { message: string | string[] }).message)
                    ? (data as { message: string[] }).message.join(', ')
                    : String((data as { message: string }).message)
                : `Request failed (${res.status})`
        throw new Error(message)
    }

    return data as T
}

export async function apiSignIn(
    userName: string,
    password: string,
): Promise<AuthUser> {
    return request<AuthUser>('/auth/sign-in', {
        method: 'POST',
        body: JSON.stringify({ userName, password }),
    })
}

export async function apiGetDriverMe(userId: string): Promise<Driver> {
    return request<Driver>(
        `/scm/drivers/me?userId=${encodeURIComponent(userId)}`,
    )
}

export async function apiGetActiveTrip(
    driverId: string,
): Promise<Trip | null> {
    return request<Trip | null>(
        `/scm/trips/active?driverId=${encodeURIComponent(driverId)}`,
    )
}

export async function apiGetTrip(tripId: string): Promise<Trip> {
    return request<Trip>(`/scm/trips/${encodeURIComponent(tripId)}`)
}

export async function apiStartTrip(tripId: string): Promise<Trip> {
    return request<Trip>(`/scm/trips/${encodeURIComponent(tripId)}/start`, {
        method: 'PATCH',
        body: JSON.stringify({}),
    })
}

export async function apiArriveStop(
    tripId: string,
    stopId: string,
): Promise<Trip> {
    return request<Trip>(
        `/scm/trips/${encodeURIComponent(tripId)}/stops/${encodeURIComponent(stopId)}/arrive`,
        { method: 'PATCH', body: JSON.stringify({}) },
    )
}

export async function apiSaveStopPod(
    tripId: string,
    stopId: string,
    body: {
        podSignatureUrl?: string | null
        podPhotoUrl?: string | null
        podNotes?: string | null
        notes?: string | null
    },
): Promise<Trip> {
    return request<Trip>(
        `/scm/trips/${encodeURIComponent(tripId)}/stops/${encodeURIComponent(stopId)}/pod`,
        { method: 'PATCH', body: JSON.stringify(body) },
    )
}

export async function apiDeliverStop(
    tripId: string,
    stopId: string,
    body: {
        outcome?: 'DELIVERED' | 'FAILED'
        podSignatureUrl?: string | null
        podPhotoUrl?: string | null
        podNotes?: string | null
        failureReason?: string | null
        notes?: string | null
    },
): Promise<Trip> {
    return request<Trip>(
        `/scm/trips/${encodeURIComponent(tripId)}/stops/${encodeURIComponent(stopId)}/deliver`,
        { method: 'PATCH', body: JSON.stringify(body) },
    )
}

/** Optional in-trip GPS → existing tracking ping (dispatcher map). */
export async function apiTrackingPing(body: {
    vehicleId: string
    latitude: number
    longitude: number
    tripId?: string
    speedKmh?: number
}): Promise<unknown> {
    return request('/scm/tracking/ping', {
        method: 'POST',
        body: JSON.stringify(body),
    })
}
