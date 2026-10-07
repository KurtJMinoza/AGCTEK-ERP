import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { useState, type ComponentProps } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { API_BASE, USE_MOCK_API } from '@/src/api/client'
import { MARKETPLACE_NAME } from '@/src/catalog'
import { AccountForm } from '@/src/components/AccountForm'
import { ConfirmDialog } from '@/src/components/ConfirmDialog'
import { PrimaryButton } from '@/src/components/PrimaryButton'
import { ScreenState } from '@/src/components/ScreenState'
import { useAuth } from '@/src/context/AuthContext'
import { useFavorites } from '@/src/context/FavoritesContext'
import { useToast } from '@/src/context/ToastContext'
import { colors, radius, shadow } from '@/src/theme'

type IconName = ComponentProps<typeof Ionicons>['name']

/** Account: sign in / register, profile and delivery details, sign out. */
export default function AccountScreen() {
    const router = useRouter()
    const { customer, loading, signOut } = useAuth()
    const { favorites } = useFavorites()
    const { notify } = useToast()
    const [editing, setEditing] = useState(false)
    const [confirmSignOut, setConfirmSignOut] = useState(false)

    if (loading) return <ScreenState kind="loading" />

    const initials = customer?.fullName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('')

    return (
        <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                {customer ? (
                    <>
                        <View style={styles.profile}>
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>{initials || '?'}</Text>
                            </View>
                            <View style={styles.flex}>
                                <Text style={styles.name}>{customer.fullName}</Text>
                                <Text style={styles.email}>{customer.email}</Text>
                            </View>
                        </View>

                        <View style={styles.links}>
                            <LinkRow icon="receipt-outline" label="My orders" onPress={() => router.navigate('/orders')} />
                            <LinkRow
                                icon="heart-outline"
                                label="Favourites"
                                meta={favorites.size > 0 ? String(favorites.size) : undefined}
                                onPress={() => router.push('/favorites')}
                            />
                            <LinkRow icon="cart-outline" label="Cart" onPress={() => router.navigate('/cart')} last />
                        </View>

                        <View style={styles.card}>
                            <View style={styles.cardHead}>
                                <Text style={styles.cardTitle}>Delivery details</Text>
                                {!editing ? (
                                    <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setEditing(true)}>
                                        <Text style={styles.link}>Edit</Text>
                                    </Pressable>
                                ) : null}
                            </View>
                            {editing ? (
                                <>
                                    <AccountForm onDone={() => setEditing(false)} />
                                    <PrimaryButton title="Cancel" variant="ghost" onPress={() => setEditing(false)} />
                                </>
                            ) : (
                                <View style={styles.details}>
                                    <Detail icon="person-outline" text={customer.fullName} />
                                    <Detail icon="call-outline" text={customer.phone || '—'} />
                                    <Detail
                                        icon="location-outline"
                                        text={
                                            [customer.addressLine1, customer.city, customer.region, customer.postalCode]
                                                .filter(Boolean)
                                                .join(', ') || '—'
                                        }
                                    />
                                    <Text style={styles.hint}>Used to fill in checkout automatically.</Text>
                                </View>
                            )}
                        </View>

                        <PrimaryButton
                            title="Sign out"
                            icon="log-out-outline"
                            variant="secondary"
                            onPress={() => setConfirmSignOut(true)}
                        />
                    </>
                ) : (
                    <View style={styles.card}>
                        <View style={styles.welcome}>
                            <View style={styles.logo}>
                                <Ionicons name="bag-handle" size={22} color="#fff" />
                            </View>
                            <Text style={styles.cardTitle}>Welcome to {MARKETPLACE_NAME}</Text>
                            <Text style={styles.hint}>Sign in to add to cart, check out and track your orders.</Text>
                        </View>
                        <AccountForm />
                    </View>
                )}

                <Text style={styles.source}>
                    {USE_MOCK_API ? 'Demo mode · sample data' : `Connected to AGCTEK ERP · ${API_BASE}`}
                </Text>
            </ScrollView>

            <ConfirmDialog
                visible={confirmSignOut}
                tone="warning"
                title="Sign out?"
                confirmText="Sign out"
                onConfirm={() => {
                    setConfirmSignOut(false)
                    setEditing(false)
                    void signOut().then(() => notify('success', 'Signed out', 'Your cart stays on this device.'))
                }}
                onCancel={() => setConfirmSignOut(false)}
            >
                <Text style={styles.dialogText}>You will need to sign in again to check out or see your orders.</Text>
            </ConfirmDialog>
        </KeyboardAvoidingView>
    )
}

function LinkRow({
    icon,
    label,
    meta,
    last,
    onPress,
}: {
    icon: IconName
    label: string
    meta?: string
    last?: boolean
    onPress: () => void
}) {
    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [styles.linkRow, !last && styles.linkBorder, pressed && styles.pressed]}
        >
            <View style={styles.linkIcon}>
                <Ionicons name={icon} size={18} color={colors.brand} />
            </View>
            <Text style={styles.linkLabel}>{label}</Text>
            {meta ? <Text style={styles.linkMeta}>{meta}</Text> : null}
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
    )
}

function Detail({ icon, text }: { icon: IconName; text: string }) {
    return (
        <View style={styles.detail}>
            <Ionicons name={icon} size={16} color={colors.textMuted} style={styles.detailIcon} />
            <Text style={styles.detailText}>{text}</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    content: { padding: 16, gap: 14, width: '100%', maxWidth: 640, alignSelf: 'center' },
    profile: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        borderRadius: radius.lg,
        backgroundColor: colors.brand,
        padding: 18,
    },
    avatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: { fontSize: 20, fontWeight: '800', color: colors.brand },
    name: { fontSize: 18, fontWeight: '700', color: '#fff' },
    email: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
    links: {
        ...shadow,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 14,
    },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
    linkBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
    pressed: { opacity: 0.7 },
    linkIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.brandSoft,
        alignItems: 'center',
        justifyContent: 'center',
    },
    linkLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.text },
    linkMeta: { fontSize: 13, fontWeight: '600', color: colors.brandText },
    card: {
        ...shadow,
        gap: 14,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
    },
    cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    link: { fontSize: 14, fontWeight: '700', color: colors.brandText },
    details: { gap: 10 },
    detail: { flexDirection: 'row', gap: 10 },
    detailIcon: { marginTop: 2 },
    detailText: { flex: 1, fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
    hint: { fontSize: 13, color: colors.textMuted },
    welcome: { gap: 6 },
    logo: {
        width: 44,
        height: 44,
        borderRadius: radius.md,
        backgroundColor: colors.brand,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    source: { textAlign: 'center', fontSize: 12, color: colors.textFaint, marginTop: 4 },
    dialogText: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
})
