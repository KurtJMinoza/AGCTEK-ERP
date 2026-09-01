'use client'

import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import appConfig from '@/configs/app.config'
import type { NotificationItem } from '@/@types/notification'

type UseNotificationSocketOptions = {
    onNotification?: (notification: NotificationItem) => void
    onCount?: (count: number) => void
}

const useNotificationSocket = ({
    onNotification,
    onCount,
}: UseNotificationSocketOptions) => {
    const onNotificationRef = useRef(onNotification)
    const onCountRef = useRef(onCount)

    useEffect(() => {
        onNotificationRef.current = onNotification
    }, [onNotification])

    useEffect(() => {
        onCountRef.current = onCount
    }, [onCount])

    useEffect(() => {
        const socket = io(`${appConfig.apiBaseUrl}/notifications`, {
            transports: ['websocket'],
            withCredentials: true,
        })

        socket.on('notification:new', (notification: NotificationItem) => {
            onNotificationRef.current?.(notification)
        })

        socket.on('notifications:count', ({ count }: { count: number }) => {
            onCountRef.current?.(count)
        })

        return () => {
            socket.disconnect()
        }
    }, [])
}

export default useNotificationSocket
