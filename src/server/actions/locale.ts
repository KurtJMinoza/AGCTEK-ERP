'use server'

import { cookies } from 'next/headers'
import appConfig from '@/configs/app.config'
import { COOKIES_KEY } from '@/constants/app.constant'

const COOKIE_NAME = COOKIES_KEY.LOCALE

export async function getLocale() {
    const cookieStore = await cookies()
    return cookieStore.get(COOKIE_NAME)?.value || appConfig.locale
}

export async function setLocale(locale: string) {
    const cookieStore = await cookies()
    cookieStore.set(COOKIE_NAME, locale)
}
