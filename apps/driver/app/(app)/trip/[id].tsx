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
        trip.status === 'ASSIGNED' || trip.status === 'PLANNED'

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
                <PrimaryButton
                    title="Start route"
                    loading={busy}
                    onPress={() => void onStart()}
                    style={{ marginVertical: 16 }}
                />
            ) : (
                <Text style={styles.started}>
                    {trip.status === 'IN_TRANSIT'
                        ? 'Route in progress — tap a stop to arrive / POD'
                        : `Status: ${trip.status}`}
                </Text>
            )}

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
                        <Text style={styles.seq}>#{stop.sequence}</Text>
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
