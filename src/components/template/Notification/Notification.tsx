'use client'

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import classNames from 'classnames'
import withHeaderItem from '@/utils/hoc/withHeaderItem'
import Dropdown from '@/components/ui/Dropdown'
import ScrollBar from '@/components/ui/ScrollBar'
import Spinner from '@/components/ui/Spinner'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Tooltip from '@/components/ui/Tooltip'
import NotificationAvatar from './NotificationAvatar'
import NotificationToggle from './NotificationToggle'
import { HiOutlineMailOpen } from 'react-icons/hi'
import {
    apiGetNotificationList,
    apiGetNotificationCount,
    apiMarkAllNotificationsAsRead,
    apiMarkNotificationAsRead,
} from '@/services/CommonService'
import isLastChild from '@/utils/isLastChild'
import useResponsive from '@/utils/hooks/useResponsive'
import useNotificationSocket from '@/utils/hooks/useNotificationSocket'
import { ACTIVITY_LOG_PATH } from '@/constants/route.constant'
import type { NotificationItem } from '@/@types/notification'
import type { DropdownRef } from '@/components/ui/Dropdown'

const notificationHeight = 'h-[280px]'

const _Notification = ({ className }: { className?: string }) => {
    const [notificationList, setNotificationList] = useState<
        NotificationItem[]
    >([])
    const [unreadNotification, setUnreadNotification] = useState(false)
    const [noResult, setNoResult] = useState(false)
    const [loading, setLoading] = useState(false)

    const { larger } = useResponsive()
    const router = useRouter()
    const notificationDropdownRef = useRef<DropdownRef>(null)

    const refreshCount = useCallback(async () => {
        try {
            const resp = await apiGetNotificationCount()
            setUnreadNotification(resp.count > 0)
        } catch {
            setUnreadNotification(false)
        }
    }, [])

    const handleRealtimeNotification = useCallback(
        (notification: NotificationItem) => {
            setNotificationList((current) => {
                const exists = current.some((item) => item.id === notification.id)

                if (exists) {
                    return current
                }

                return [notification, ...current]
            })
            setNoResult(false)
            setUnreadNotification(true)
        },
        [],
    )

    const handleRealtimeCount = useCallback((count: number) => {
        setUnreadNotification(count > 0)
    }, [])

    useNotificationSocket({
        onNotification: handleRealtimeNotification,
        onCount: handleRealtimeCount,
    })

    useEffect(() => {
        refreshCount()
    }, [refreshCount])

    const onNotificationOpenChange = async (open: boolean) => {
        if (!open) {
            return
        }

        setLoading(true)

        try {
            const resp = await apiGetNotificationList()
            setNotificationList(resp)
            setNoResult(resp.length === 0)
            setUnreadNotification(resp.some((item) => !item.readed))
        } catch {
            setNotificationList([])
            setNoResult(true)
        } finally {
            setLoading(false)
        }
    }

    const onMarkAllAsRead = async (
        event: React.MouseEvent<HTMLButtonElement>,
    ) => {
        event.stopPropagation()

        setNotificationList((current) =>
            current.map((item) => ({ ...item, readed: true })),
        )
        setUnreadNotification(false)

        try {
            await apiMarkAllNotificationsAsRead()
        } catch {
            await refreshCount()
            await onNotificationOpenChange(true)
        }
    }

    const onMarkAsRead = async (id: string) => {
        try {
            await apiMarkNotificationAsRead(id)
        } catch {
            // Keep optimistic UI if API is temporarily unavailable.
        }

        setNotificationList((current) => {
            const next = current.map((item) =>
                item.id === id ? { ...item, readed: true } : item,
            )
            const hasUnread = next.some((item) => !item.readed)
            setUnreadNotification(hasUnread)

            return next
        })
    }

    const handleViewAllActivity = () => {
        notificationDropdownRef.current?.handleDropdownClose()
        router.push(ACTIVITY_LOG_PATH)
    }

    return (
        <Dropdown
            ref={notificationDropdownRef}
            renderTitle={
                <NotificationToggle
                    dot={unreadNotification}
                    className={className}
                />
            }
            menuClass="min-w-[280px] md:min-w-[340px]"
            placement={larger.md ? 'bottom-end' : 'bottom'}
            onOpen={onNotificationOpenChange}
        >
            <Dropdown.Item variant="header">
                <div className="dark:border-gray-700 px-2 flex items-center justify-between mb-1">
                    <h6>Notifications</h6>
                    <Tooltip title="Mark all as read">
                        <Button
                            variant="plain"
                            shape="circle"
                            size="sm"
                            icon={<HiOutlineMailOpen className="text-xl" />}
                            onClick={onMarkAllAsRead}
                        />
                    </Tooltip>
                </div>
            </Dropdown.Item>
            <ScrollBar
                className={classNames('overflow-y-auto', notificationHeight)}
            >
                {notificationList.length > 0 &&
                    notificationList.map((item, index) => (
                        <div key={item.id}>
                            <div
                                className="relative rounded-xl flex px-4 py-3 cursor-pointer hover:bg-gray-100 active:bg-gray-100 dark:hover:bg-gray-700"
                                onClick={() => onMarkAsRead(item.id)}
                            >
                                <div>
                                    <NotificationAvatar {...item} />
                                </div>
                                <div className="mx-3">
                                    <div>
                                        {item.target && (
                                            <span className="font-semibold heading-text">
                                                {item.target}{' '}
                                            </span>
                                        )}
                                        <span>{item.description}</span>
                                    </div>
                                    <span className="text-xs">{item.date}</span>
                                </div>
                                {!item.readed ? (
                                    <Badge
                                        className="absolute top-4 ltr:right-4 rtl:left-4 mt-1.5"
                                        innerClass="bg-primary"
                                    />
                                ) : null}
                            </div>
                            {!isLastChild(notificationList, index) ? (
                                <div className="border-b border-gray-200 dark:border-gray-700 my-2" />
                            ) : null}
                        </div>
                    ))}
                {loading && (
                    <div
                        className={classNames(
                            'flex items-center justify-center',
                            notificationHeight,
                        )}
                    >
                        <Spinner size={40} />
                    </div>
                )}
                {!loading && noResult && notificationList.length === 0 && (
                    <div
                        className={classNames(
                            'flex items-center justify-center',
                            notificationHeight,
                        )}
                    >
                        <div className="text-center">
                            <img
                                className="mx-auto mb-2 max-w-[150px]"
                                src="/img/others/no-notification.png"
                                alt="no-notification"
                            />
                            <h6 className="font-semibold">No notifications!</h6>
                            <p className="mt-1">You&apos;re all caught up.</p>
                        </div>
                    </div>
                )}
            </ScrollBar>
            <Dropdown.Item variant="custom">
                <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700">
                    <Button block variant="solid" onClick={handleViewAllActivity}>
                        View All Activity
                    </Button>
                </div>
            </Dropdown.Item>
        </Dropdown>
    )
}

const Notification = withHeaderItem(_Notification)

export default Notification
