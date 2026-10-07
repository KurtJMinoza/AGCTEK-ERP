import { useRouter } from 'expo-router'
import { ScreenState } from './ScreenState'

export function SignInPrompt({ title = 'Sign in required', message }: { title?: string; message: string }) {
    const router = useRouter()
    return (
        <ScreenState
            kind="empty"
            icon="person-circle-outline"
            title={title}
            message={message}
            action={{ title: 'Sign in', icon: 'log-in-outline', onPress: () => router.push('/sign-in') }}
        />
    )
}
