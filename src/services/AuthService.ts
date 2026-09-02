import ErpAxiosBase from './axios/ErpAxiosBase'
import type { SignUpCredential, SignUpResponse } from '@/@types/auth'

export type AuthProfile = {
    id: string
    email: string
    userName: string
    avatar: string
    role: string
    authority: string[]
}

export async function apiSignUp(data: SignUpCredential) {
    const response = await ErpAxiosBase.post<SignUpResponse>(
        '/auth/sign-up',
        data,
    )

    return response.data
}

export async function apiGetProfile(userName: string) {
    const response = await ErpAxiosBase.get<AuthProfile>('/auth/profile', {
        params: { userName },
    })

    return response.data
}

export async function apiUpdateProfile(data: {
    userName: string
    email?: string
    newUserName?: string
    avatar?: string
}) {
    const response = await ErpAxiosBase.patch<{
        status: string
        message: string
        user: AuthProfile
    }>('/auth/profile', data)

    return response.data
}

export async function apiChangePassword(data: {
    userName: string
    currentPassword: string
    newPassword: string
}) {
    const response = await ErpAxiosBase.patch<{
        status: string
        message: string
    }>('/auth/password', data)

    return response.data
}
