'use client'

import { useCallback, useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import StatusBadge from '@/components/shared/StatusBadge'
import ErpBackLink from '@/components/erp/ErpBackLink'
import { ACTIVITY_LOG_PATH } from '@/constants/route.constant'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import NotificationAvatar from '@/components/template/Notification/NotificationAvatar'
import { HiOutlineMailOpen } from 'react-icons/hi'
import {
    apiGetNotificationList,
    apiMarkAllNotificationsAsRead,
    apiMarkNotificationAsRead,
} from '@/services/CommonService'
import useNotificationSocket from '@/utils/hooks/useNotificationSocket'
import type { NotificationItem } from '@/@types/notification'

const ActivityLog = () => {
    const [notifications, setNotifications] = useState<NotificationItem[]>([])
    const [loading, setLoading] = useState(true)

    const loadNotifications = useCallback(async () => {
        setLoading(true)

        try {
            const data = await apiGetNotificationList({ limit: 100 })
            setNotifications(data)
        } catch {
            setNotifications([])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadNotifications()
    }, [loadNotifications])

    const handleRealtimeNotification = useCallback(
        (notification: NotificationItem) => {
            setNotifications((current) => {
                if (current.some((item) => item.id === notification.id)) {
                    return current
                }

                return [notification, ...current]
            })
        },
        [],
    )

    useNotificationSocket({
        onNotification: handleRealtimeNotification,
    })

    const onMarkAllAsRead = async () => {
        setNotifications((current) =>
            current.map((item) => ({ ...item, readed: true })),
        )

        try {
            await apiMarkAllNotificationsAsRead()
        } catch {
            await loadNotifications()
        }
    }

    const onMarkAsRead = async (id: string) => {
        try {
            await apiMarkNotificationAsRead(id)
        } catch {
            // Keep optimistic UI if API is temporarily unavailable.
        }

        setNotifications((current) =>
            current.map((item) =>
                item.id === id ? { ...item, readed: true } : item,
            ),
        )
    }

    const unreadCount = notifications.filter((item) => !item.readed).length
    const breadcrumbItems = buildErpBreadcrumbs(ACTIVITY_LOG_PATH)

    return (
        <PageContainer>
            <ErpBackLink items={breadcrumbItems} />
            <Breadcrumb items={breadcrumbItems} />

            <PageHeader
                title="Activity Log"
                description="Full history of system notifications and activity updates."
                actions={
                    unreadCount > 0 ? (
                        <Button
                            variant="solid"
                            icon={<HiOutlineMailOpen className="text-lg" />}
                            onClick={onMarkAllAsRead}
                        >
                            Mark all as read
                        </Button>
                    ) : null
                }
            />

            <Card>
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Spinner size={40} />
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <img
                            className="mb-2 max-w-[150px]"
                            src="/img/others/no-notification.png"
                            alt="no-notification"
                        />
                        <h6 className="font-semibold">No activity yet</h6>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Notifications will appear here as they arrive.
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        {notifications.map((item) => (
                            <div
                                key={item.id}
                                className="relative flex cursor-pointer px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                onClick={() => onMarkAsRead(item.id)}
                            >
                                <div>
                                    <NotificationAvatar {...item} />
                                </div>
                                <div className="mx-4 min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        {item.target ? (
                                            <span className="font-semibold heading-text">
                                                {item.target}
                                            </span>
                                        ) : null}
                                        <StatusBadge
                                            tone={
                                                item.readed ? 'default' : 'info'
                                            }
                                        >
                                            {item.readed ? 'Read' : 'Unread'}
                                        </StatusBadge>
                                    </div>
                                    <p className="mt-1">{item.description}</p>
                                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                                        {item.date}
                                    </span>
                                </div>
                                {!item.readed ? (
                                    <Badge
                                        className="mt-2"
                                        innerClass="bg-primary"
                                    />
                                ) : null}
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </PageContainer>
    )
}

export default ActivityLog
