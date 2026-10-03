import { getSession } from 'next-auth/react'
import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    CompanyOption,
    CreateUserPayload,
    UserCompanyMembership,
    ManagedUser,
    UpdateUserPayload,
    UserListQuery,
    UserListResponse,
} from '../types'

/** ErpAxiosBase only attaches X-User-Id on mutations; the users API also guards reads. */
async function actorHeaders() {
    const session = await getSession()
    return session?.user?.id ? { 'X-User-Id': session.user.id } : {}
}

export const userManagementService = {
    async list(query: UserListQuery) {
        const response = await ErpAxiosBase.get<UserListResponse>('/users', {
            params: query,
            headers: await actorHeaders(),
        })
        return response.data
    },

    async create(payload: CreateUserPayload) {
        const response = await ErpAxiosBase.post<ManagedUser>('/users', payload)
        return response.data
    },

    async update(id: string, payload: UpdateUserPayload) {
        const response = await ErpAxiosBase.patch<ManagedUser>(
            `/users/${id}`,
            payload,
        )
        return response.data
    },

    async setStatus(id: string, isActive: boolean) {
        const response = await ErpAxiosBase.patch<ManagedUser>(
            `/users/${id}/status`,
            { isActive },
        )
        return response.data
    },

    async listCompanyOptions() {
        const response = await ErpAxiosBase.get<CompanyOption[]>(
            '/users/company-options',
            { headers: await actorHeaders() },
        )
        return response.data
    },

    async listUserCompanies(userId: string) {
        const response = await ErpAxiosBase.get<UserCompanyMembership[]>(
            `/users/${userId}/companies`,
            { headers: await actorHeaders() },
        )
        return response.data
    },

    async assignCompany(userId: string, companyId: string) {
        const response = await ErpAxiosBase.post<UserCompanyMembership[]>(
            `/users/${userId}/companies`,
            { companyId },
        )
        return response.data
    },

    async removeCompany(userId: string, companyId: string) {
        const response = await ErpAxiosBase.delete<UserCompanyMembership[]>(
            `/users/${userId}/companies/${companyId}`,
        )
        return response.data
    },

    async setDefaultCompany(userId: string, companyId: string) {
        const response = await ErpAxiosBase.patch<UserCompanyMembership[]>(
            `/users/${userId}/companies/${companyId}/default`,
            {},
        )
        return response.data
    },
}
