import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { ShopAuthLayout } from '@/src/components/auth/ShopAuthLayout'
import type { ShopAuthNext } from '@/src/components/auth/ShopAuthForm'
import { MARKETPLACE_NAME } from '@/src/catalog'
import { useShop } from '@/src/context/ShopContext'

/** Full-page Gmail OTP + Google auth, matching live /shop/sign-in. */
export default function SignInScreen() {
    const router = useRouter()
    const { next } = useLocalSearchParams<{ next?: string }>()
    const { signInClosed } = useShop()

    useEffect(() => signInClosed, [signInClosed])

    const authNext: ShopAuthNext =
        next === 'checkout' || next === 'orders' || next === 'account' ? next : 'account'

    const close = () => (router.canGoBack() ? router.back() : router.replace('/'))

    return (
        <ShopAuthLayout
            next={authNext}
            onBack={close}
            backLabel={`Back to ${MARKETPLACE_NAME}`}
        />
    )
}
