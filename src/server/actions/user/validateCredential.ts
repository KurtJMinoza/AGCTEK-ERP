'use server'

import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type { SignInCredential } from '@/@types/auth'
import axios from 'axios'

type AuthUser = {
    id: string
    email: string
    userName: string
    avatar: string
    role: string
    authority: string[]
}

const validateCredential = async (values: SignInCredential) => {
    try {
        const response = await ErpAxiosBase.post<AuthUser>('/auth/sign-in', {
            userName: values.userName,
            password: values.password,
        })

        return response.data
    } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
            return null
        }

        return null
    }
}

export default validateCredential
