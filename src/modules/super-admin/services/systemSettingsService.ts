import { getSession } from 'next-auth/react'
import ErpAxiosBase from '@/services/axios/ErpAxiosBase'

export type SettingValue = boolean | string | number
export type SettingGroup = 'general' | 'access' | 'features'

export type SystemSetting = {
    key: string
    value: SettingValue
    defaultValue: SettingValue
    valueType: 'boolean' | 'string' | 'number'
    label: string
    description: string
    group: SettingGroup
    sortOrder: number
    options: string[] | null
    updatedAt: string | null
    updatedBy: { id: string; userName: string } | null
}

/** ErpAxiosBase only attaches X-User-Id on mutations; the settings API also guards reads. */
async function actorHeaders() {
    const session = await getSession()
    return session?.user?.id ? { 'X-User-Id': session.user.id } : {}
}

export const systemSettingsService = {
    async list() {
        const response = await ErpAxiosBase.get<SystemSetting[]>('/system-settings', {
            headers: await actorHeaders(),
        })
        return response.data
    },

    async update(settings: { key: string; value: SettingValue }[]) {
        const response = await ErpAxiosBase.patch<SystemSetting[]>('/system-settings', {
            settings,
        })
        return response.data
    },
}
