'use client'

import { useEffect, useRef, useState } from 'react'
import {
    acquireScmTrackingSocket,
    releaseScmTrackingSocket,
    type GeofenceLiveEvent,
    type ScmTrackingLiveStatus,
    type VehiclePositionEvent,
} from '../services/scmTrackingSocket'

type UseScmTrackingSocketOptions = {
    onVehiclePosition?: (event: VehiclePositionEvent) => void
    onGeofenceEvent?: (event: GeofenceLiveEvent) => void
    enabled?: boolean
}

/**
 * Subscribes to Nest `/scm-tracking` Socket.IO live events.
 * Callbacks are stored in refs so the socket is not recreated every render.
 */
export function useScmTrackingSocket(
    options: UseScmTrackingSocketOptions = {},
) {
    const { enabled = true } = options
    const onVehiclePositionRef = useRef(options.onVehiclePosition)
    const onGeofenceEventRef = useRef(options.onGeofenceEvent)
    onVehiclePositionRef.current = options.onVehiclePosition
    onGeofenceEventRef.current = options.onGeofenceEvent

    const [status, setStatus] = useState<ScmTrackingLiveStatus>(
        enabled ? 'connecting' : 'offline',
    )
    const [transport, setTransport] = useState<string | null>(null)

    useEffect(() => {
        if (!enabled) {
            setStatus('offline')
            setTransport(null)
            return
        }

        const socket = acquireScmTrackingSocket()
        setStatus(socket.connected ? 'live' : 'connecting')
        if (socket.connected) {
            setTransport(socket.io.engine.transport.name)
        }

        const onConnect = () => {
            setStatus('live')
            setTransport(socket.io.engine.transport.name)
        }
        const onDisconnect = () => {
            setStatus('reconnecting')
            setTransport(null)
        }
        const onConnectError = () => {
            setStatus((current) =>
                current === 'live' ? 'reconnecting' : 'connecting',
            )
        }
        const onUpgrade = () => {
            setTransport(socket.io.engine.transport.name)
        }

        const handlePosition = (event: VehiclePositionEvent) => {
            onVehiclePositionRef.current?.(event)
        }
        const handleGeofence = (event: GeofenceLiveEvent) => {
            onGeofenceEventRef.current?.(event)
        }

        socket.on('connect', onConnect)
        socket.on('disconnect', onDisconnect)
        socket.on('connect_error', onConnectError)
        socket.io.engine.on('upgrade', onUpgrade)
        socket.on('vehicle.position', handlePosition)
        socket.on('geofence.event', handleGeofence)

        return () => {
            socket.off('connect', onConnect)
            socket.off('disconnect', onDisconnect)
            socket.off('connect_error', onConnectError)
            socket.io.engine.off('upgrade', onUpgrade)
            socket.off('vehicle.position', handlePosition)
            socket.off('geofence.event', handleGeofence)
            releaseScmTrackingSocket()
        }
    }, [enabled])

    return { status, transport }
}
