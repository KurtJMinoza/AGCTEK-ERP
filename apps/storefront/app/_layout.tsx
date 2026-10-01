import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider } from '@/src/context/AuthContext'
import { CartProvider } from '@/src/context/CartContext'
import { colors } from '@/src/theme'

export default function RootLayout() {
    return (
        <AuthProvider>
            <CartProvider>
                <StatusBar style="dark" />
                <Stack
                    screenOptions={{
                        headerTintColor: colors.brand,
                        headerTitleStyle: { color: colors.text },
                        contentStyle: { backgroundColor: colors.background },
                    }}
                >
                    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                    <Stack.Screen name="product/[id]" options={{ title: 'Product' }} />
                    <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
                    <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
                    <Stack.Screen name="track/[id]" options={{ title: 'Track order' }} />
                </Stack>
            </CartProvider>
        </AuthProvider>
    )
}
