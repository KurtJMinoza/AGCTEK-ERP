import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback } from 'react'
import {
    FlatList,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    View,
} from 'react-native'
import { useAuth } from '@/src/context/AuthContext'
import { useNotifications } from '@/src/hooks/useNotifications'
import { colors, radius, shadow } from '@/src/theme'
import type { Notification } from '@/src/types'
import { formatDateTime } from '@/src/utils/format'
import { openWebPath } from '@/src/utils/tracking'

function NotificationItem({
    item,
    onPress,
}: {
    item: Notification
    onPress: (item: Notification) => void
}) {
    const isApproval = item.title?.toLowerCase().includes('approved') || item.title?.toLowerCase().includes('placed')
    const isCancel =
        item.title?.toLowerCase().includes('cancel') ||
        item.message?.toLowerCase().includes('cancel')

    const iconName = isApproval
        ? 'checkmark-circle'
        : isCancel
          ? 'close-circle'
          : 'information-circle'
    const iconColor = isApproval
        ? colors.brand
        : isCancel
          ? colors.danger
          : '#3b82f6'
    const iconBg = isApproval
        ? colors.brandSoft
        : isCancel
          ? colors.dangerSoft
          : '#eff6ff'

    return (
        <Pressable
            accessibilityRole="button"
            onPress={() => onPress(item)}
            style={({ pressed }) => [
                styles.item,
                !item.isRead && styles.itemUnread,
                pressed && styles.pressed,
            ]}
        >
            <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
                <Ionicons name={iconName} size={22} color={iconColor} />
            </View>
            <View style={styles.itemContent}>
                <View style={styles.itemHeader}>
                    <Text
                        style={[styles.itemTitle, !item.isRead && styles.itemTitleUnread]}
                        numberOfLines={1}
                    >
                        {item.title ?? 'Notification'}
                    </Text>
                    {item.createdAt ? (
                        <Text style={styles.itemTime}>{formatDateTime(item.createdAt)}</Text>
                    ) : null}
                </View>
                {item.message ? (
                    <Text style={styles.itemMessage} numberOfLines={2}>
                        {item.message}
                    </Text>
                ) : null}
            </View>
            {!item.isRead && <View style={styles.unreadDot} />}
        </Pressable>
    )
}

export default function NotificationsScreen() {
    const router = useRouter()
    const { customer } = useAuth()
    const { notifications, unreadCount, loading, refreshing, error, refresh, markRead, markAllRead } =
        useNotifications(customer?.customerId ?? null)

    // Refresh every time the screen is focused
    useFocusEffect(
        useCallback(() => {
            void refresh()
        }, [refresh]),
    )

    const handlePress = async (item: Notification) => {
        if (!item.isRead) await markRead(item.id)
        // Delivery updates carry a signed web tracking link (map + timeline).
        if (item.location?.startsWith('/shop/track/')) {
            await openWebPath(item.location)
            return
        }
        // If the notification is about an order, navigate to orders
        if (
            item.title?.toLowerCase().includes('order') ||
            item.target?.startsWith('SO-') ||
            item.message?.toLowerCase().includes('order')
        ) {
            router.navigate('/orders')
        }
    }

    return (
        <View style={styles.screen}>
            {/* Header row with "Mark all" */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.heading}>Notifications</Text>
                    {unreadCount > 0 && (
                        <Text style={styles.subheading}>
                            {unreadCount} unread
                        </Text>
                    )}
                </View>
                {unreadCount > 0 && (
                    <Pressable
                        accessibilityRole="button"
                        hitSlop={8}
                        onPress={() => void markAllRead()}
                        style={({ pressed }) => [styles.markAllBtn, pressed && styles.pressed]}
                    >
                        <Ionicons name="checkmark-done" size={16} color={colors.brand} />
                        <Text style={styles.markAllText}>Mark all read</Text>
                    </Pressable>
                )}
            </View>

            <FlatList
                data={notifications}
                keyExtractor={(n) => n.id}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={refresh}
                        tintColor={colors.brand}
                    />
                }
                ItemSeparatorComponent={() => <View style={styles.sep} />}
                contentContainerStyle={styles.list}
                renderItem={({ item }) => (
                    <NotificationItem item={item} onPress={(n) => void handlePress(n)} />
                )}
                ListEmptyComponent={
                    loading ? null : (
                        <View style={styles.empty}>
                            {error ? (
                                <>
                                    <Ionicons name="warning-outline" size={40} color={colors.textMuted} />
                                    <Text style={styles.emptyTitle}>Unable to load</Text>
                                    <Text style={styles.emptyBody}>{error}</Text>
                                </>
                            ) : (
                                <>
                                    <View style={styles.emptyIcon}>
                                        <Ionicons name="notifications-outline" size={32} color={colors.textMuted} />
                                    </View>
                                    <Text style={styles.emptyTitle}>No notifications yet</Text>
                                    <Text style={styles.emptyBody}>
                                        When you place an order or its status changes, you&apos;ll see updates here.
                                    </Text>
                                </>
                            )}
                        </View>
                    )
                }
            />
        </View>
    )
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    heading: { fontSize: 20, fontWeight: '700', color: colors.text },
    subheading: { fontSize: 13, color: colors.brand, fontWeight: '600', marginTop: 2 },
    markAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors.brandSoft,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: radius.pill,
    },
    markAllText: { fontSize: 13, fontWeight: '600', color: colors.brand },
    list: { flexGrow: 1 },
    sep: { height: 1, backgroundColor: colors.border },
    item: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: colors.surface,
    },
    itemUnread: { backgroundColor: '#f0fdf4' },
    pressed: { opacity: 0.75 },
    iconWrap: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    itemContent: { flex: 1 },
    itemHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    itemTitle: {
        flex: 1,
        fontSize: 14,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    itemTitleUnread: { fontWeight: '700', color: colors.text },
    itemTime: { fontSize: 11, color: colors.textFaint, flexShrink: 0 },
    itemMessage: {
        fontSize: 13,
        color: colors.textMuted,
        lineHeight: 19,
        marginTop: 3,
    },
    unreadDot: {
        width: 9,
        height: 9,
        borderRadius: 5,
        backgroundColor: colors.brand,
        marginTop: 4,
        flexShrink: 0,
    },
    empty: {
        flex: 1,
        minHeight: 360,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 32,
    },
    emptyIcon: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    emptyBody: {
        fontSize: 14,
        color: colors.textMuted,
        textAlign: 'center',
        lineHeight: 20,
    },
})
