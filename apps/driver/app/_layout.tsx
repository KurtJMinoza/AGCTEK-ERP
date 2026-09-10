import { Stack, useRouter, useSegments } from 'expo-router'
import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider, useAuth } from '@/src/hooks/useAuth'

function AuthGate({ children }: { children: React.ReactNode }) {
    const { session, loading } = useAuth()
    const segments = useSegments()
    const router = useRouter()

    useEffect(() => {
        if (loading) return
        const inAuth = segments[0] === '(auth)'
        if (!session && !inAuth) {
            router.replace('/(auth)/login')
        } else if (session && inAuth) {
            router.replace('/(app)/home')
        }
    }, [session, loading, segments, router])

    if (loading) {
        return (
            <View
                style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#f9fafb',
                }}
            >
                <ActivityIndicator size="large" color="#ea580c" />
            </View>
        )
    }

    return <>{children}</>
}

export default function RootLayout() {
    return (
        <AuthProvider>
            <StatusBar style="dark" />
            <AuthGate>
                <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="(auth)" />
                    <Stack.Screen name="(app)" />
                </Stack>
            </AuthGate>
        </AuthProvider>
    )
}
