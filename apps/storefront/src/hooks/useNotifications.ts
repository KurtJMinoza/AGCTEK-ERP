import { useCallback, useEffect, useRef, useState } from 'react'
import { commerceApi } from '../api/client'
import type { Notification } from '../types'

type UseNotificationsResult = {
    notifications: Notification[]
    unreadCount: number
    loading: boolean
    refreshing: boolean
    error: string | null
    refresh: () => Promise<void>
    markRead: (id: string) => Promise<void>
    markAllRead: () => Promise<void>
}

export function useNotifications(userId?: string | null): UseNotificationsResult {
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const mounted = useRef(true)

    useEffect(() => {
        mounted.current = true
        return () => { mounted.current = false }
    }, [])

    const load = useCallback(
        async (silent = false) => {
            if (!silent) setLoading(true)
            else setRefreshing(true)
            setError(null)
            try {
                const items = await commerceApi.getNotifications(userId ?? undefined)
                if (mounted.current) setNotifications(items)
            } catch (err) {
                if (mounted.current) {
                    setError(err instanceof Error ? err.message : 'Failed to load notifications')
                }
            } finally {
                if (mounted.current) {
                    setLoading(false)
                    setRefreshing(false)
                }
            }
        },
        [userId],
    )

    useEffect(() => {
        void load()
    }, [load])

    const refresh = useCallback(() => load(true), [load])

    const markRead = useCallback(async (id: string) => {
        // Optimistic update
        setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
        )
        try {
            await commerceApi.markNotificationRead(id)
        } catch {
            // Silently ignore — notification is already visually read
        }
    }, [])

    const markAllRead = useCallback(async () => {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
        try {
            await commerceApi.markAllNotificationsRead(userId ?? undefined)
        } catch {
            // Silently ignore
        }
    }, [userId])

    const unreadCount = notifications.filter((n) => !n.isRead).length

    return { notifications, unreadCount, loading, refreshing, error, refresh, markRead, markAllRead }
}
