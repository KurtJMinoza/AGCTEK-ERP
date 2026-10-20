import { useCallback, useState } from 'react'
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { PrimaryButton } from '@/src/components/PrimaryButton'
import { StatusBadge } from '@/src/components/StatusBadge'
import { apiGetTrip, apiStartTrip } from '@/src/api/client'
import { stopQty } from '@/src/hooks/useActiveTrip'
import { useLocationPings } from '@/src/hooks/useLocationPings'
import { STOP_KIND_LABEL, stopKind } from '@/src/utils/stopKind'
import type { Trip } from '@/src/types'

export default function TripDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>()
    const router = useRouter()
    const [trip, setTrip] = useState<Trip | null>(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        if (!id) return
        setLoading(true)
        setError(null)
        try {
            setTrip(await apiGetTrip(id))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load trip')
        } finally {
            setLoading(false)
        }
    }, [id])

    useFocusEffect(
        useCallback(() => {
            void reload()
        }, [reload]),
    )

    useLocationPings(trip)

    const onStart = async () => {
        if (!id) return
        setBusy(true)
        setError(null)
        try {
            setTrip(await apiStartTrip(id))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start')
        } finally {
            setBusy(false)
        }
    }

    if (loading && !trip) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#ea580c" />
            </View>
        )
    }

    if (!trip) {
        return (
            <View style={styles.center}>
                <Text style={styles.error}>{error ?? 'Trip not found'}</Text>
            </View>
        )
    }

    const canStart =
        trip.status === 'DISPATCHED' ||
        trip.status === 'ASSIGNED' ||
        trip.status === 'PLANNED'
    // Delivered but COD not yet recorded — the cash can still be entered on that stop.
    const cashPendingStops = (trip.stops ?? []).filter(
        (s) =>
            s.status === 'COMPLETED' &&
            stopKind(s.stopType) === 'DELIVER' &&
            s.collection?.status === 'PENDING',
    )

    return (
        <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={
                <RefreshControl refreshing={loading} onRefresh={reload} />
            }
        >
            <View style={styles.header}>
                <Text style={styles.code}>{trip.code}</Text>
                <StatusBadge status={trip.status} />
            </View>
            <Text style={styles.meta}>
                {trip.vehicle?.plateNumber ?? '—'} · qty{' '}
                {(trip.totalQty ?? 0).toLocaleString()}
            </Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {canStart ? (
                <>
                    <Text style={styles.started}>
                        Start trip to begin execution — stops unlock once the
                        route is in progress.
                    </Text>
                    <PrimaryButton
                        title="Start route"
                        loading={busy}
                        onPress={() => void onStart()}
                        style={{ marginBottom: 16 }}
                    />
                </>
            ) : (
                <Text style={styles.started}>
                    {trip.status === 'IN_TRANSIT'
                        ? `Route in progress — work the stops ${trip.allowOutOfOrder ? 'in any order' : 'in order'}`
                        : `Status: ${trip.status}`}
                </Text>
            )}

            {cashPendingStops.length > 0 ? (
                <View style={styles.cashWarning}>
                    <Text style={styles.cashWarningTitle}>Cash not recorded</Text>
                    <Text style={styles.cashWarningText}>
                        Delivered without recording COD at{' '}
                        {cashPendingStops.map((s) => `#${s.sequence}`).join(', ')}.
                        Open the stop and tap Cash received.
                    </Text>
                </View>
            ) : null}

            <Text style={styles.section}>Stops</Text>
            {(trip.stops ?? []).map((stop) => (
                <Pressable
                    key={stop.id}
                    style={styles.stop}
                    onPress={() =>
                        router.push(`/(app)/stop/${trip.id}/${stop.id}`)
                    }
                >
                    <View style={styles.stopTop}>
                        <Text style={styles.seq}>
                            #{stop.sequence} · {STOP_KIND_LABEL[stopKind(stop.stopType)]}
                        </Text>
                        <StatusBadge status={stop.status} />
                    </View>
                    <Text style={styles.stopName}>
                        {stop.name ?? 'Stop'} · {stopQty(stop)} items
                    </Text>
                    <Text style={styles.address}>{stop.address}</Text>
                </Pressable>
            ))}
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { padding: 20, paddingBottom: 40 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    code: { fontSize: 22, fontWeight: '800', color: '#111827' },
    meta: { marginTop: 8, color: '#6b7280', fontSize: 15 },
    error: { color: '#b91c1c', marginTop: 12 },
    cashWarning: {
        marginBottom: 16,
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#fcd34d',
        backgroundColor: '#fffbeb',
    },
    cashWarningTitle: { fontWeight: '800', color: '#92400e' },
    cashWarningText: { marginTop: 4, color: '#92400e', lineHeight: 20 },
    started: {
        marginVertical: 16,
        color: '#374151',
        fontSize: 15,
        lineHeight: 22,
    },
    section: {
        fontSize: 13,
        fontWeight: '700',
        color: '#9ca3af',
        textTransform: 'uppercase',
        marginBottom: 10,
        letterSpacing: 0.4,
    },
    stop: {
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: 16,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        marginBottom: 10,
    },
    stopTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    seq: { fontWeight: '800', fontSize: 16, color: '#111827' },
    stopName: { marginTop: 8, fontWeight: '600', color: '#111827' },
    address: { marginTop: 4, color: '#6b7280', lineHeight: 20 },
})
