'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    HiOutlineBell,
    HiOutlineCheck,
    HiOutlineCheckCircle,
    HiOutlineInformationCircle,
    HiOutlineXCircle,
} from 'react-icons/hi'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import {
    apiGetNotificationCount,
    apiGetNotificationList,
    apiMarkAllNotificationsAsRead,
    apiMarkNotificationAsRead,
} from '@/services/CommonService'
import {
    fetchShopperNotificationCount,
    fetchShopperNotifications,
    markAllShopperNotificationsRead,
    markShopperNotificationRead,
} from '@/services/storefront/retailClientService'
import { useMarketplace } from '../MarketplaceProvider'
import useCurrentSession from '@/utils/hooks/useCurrentSession'
import type { NotificationItem } from '@/@types/notification'

export default function MarketplaceNotificationBell() {
    const router = useRouter()
    const { signedInClient, sessionToken, openOrders } = useMarketplace()
    const { session } = useCurrentSession()
    const shopperToken = signedInClient ? sessionToken : null
    const activeUserId = session?.user?.id

    const [isOpen, setIsOpen] = useState(false)
    const [notifications, setNotifications] = useState<NotificationItem[]>([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [loading, setLoading] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const fetchCount = useCallback(async () => {
        try {
            if (shopperToken) {
                setUnreadCount(await fetchShopperNotificationCount(shopperToken))
                return
            }
            const data = await apiGetNotificationCount(
                activeUserId ? { userId: activeUserId } : undefined,
            )
            setUnreadCount(data.count ?? 0)
        } catch {
            // Silently fall back
        }
    }, [shopperToken, activeUserId])

    const fetchNotifications = useCallback(async () => {
        setLoading(true)
        try {
            const data = shopperToken
                ? await fetchShopperNotifications(shopperToken, 20)
                : await apiGetNotificationList({
                      limit: 20,
                      ...(activeUserId ? { userId: activeUserId } : {}),
                  })
            setNotifications(data || [])
            const unread = (data || []).filter(
                (item) => !item.isRead && !item.readed,
            ).length
            setUnreadCount(unread)
        } catch {
            // Silently fall back
        } finally {
            setLoading(false)
        }
    }, [shopperToken, activeUserId])

    useEffect(() => {
        let mounted = true
        fetchCount()
        const timer = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return
            if (mounted) fetchCount()
        }, 30000)
        return () => {
            mounted = false
            clearInterval(timer)
        }
    }, [fetchCount])

    useEffect(() => {
        if (isOpen) {
            fetchNotifications()
        }
    }, [isOpen, fetchNotifications])

    // Close dropdown on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false)
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside)
            return () => {
                document.removeEventListener('mousedown', handleClickOutside)
            }
        }
    }, [isOpen])

    const handleItemClick = async (item: NotificationItem) => {
        const isUnread = !item.isRead && !item.readed
        if (isUnread) {
            // Optimistically update
            setNotifications((prev) =>
                prev.map((n) =>
                    n.id === item.id
                        ? { ...n, isRead: true, readed: true }
                        : n,
                ),
            )
            setUnreadCount((c) => Math.max(0, c - 1))
            try {
                if (shopperToken) {
                    await markShopperNotificationRead(shopperToken, item.id)
                } else {
                    await apiMarkNotificationAsRead(item.id)
                }
            } catch {
                // Ignore API failure
            }
        }

        // Tracking / order notices carry an in-app path (e.g. /shop/track/<token>).
        if (item.location?.startsWith('/')) {
            setIsOpen(false)
            router.push(item.location)
            return
        }

        // If it's an order notification, offer navigation to orders
        if (
            item.title?.toLowerCase().includes('order') ||
            item.target?.startsWith('SO-') ||
            item.description?.toLowerCase().includes('order')
        ) {
            setIsOpen(false)
            if (openOrders) {
                openOrders()
            } else {
                router.push('/orders')
            }
        }
    }

    const handleMarkAllRead = async () => {
        setNotifications((prev) =>
            prev.map((n) => ({ ...n, isRead: true, readed: true })),
        )
        setUnreadCount(0)
        try {
            if (shopperToken) {
                await markAllShopperNotificationsRead(shopperToken)
            } else {
                await apiMarkAllNotificationsAsRead()
            }
        } catch {
            // Ignore API failure
        }
    }

    const bellButton = (
        <button
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:text-shop-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-shop-500 focus-visible:ring-offset-2"
            aria-label={`Notifications, ${unreadCount} unread`}
        >
            <HiOutlineBell className="text-xl" />
        </button>
    )

    return (
        <div className="relative inline-block" ref={dropdownRef}>
            {unreadCount > 0 ? (
                <Badge
                    content={unreadCount}
                    maxCount={99}
                    innerClass="!bg-rose-500"
                >
                    {bellButton}
                </Badge>
            ) : (
                bellButton
            )}

            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl border border-gray-100 bg-white p-0 shadow-2xl z-50 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 bg-gray-50/50">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-gray-900">
                                Notifications
                            </h3>
                            {unreadCount > 0 && (
                                <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                                    {unreadCount} new
                                </span>
                            )}
                        </div>
                        {unreadCount > 0 && (
                            <button
                                type="button"
                                onClick={handleMarkAllRead}
                                className="flex items-center gap-1 text-xs font-medium text-shop-600 hover:text-shop-700 transition-colors"
                            >
                                <HiOutlineCheck className="text-sm" />
                                Mark all as read
                            </button>
                        )}
                    </div>

                    {/* Content List */}
                    <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                        {loading && notifications.length === 0 ? (
                            <div className="flex items-center justify-center py-8">
                                <Spinner size="sm" />
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                                <HiOutlineBell className="text-3xl text-gray-300 mb-2" />
                                <p className="text-sm font-medium text-gray-700">
                                    No notifications yet
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    We&apos;ll notify you when your order status changes
                                </p>
                            </div>
                        ) : (
                            notifications.map((item) => {
                                const isUnread =
                                    !item.isRead && !item.readed
                                const title =
                                    item.title ||
                                    item.target ||
                                    'Notification'
                                const message =
                                    item.message ||
                                    item.description ||
                                    ''
                                const isApproval =
                                    title.toLowerCase().includes('approved')
                                const isCancel =
                                    title.toLowerCase().includes('cancelled') ||
                                    title.toLowerCase().includes('canceled')

                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => handleItemClick(item)}
                                        className={`group relative flex cursor-pointer items-start gap-3 p-3.5 transition-colors hover:bg-gray-50/80 ${
                                            isUnread
                                                ? 'bg-shop-50/30'
                                                : 'bg-white'
                                        }`}
                                    >
                                        <div className="shrink-0 mt-0.5">
                                            {isApproval ? (
                                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-shop-100 text-shop-600">
                                                    <HiOutlineCheckCircle className="text-lg" />
                                                </span>
                                            ) : isCancel ? (
                                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                                                    <HiOutlineXCircle className="text-lg" />
                                                </span>
                                            ) : (
                                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                                                    <HiOutlineInformationCircle className="text-lg" />
                                                </span>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-1">
                                                <p
                                                    className={`truncate text-xs font-semibold ${
                                                        isUnread
                                                            ? 'text-gray-900'
                                                            : 'text-gray-700'
                                                    }`}
                                                >
                                                    {title}
                                                </p>
                                                <span className="shrink-0 text-[10px] text-gray-400">
                                                    {item.date || 'Just now'}
                                                </span>
                                            </div>
                                            <p className="mt-0.5 line-clamp-2 text-xs text-gray-600 leading-relaxed">
                                                {message}
                                            </p>
                                        </div>
                                        {isUnread && (
                                            <span
                                                className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-shop-500 ring-2 ring-white"
                                                aria-label="Unread"
                                            />
                                        )}
                                    </div>
                                )
                            })
                        )}
                    </div>

                    {/* Footer — the full inbox page is staff-only */}
                    {!shopperToken && (
                        <div className="border-t border-gray-100 bg-gray-50/50 p-2 text-center">
                            <Link
                                href="/notifications"
                                onClick={() => setIsOpen(false)}
                                className="inline-block text-xs font-medium text-shop-600 hover:text-shop-700 py-1 transition-colors"
                            >
                                View all notifications &rarr;
                            </Link>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
