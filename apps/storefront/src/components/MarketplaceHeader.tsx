import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MARKETPLACE_NAME } from '../catalog'
import { useCart } from '../context/CartContext'
import { colors, radius } from '../theme'

type Props = {
    /** Current search text (products page); home starts empty. */
    initialQuery?: string
    /** Defaults to opening the products page with `q`. */
    onSearch?: (query: string) => void
    /** Back arrow instead of the logo (pushed screens). */
    showBack?: boolean
}

/** Emerald marketplace bar: logo, search, cart — the mobile version of the web header. */
export function MarketplaceHeader({ initialQuery = '', onSearch, showBack }: Props) {
    const router = useRouter()
    const insets = useSafeAreaInsets()
    const { itemCount } = useCart()
    const [query, setQuery] = useState(initialQuery)

    useEffect(() => setQuery(initialQuery), [initialQuery])

    const submit = () => {
        const q = query.trim()
        if (onSearch) onSearch(q)
        else router.push({ pathname: '/products', params: q ? { q } : {} })
    }

    return (
        <View style={[styles.bar, { paddingTop: insets.top + 10 }]}>
            <View style={styles.top}>
                {showBack ? (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Back"
                        hitSlop={8}
                        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
                        style={styles.iconButton}
                    >
                        <Ionicons name="arrow-back" size={22} color="#fff" />
                    </Pressable>
                ) : null}
                <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`${MARKETPLACE_NAME} home`}
                    onPress={() => router.navigate('/')}
                    style={styles.brand}
                >
                    <View style={styles.logo}>
                        <Ionicons name="bag-handle" size={18} color={colors.brand} />
                    </View>
                    <Text style={styles.brandText} numberOfLines={1}>
                        {MARKETPLACE_NAME}
                    </Text>
                </Pressable>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Cart, ${itemCount} items`}
                    hitSlop={8}
                    onPress={() => router.navigate('/cart')}
                    style={styles.iconButton}
                >
                    <Ionicons name="cart-outline" size={24} color="#fff" />
                    {itemCount > 0 ? (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{itemCount > 99 ? '99+' : itemCount}</Text>
                        </View>
                    ) : null}
                </Pressable>
            </View>
            <View style={styles.search}>
                <Ionicons name="search" size={18} color={colors.textFaint} />
                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    onSubmitEditing={submit}
                    placeholder="Search products, stores, categories"
                    placeholderTextColor={colors.textFaint}
                    returnKeyType="search"
                    autoCorrect={false}
                    accessibilityLabel="Search products"
                    style={styles.input}
                />
                {query ? (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Clear search"
                        hitSlop={8}
                        onPress={() => {
                            setQuery('')
                            onSearch?.('')
                        }}
                    >
                        <Ionicons name="close-circle" size={18} color={colors.textFaint} />
                    </Pressable>
                ) : null}
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    bar: { backgroundColor: colors.brand, paddingHorizontal: 16, paddingBottom: 14, gap: 12 },
    top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    logo: {
        width: 30,
        height: 30,
        borderRadius: 8,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    brandText: { flexShrink: 1, color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
    iconButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    badge: {
        position: 'absolute',
        top: 0,
        right: -2,
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        paddingHorizontal: 4,
        backgroundColor: '#fbbf24',
        alignItems: 'center',
        justifyContent: 'center',
    },
    badgeText: { fontSize: 10, fontWeight: '800', color: colors.text },
    search: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        height: 44,
        borderRadius: radius.sm,
        backgroundColor: '#fff',
        paddingHorizontal: 12,
    },
    input: { flex: 1, fontSize: 15, color: colors.text, height: '100%' },
})
