'use server'

import type { SignUpCredential } from '@/@types/auth'

export const onSignUpWithCredentials = async ({
    email,
    userName,
}: SignUpCredential) => {
    try {
        /** Pretend create user */
        return {
            email,
            userName,
            id: userName,
        }
    } catch (error) {
        throw error
    }
}
