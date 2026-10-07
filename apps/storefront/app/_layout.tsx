import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from '@/src/context/AuthContext'
import { CartProvider } from '@/src/context/CartContext'
import { CatalogProvider } from '@/src/context/CatalogContext'
import { FavoritesProvider } from '@/src/context/FavoritesContext'
import { ShopProvider } from '@/src/context/ShopContext'
import { ToastProvider } from '@/src/context/ToastContext'
import { colors } from '@/src/theme'

export default function RootLayout() {
    return (
        <SafeAreaProvider>
            <ToastProvider>
                <AuthProvider>
                    <CatalogProvider>
                        <CartProvider>
                            <FavoritesProvider>
                                <ShopProvider>
                                    <StatusBar style="dark" />
                                    <Stack
                                        screenOptions={{
                                            headerTintColor: colors.brand,
                                            headerTitleStyle: { color: colors.text, fontWeight: '700' },
                                            headerShadowVisible: false,
                                            contentStyle: { backgroundColor: colors.background },
                                        }}
                                    >
                                        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                                        <Stack.Screen name="products" options={{ headerShown: false }} />
                                        <Stack.Screen name="product/[id]" options={{ headerShown: false }} />
                                        <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
                                        <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
                                        <Stack.Screen name="favorites" options={{ title: 'Favourites' }} />
                                        <Stack.Screen
                                            name="sign-in"
                                            options={{ presentation: 'modal', headerShown: false }}
                                        />
                                    </Stack>
                                </ShopProvider>
                            </FavoritesProvider>
                        </CartProvider>
                    </CatalogProvider>
                </AuthProvider>
            </ToastProvider>
        </SafeAreaProvider>
    )
}
