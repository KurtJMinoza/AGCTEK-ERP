import { Tabs } from 'expo-router/js-tabs'
import { useCart } from '@/src/context/CartContext'
import { colors } from '@/src/theme'

export default function TabsLayout() {
    const { itemCount } = useCart()

    return (
        <Tabs
            screenOptions={{
                tabBarActiveTintColor: colors.brand,
                tabBarInactiveTintColor: colors.textMuted,
                tabBarIconStyle: { display: 'none' },
                tabBarLabelStyle: { fontSize: 14, fontWeight: '600' },
                headerTitleStyle: { color: colors.text },
            }}
        >
            <Tabs.Screen name="index" options={{ title: 'Shop' }} />
            <Tabs.Screen
                name="cart"
                options={{
                    title: 'Cart',
                    tabBarBadge: itemCount > 0 ? (itemCount > 99 ? '99+' : itemCount) : undefined,
                    tabBarBadgeStyle: { backgroundColor: colors.brand },
                }}
            />
            <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
            <Tabs.Screen name="account" options={{ title: 'Account' }} />
        </Tabs>
    )
}
