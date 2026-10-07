import Ionicons from '@expo/vector-icons/Ionicons'
import { Tabs } from 'expo-router/js-tabs'
import type { ComponentProps } from 'react'
import type { ColorValue } from 'react-native'
import { useCart } from '@/src/context/CartContext'
import { colors } from '@/src/theme'

type IconName = ComponentProps<typeof Ionicons>['name']

const icon =
    (active: IconName, inactive: IconName) =>
    ({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) => (
        <Ionicons name={focused ? active : inactive} size={size} color={color as string} />
    )

export default function TabsLayout() {
    const { itemCount } = useCart()

    return (
        <Tabs
            screenOptions={{
                tabBarActiveTintColor: colors.brand,
                tabBarInactiveTintColor: colors.textFaint,
                tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
                tabBarStyle: { borderTopColor: colors.border },
                headerTitleStyle: { color: colors.text, fontWeight: '700' },
                headerShadowVisible: false,
            }}
        >
            <Tabs.Screen
                name="index"
                options={{ title: 'Shop', headerShown: false, tabBarIcon: icon('storefront', 'storefront-outline') }}
            />
            <Tabs.Screen
                name="cart"
                options={{
                    title: 'Cart',
                    headerTitle: 'Your cart',
                    tabBarIcon: icon('cart', 'cart-outline'),
                    tabBarBadge: itemCount > 0 ? (itemCount > 99 ? '99+' : itemCount) : undefined,
                    tabBarBadgeStyle: { backgroundColor: colors.sale, fontSize: 10 },
                }}
            />
            <Tabs.Screen
                name="orders"
                options={{ title: 'Orders', headerTitle: 'My orders', tabBarIcon: icon('receipt', 'receipt-outline') }}
            />
            <Tabs.Screen
                name="account"
                options={{ title: 'Account', tabBarIcon: icon('person', 'person-outline') }}
            />
        </Tabs>
    )
}
