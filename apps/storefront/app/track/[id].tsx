import { useLocalSearchParams } from 'expo-router'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Card } from '@/src/components/Card'
import { MapPlaceholder } from '@/src/components/MapPlaceholder'
import { OrderStatusBadge } from '@/src/components/OrderStatusBadge'
import { ScreenState } from '@/src/components/ScreenState'
import { TrackingTimeline } from '@/src/components/TrackingTimeline'
import { useTracking } from '@/src/hooks/useOrders'
import { colors } from '@/src/theme'
import { formatDateTime } from '@/src/utils/format'

export default function TrackOrderScreen() {
    const { id } = useLocalSearchParams<{ id: string }>()
    const { data: tracking, loading, refreshing, error, refresh } = useTracking(id)

    if (loading && !tracking) return <ScreenState kind="loading" />
    if (error && !tracking) return <ScreenState kind="error" message={error} onRetry={refresh} />
    if (!tracking) return <ScreenState kind="empty" title="Tracking not available" />

    return (
        <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />
            }
        >
            <Card>
                <View style={styles.headerRow}>
                    <Text style={styles.number}>{tracking.orderNumber}</Text>
                    <OrderStatusBadge status={tracking.status} />
                </View>
                {tracking.eta ? (
                    <Text style={styles.eta}>Estimated arrival {formatDateTime(tracking.eta)}</Text>
                ) : null}
                {tracking.lastKnownArea ? (
                    <Text style={styles.meta}>Last update near {tracking.lastKnownArea}</Text>
                ) : null}
            </Card>

            <MapPlaceholder area={tracking.lastKnownArea} />

            <Card title="Delivery progress">
                <TrackingTimeline tracking={tracking} />
            </Card>

            <Text style={styles.hint}>Pull down to refresh.</Text>
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    content: { padding: 16, gap: 16 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    number: { fontSize: 17, fontWeight: '700', color: colors.text },
    eta: { marginTop: 4, fontSize: 15, fontWeight: '700', color: colors.brand },
    meta: { fontSize: 13, color: colors.textMuted },
    hint: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
})
