'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    HiOutlineArrowLeft,
    HiOutlineBell,
    HiOutlineCheck,
    HiOutlineCheckCircle,
    HiOutlineInformationCircle,
    HiOutlineXCircle,
} from 'react-icons/hi'
import MarketplaceHeader from '../components/MarketplaceHeader'
import Spinner from '@/components/ui/Spinner'
import Button from '@/components/ui/Button'
import {
    apiGetNotificationList,
    apiMarkAllNotificationsAsRead,
    apiMarkNotificationAsRead,
} from '@/services/CommonService'
import { useMarketplace } from '../MarketplaceProvider'
import useCurrentSession from '@/utils/hooks/useCurrentSession'
import type { NotificationItem } from '@/@types/notification'

export default function MarketplaceNotificationsPage() {
    const router = useRouter()
    const { signedInClient, openOrders } = useMarketplace()
    const { session } = useCurrentSession()
    const activeUserId = signedInClient?.customerId || session?.user?.id

    const [notifications, setNotifications] = useState<NotificationItem[]>([])
    const [loading, setLoading] = useState(true)

    const fetchNotifications = useCallback(async () => {
        setLoading(true)
        try {
            const data = await apiGetNotificationList({
                limit: 50,
                ...(activeUserId ? { userId: activeUserId } : {}),
            })
            setNotifications(data || [])
        } catch {
            // Silently fall back
        } finally {
            setLoading(false)
        }
    }, [activeUserId])

    useEffect(() => {
        fetchNotifications()
    }, [fetchNotifications])

    const handleItemClick = async (item: NotificationItem) => {
        const isUnread = !item.isRead && !item.readed
        if (isUnread) {
            setNotifications((prev) =>
                prev.map((n) =>
                    n.id === item.id
                        ? { ...n, isRead: true, readed: true }
                        : n,
                ),
            )
            try {
                await apiMarkNotificationAsRead(item.id)
            } catch {
                // Ignore API failure
            }
        }

        if (
            item.title?.toLowerCase().includes('order') ||
            item.target?.startsWith('SO-') ||
            item.description?.toLowerCase().includes('order')
        ) {
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
        try {
            await apiMarkAllNotificationsAsRead()
        } catch {
            // Ignore API failure
        }
    }

    const unreadCount = notifications.filter(
        (n) => !n.isRead && !n.readed,
    ).length

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <MarketplaceHeader />

            <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
                {/* Header card */}
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <Link
                                href="/"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                            >
                                <HiOutlineArrowLeft className="text-lg" />
                            </Link>
                            <h1 className="text-2xl font-bold text-gray-900">
                                Notifications
                            </h1>
                            {unreadCount > 0 && (
                                <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                                    {unreadCount} unread
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-gray-500 mt-1 ml-11">
                            Stay up-to-date with your order status and updates
                        </p>
                    </div>

                    {unreadCount > 0 && (
                        <Button
                            size="sm"
                            variant="default"
                            icon={<HiOutlineCheck />}
                            onClick={handleMarkAllRead}
                        >
                            Mark all as read
                        </Button>
                    )}
                </div>

                {/* Notifications list */}
                <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Spinner size="md" />
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-400 mb-3">
                                <HiOutlineBell className="text-2xl" />
                            </div>
                            <h3 className="text-base font-semibold text-gray-900">
                                No notifications yet
                            </h3>
                            <p className="text-sm text-gray-500 max-w-sm mt-1">
                                When you place an order or its status changes, you'll find updates here.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {notifications.map((item) => {
                                const isUnread = !item.isRead && !item.readed
                                const title =
                                    item.title ||
                                    item.target ||
                                    'Notification'
                                const message =
                                    item.message || item.description || ''
                                const isApproval =
                                    title.toLowerCase().includes('approved')
                                const isCancel =
                                    title.toLowerCase().includes('cancelled') ||
                                    title.toLowerCase().includes('canceled')

                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => handleItemClick(item)}
                                        className={`flex cursor-pointer items-start gap-4 p-5 transition-colors hover:bg-gray-50/80 ${
                                            isUnread
                                                ? 'bg-shop-50/20'
                                                : 'bg-white'
                                        }`}
                                    >
                                        <div className="shrink-0 mt-0.5">
                                            {isApproval ? (
                                                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-shop-100 text-shop-600">
                                                    <HiOutlineCheckCircle className="text-xl" />
                                                </span>
                                            ) : isCancel ? (
                                                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                                                    <HiOutlineXCircle className="text-xl" />
                                                </span>
                                            ) : (
                                                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                                                    <HiOutlineInformationCircle className="text-xl" />
                                                </span>
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <h4
                                                    className={`text-sm font-semibold ${
                                                        isUnread
                                                            ? 'text-gray-900'
                                                            : 'text-gray-700'
                                                    }`}
                                                >
                                                    {title}
                                                </h4>
                                                <span className="text-xs text-gray-400 shrink-0">
                                                    {item.date || 'Just now'}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-sm text-gray-600 leading-relaxed">
                                                {message}
                                            </p>
                                        </div>

                                        {isUnread && (
                                            <span
                                                className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-shop-500"
                                                aria-label="Unread notification"
                                            />
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}
