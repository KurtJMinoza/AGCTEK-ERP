import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MARKETPLACE_NAME } from '@/src/catalog'
import { AccountForm } from '@/src/components/AccountForm'
import { useShop } from '@/src/context/ShopContext'
import { colors, radius } from '@/src/theme'

/** Sign-in modal; `next` continues to checkout or orders after signing in. */
export default function SignInScreen() {
    const router = useRouter()
    const insets = useSafeAreaInsets()
    const { next } = useLocalSearchParams<{ next?: 'checkout' | 'orders' }>()
    const { signInClosed } = useShop()

    useEffect(() => signInClosed, [signInClosed])

    const close = () => (router.canGoBack() ? router.back() : router.replace('/'))
    const done = () => {
        if (next === 'checkout') router.replace('/checkout')
        else if (next === 'orders') {
            close()
            router.navigate('/orders')
        } else close()
    }

    return (
        <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
                <View style={styles.headerRow}>
                    <View style={styles.logo}>
                        <Ionicons name="bag-handle" size={22} color="#fff" />
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={close}>
                        <Ionicons name="close" size={26} color={colors.textMuted} />
                    </Pressable>
                </View>
                <Text style={styles.title}>Welcome to {MARKETPLACE_NAME}</Text>
                <Text style={styles.subtitle}>
                    {next === 'checkout'
                        ? 'Sign in to place your order.'
                        : 'Sign in to add to cart, check out and track your orders.'}
                </Text>
            </View>
            <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
                <AccountForm onDone={done} />
            </ScrollView>
        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surface },
    header: {
        paddingHorizontal: 20,
        paddingBottom: 18,
        backgroundColor: '#f0fdf4',
        borderBottomWidth: 1,
        borderBottomColor: colors.brandBorder,
        gap: 6,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    logo: {
        width: 44,
        height: 44,
        borderRadius: radius.md,
        backgroundColor: colors.brand,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: { fontSize: 22, fontWeight: '700', color: colors.text, letterSpacing: -0.4 },
    subtitle: { fontSize: 14, color: colors.textMuted },
    body: { padding: 20, width: '100%', maxWidth: 560, alignSelf: 'center' },
})
