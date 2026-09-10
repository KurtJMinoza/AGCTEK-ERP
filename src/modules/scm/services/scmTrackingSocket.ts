import { io, type Socket } from 'socket.io-client'
import appConfig from '@/configs/app.config'

/** Payload from Nest `TrackingGateway.emitVehiclePosition`. */
export type VehiclePositionEvent = {
    vehicleId: string
    plateNumber: string
    telematicsDeviceId: string | null
    latitude: number
    longitude: number
    speedKmh: number
    heading: number | null
    recordedAt: string
    gpsLogId: string
    odometerKm?: number
}

export type GeofenceLiveEvent = {
    id: string
    geofenceId: string
    geofenceCode: string
    geofenceName: string
    vehicleId: string
    detect: string
    latitude: number
    longitude: number
    detectedAt: string
}

export type ScmTrackingLiveStatus =
    | 'connecting'
    | 'live'
    | 'reconnecting'
    | 'offline'

let socket: Socket | null = null
let refCount = 0

/**
 * Shared Socket.IO client for `/scm-tracking` (fleet live GPS).
 * Ref-counted so Live Tracking hooks can share one connection.
 */
export function acquireScmTrackingSocket(): Socket {
    refCount += 1
    if (socket) return socket

    socket = io(`${appConfig.apiBaseUrl}/scm-tracking`, {
        path: '/socket.io',
        // WS first; polling fallback (Brave Shields often blocks pure WS).
        transports: ['websocket', 'polling'],
        withCredentials: true,
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 800,
        reconnectionDelayMax: 8_000,
        timeout: 12_000,
    })

    if (process.env.NODE_ENV === 'development') {
        socket.on('connect', () => {
            console.info(
                '[scm-tracking] connected',
                socket?.id,
                'via',
                socket?.io.engine.transport.name,
            )
        })
        socket.on('disconnect', (reason) => {
            console.warn('[scm-tracking] disconnect:', reason)
        })
        socket.on('connect_error', (err) => {
            console.warn('[scm-tracking] connect_error:', err.message)
        })
    }

    return socket
}

export function releaseScmTrackingSocket() {
    refCount = Math.max(0, refCount - 1)
    if (refCount > 0 || !socket) return
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
}
