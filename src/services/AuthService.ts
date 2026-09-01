import ErpAxiosBase from './axios/ErpAxiosBase'

import type {
    SignUpCredential,
    ForgotPassword,
    ResetPassword,
    SignUpResponse,
} from '@/@types/auth'

export async function apiSignUp(data: SignUpCredential) {
    const response = await ErpAxiosBase.post<SignUpResponse>(
        '/auth/sign-up',
        data,
    )

    return response.data
}

export async function apiForgotPassword<T>(data: ForgotPassword) {
    const response = await ErpAxiosBase.post<T>('/auth/forgot-password', data)

    return response.data
}

export async function apiResetPassword<T>(data: ResetPassword) {
    const response = await ErpAxiosBase.post<T>('/auth/reset-password', data)

    return response.data
}
