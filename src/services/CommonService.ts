import ErpAxiosBase from './axios/ErpAxiosBase'
import type { NotificationItem } from '@/@types/notification'
import { searchPages, type SearchResultGroup } from '@/configs/search.config'

export async function apiGetNotificationCount() {
    const response = await ErpAxiosBase.get<{ count: number }>(
        '/notifications/count',
    )

    return response.data
}

export async function apiGetNotificationList(params?: { limit?: number }) {
    const response = await ErpAxiosBase.get<NotificationItem[]>('/notifications', {
        params,
    })

    return response.data
}

export async function apiMarkNotificationAsRead(id: string) {
    const response = await ErpAxiosBase.patch<NotificationItem>(
        `/notifications/${id}/read`,
        {},
    )

    return response.data
}

export async function apiMarkAllNotificationsAsRead() {
    await ErpAxiosBase.patch('/notifications/read-all', {})
}

export async function apiGetSearchResult(params: { query: string }) {
    return searchPages(params.query) as SearchResultGroup[]
}
