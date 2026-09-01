import ErpAxiosBase from './axios/ErpAxiosBase'
import ApiService from './ApiService'
import type { NotificationItem } from '@/@types/notification'

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
    )

    return response.data
}

export async function apiMarkAllNotificationsAsRead() {
    await ErpAxiosBase.patch('/notifications/read-all')
}

export async function apiGetSearchResult<T>(params: { query: string }) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/search',
        method: 'get',
        params,
    })
}
