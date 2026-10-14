import Ionicons from '@expo/vector-icons/Ionicons'
import * as WebBrowser from 'expo-web-browser'
import { useState } from 'react'
import { Share, StyleSheet, Text, View } from 'react-native'
import { commerceApi } from '../api/client'
import { colors, radius } from '../theme'
import type { OrderTracking } from '../types'
import { formatEtaWindow, trackingUrl } from '../utils/tracking'
import { PrimaryButton } from './PrimaryButton'

const SHAREABLE = new Set(['READY_FOR_DELIVERY', 'IN_TRANSIT', 'DELIVERY_FAILED'])

/**
 * Courier status while the order is out for delivery. The map itself lives on
 * the web tracking page (signed link); the app shows the server's delayed
 * status, last update and ETA window only.
 */
export function DeliveryStatusCard({ tracking }: { tracking: OrderTracking }) {
    const [busy, setBusy] = useState<'map' | 'share' | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)

    if (!SHAREABLE.has(tracking.customerStatus)) return null
    const inTransit = tracking.customerStatus === 'IN_TRANSIT'
    const map = tracking.map

    const withLink = async (kind: 'map' | 'share', use: (url: string) => Promise<unknown>) => {
        setBusy(kind)
        setError(null)
        try {
            const { token } = await commerceApi.createTrackingLink(tracking.orderId)
            const url = trackingUrl(token)
            try {
                await use(url)
            } catch {
                setFallbackUrl(url)
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unable to create a tracking link')
        } finally {
            setBusy(null)
        }
    }

    const statusText = !inTransit
        ? null
        : map?.available
          ? `Approximate courier location · ${map.lastUpdatedLabel ?? 'recently'}`
          : map?.reason === 'WAITING_FOR_UPDATE'
            ? 'Waiting for a location update from your courier.'
            : 'Your courier is on the way. Their location will appear once available.'

    return (
        <View style={styles.card}>
            <View style={styles.header}>
                <Ionicons name="bicycle-outline" size={20} color={colors.brand} />
                <Text style={styles.title}>{inTransit ? 'On the way' : 'Delivery tracking'}</Text>
            </View>

            {inTransit && map?.lastMile ? (
                <View style={styles.pill}>
                    <Ionicons name="location-outline" size={14} color={colors.brandText} />
                    <Text style={styles.pillText}>Out for delivery — you're next</Text>
                </View>
            ) : null}

            {inTransit && map?.eta ? (
                <View style={styles.row}>
                    <Ionicons name="time-outline" size={18} color={colors.textMuted} />
                    <Text style={styles.strong}>Estimated arrival {formatEtaWindow(map.eta)}</Text>
                </View>
            ) : null}

            {statusText ? <Text style={styles.muted}>{statusText}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {fallbackUrl ? (
                <Text selectable style={styles.link}>
                    {fallbackUrl}
                </Text>
            ) : null}

            <View style={styles.actions}>
                {inTransit ? (
                    <PrimaryButton
                        title="View live map"
                        icon="map-outline"
                        size="sm"
                        style={styles.flex}
                        loading={busy === 'map'}
                        disabled={busy !== null}
                        onPress={() => void withLink('map', (url) => WebBrowser.openBrowserAsync(url))}
                    />
                ) : null}
                <PrimaryButton
                    title="Share tracking"
                    icon="share-social-outline"
                    variant="secondary"
                    size="sm"
                    style={styles.flex}
                    loading={busy === 'share'}
                    disabled={busy !== null}
                    onPress={() =>
                        void withLink('share', (url) =>
                            Share.share({
                                title: `Track ${tracking.orderNumber}`,
                                message: `Track order ${tracking.orderNumber}: ${url}`,
                                url,
                            }),
                        )
                    }
                />
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    card: {
        gap: 12,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.brandBorder,
        padding: 16,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontSize: 16, fontWeight: '700', color: colors.text },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        backgroundColor: colors.brandSoft,
        borderRadius: radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    pillText: { fontSize: 12, fontWeight: '700', color: colors.brandText },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    strong: { fontSize: 14, fontWeight: '600', color: colors.text },
    muted: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
    error: { fontSize: 13, color: colors.danger },
    link: { fontSize: 12, color: colors.brandText },
    actions: { flexDirection: 'row', gap: 10 },
    flex: { flex: 1 },
})
