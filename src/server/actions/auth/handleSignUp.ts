'use server'

import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type { SignUpCredential } from '@/@types/auth'
import axios from 'axios'

export const onSignUpWithCredentials = async ({
    email,
    userName,
    password,
    role,
}: SignUpCredential) => {
    try {
        await ErpAxiosBase.post('/auth/sign-up', {
            email,
            userName,
            password,
            role,
        })

        return { status: 'success' as const }
    } catch (error) {
        if (axios.isAxiosError(error)) {
            const message =
                (error.response?.data as { message?: string | string[] })
                    ?.message || 'Unable to create account.'

            return {
                error: Array.isArray(message) ? message.join(', ') : message,
            }
        }

        return { error: 'Something went wrong!' }
    }
}
