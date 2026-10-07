import { useCallback, useMemo, useState } from 'react'
import {
    ActivityIndicator,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { PrimaryButton } from '@/src/components/PrimaryButton'
import { SignaturePad } from '@/src/components/SignaturePad'
import { StatusBadge } from '@/src/components/StatusBadge'
import {
    apiArriveStop,
    apiDeliverStop,
    apiGetTrip,
} from '@/src/api/client'
import { captureStopMeta } from '@/src/api/stopMeta'
import { stopQty } from '@/src/hooks/useActiveTrip'
import type { DeliveryFailureReason, Trip, TripStop } from '@/src/types'

const FAILURE_REASONS: Array<{ code: DeliveryFailureReason; label: string }> = [
    { code: 'CUSTOMER_UNAVAILABLE', label: 'Customer not available' },
    { code: 'CUSTOMER_REFUSED', label: 'Customer refused' },
    { code: 'WRONG_ADDRESS', label: 'Wrong address' },
    { code: 'DAMAGED_GOODS', label: 'Damaged goods' },
    { code: 'VEHICLE_ISSUE', label: 'Vehicle issue' },
    { code: 'PAYMENT_ISSUE', label: 'Payment issue' },
    { code: 'OTHER', label: 'Other' },
]

const TERMINAL = ['COMPLETED', 'FAILED', 'SKIPPED']

export default function StopDetailScreen() {
    const { tripId, stopId } = useLocalSearchParams<{
        tripId: string
        stopId: string
    }>()
    const router = useRouter()
    const [trip, setTrip] = useState<Trip | null>(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [notes, setNotes] = useState('')
    const [photoUri, setPhotoUri] = useState<string | null>(null)
    const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
    const [failureReason, setFailureReason] = useState('')
    const [failureCode, setFailureCode] = useState<DeliveryFailureReason | null>(null)

    const reload = useCallback(async () => {
        if (!tripId) return
        setLoading(true)
        setError(null)
        try {
            const data = await apiGetTrip(tripId)
            setTrip(data)
            const stop = data.stops?.find((s) => s.id === stopId)
            if (stop) {
                setNotes(stop.podNotes ?? stop.notes ?? '')
                setPhotoUri(stop.podPhotoUrl)
                setSignatureUrl(stop.podSignatureUrl)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load stop')
        } finally {
            setLoading(false)
        }
    }, [tripId, stopId])

    useFocusEffect(
        useCallback(() => {
            void reload()
        }, [reload]),
    )

    const stop: TripStop | undefined = useMemo(
        () => trip?.stops?.find((s) => s.id === stopId),
        [trip, stopId],
    )

    const pickPhoto = async () => {
        const perm = await ImagePicker.requestCameraPermissionsAsync()
        if (!perm.granted) {
            const lib = await ImagePicker.requestMediaLibraryPermissionsAsync()
            if (!lib.granted) {
                setError('Camera / photo permission required')
                return
            }
        }
        const result = await ImagePicker.launchCameraAsync({
            quality: 0.55,
            base64: true,
            allowsEditing: true,
        }).catch(async () =>
            ImagePicker.launchImageLibraryAsync({
                quality: 0.55,
                base64: true,
                allowsEditing: true,
            }),
        )
        if (result.canceled || !result.assets[0]) return
        const asset = result.assets[0]
        const dataUrl = asset.base64
            ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`
            : asset.uri
        setPhotoUri(dataUrl)
    }

    const onArrive = async () => {
        if (!tripId || !stopId) return
        setBusy(true)
        setError(null)
        try {
            setTrip(await apiArriveStop(tripId, stopId, await captureStopMeta()))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Arrive failed')
        } finally {
            setBusy(false)
        }
    }

    const onDeliver = async (outcome: 'DELIVERED' | 'FAILED') => {
        if (!tripId || !stopId) return
        if (outcome === 'FAILED' && !failureCode) {
            setError('Choose why the delivery failed')
            return
        }
        if (outcome === 'FAILED' && failureCode === 'OTHER' && !failureReason.trim()) {
            setError('Describe what happened')
            return
        }
        setBusy(true)
        setError(null)
        try {
            const updated = await apiDeliverStop(tripId, stopId, {
                ...(await captureStopMeta()),
                outcome,
                podNotes: notes || null,
                podPhotoUrl: photoUri,
                podSignatureUrl: outcome === 'DELIVERED' ? signatureUrl : null,
                ...(outcome === 'FAILED'
                    ? { reasonCode: failureCode!, failureReason: failureReason.trim() || null }
                    : {}),
            })
            setTrip(updated)
            router.back()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Deliver failed')
        } finally {
            setBusy(false)
        }
    }

    if (loading && !stop) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#ea580c" />
            </View>
        )
    }

    if (!stop) {
        return (
            <View style={styles.center}>
                <Text style={styles.error}>{error ?? 'Stop not found'}</Text>
            </View>
        )
    }

    // Mirrors backend rules — the API stays authoritative and its errors are shown as-is.
    const tripInTransit = trip?.status === 'IN_TRANSIT'
    const blockingStop = trip?.allowOutOfOrder
        ? undefined
        : (trip?.stops ?? [])
              .filter((s) => s.sequence < stop.sequence && !TERMINAL.includes(s.status))
              .sort((a, b) => a.sequence - b.sequence)[0]
    const canArrive = tripInTransit && stop.status === 'PENDING' && !blockingStop
    const canDeliverOrFail = tripInTransit && stop.status === 'ARRIVED'
    const failureLabel = FAILURE_REASONS.find((r) => r.code === stop.failureCode)?.label

    return (
        <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.header}>
                <Text style={styles.title}>
                    #{stop.sequence} {stop.name ?? 'Stop'}
                </Text>
                <StatusBadge status={stop.status} />
            </View>
            <Text style={styles.address}>{stop.address}</Text>
            <Text style={styles.qty}>{stopQty(stop)} items on manifest</Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {!tripInTransit && !TERMINAL.includes(stop.status) ? (
                <Text style={styles.hint}>Start trip to begin execution.</Text>
            ) : null}
            {tripInTransit && stop.status === 'PENDING' && blockingStop ? (
                <Text style={styles.hint}>
                    Finish stop #{blockingStop.sequence}
                    {blockingStop.name ? ` (${blockingStop.name})` : ''} first — stops
                    must be done in order.
                </Text>
            ) : null}

            {canArrive ? (
                <PrimaryButton
                    title="Arrive at stop"
                    loading={busy}
                    onPress={() => void onArrive()}
                    style={{ marginTop: 16 }}
                />
            ) : null}

            <Text style={styles.section}>Manifest</Text>
            {(stop.shipments ?? []).map((link) => (
                <View key={link.id} style={styles.manifestRow}>
                    <Text style={styles.ref}>
                        {link.shipment?.reference ?? link.shipmentId}
                    </Text>
                    <Text style={styles.manifestMeta}>
                        {link.action} ·{' '}
                        {(link.shipment?.quantity ?? 0).toLocaleString()} items
                        {link.shipment?.customerName
                            ? ` · ${link.shipment.customerName}`
                            : ''}
                    </Text>
                </View>
            ))}

            {canDeliverOrFail ? (
                <>
                    <Text style={styles.section}>POD notes</Text>
                    <TextInput
                        value={notes}
                        onChangeText={setNotes}
                        placeholder="Delivery notes…"
                        multiline
                        style={styles.notes}
                    />

                    <Text style={styles.section}>Photo</Text>
                    <PrimaryButton
                        title={photoUri ? 'Retake photo' : 'Take photo'}
                        variant="secondary"
                        onPress={() => void pickPhoto()}
                    />
                    {photoUri ? (
                        <Image source={{ uri: photoUri }} style={styles.photo} />
                    ) : null}

                    <Text style={styles.section}>Signature</Text>
                    <SignaturePad
                        onOK={(data) => setSignatureUrl(data)}
                        onEmpty={() => setSignatureUrl(null)}
                    />
                    {signatureUrl ? (
                        <Text style={styles.savedSig}>Signature saved</Text>
                    ) : null}

                    <PrimaryButton
                        title="Confirm delivered"
                        loading={busy}
                        onPress={() => void onDeliver('DELIVERED')}
                        style={{ marginTop: 16 }}
                    />

                    <Text style={styles.section}>Could not deliver?</Text>
                    <View style={styles.chips}>
                        {FAILURE_REASONS.map((reason) => {
                            const selected = failureCode === reason.code
                            return (
                                <Pressable
                                    key={reason.code}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected }}
                                    onPress={() => setFailureCode(reason.code)}
                                    style={[styles.chip, selected && styles.chipSelected]}
                                >
                                    <Text
                                        style={[
                                            styles.chipLabel,
                                            selected && styles.chipLabelSelected,
                                        ]}
                                    >
                                        {reason.label}
                                    </Text>
                                </Pressable>
                            )
                        })}
                    </View>
                    <TextInput
                        value={failureReason}
                        onChangeText={setFailureReason}
                        placeholder={
                            failureCode === 'OTHER'
                                ? 'Describe what happened (required)'
                                : 'Notes (optional)'
                        }
                        style={[styles.input, { marginTop: 10 }]}
                    />
                    <PrimaryButton
                        title="Mark failed"
                        variant="danger"
                        loading={busy}
                        disabled={!failureCode}
                        onPress={() => void onDeliver('FAILED')}
                        style={{ marginTop: 10 }}
                    />
                </>
            ) : null}

            {stop.status === 'FAILED' ? (
                <Text style={styles.done}>
                    Delivery failed{failureLabel ? `: ${failureLabel}` : ''}
                    {stop.failureReason ? ` — ${stop.failureReason}` : ''}. The
                    dispatcher will follow up; continue with the next stop.
                </Text>
            ) : null}
            {stop.status === 'COMPLETED' ? (
                <Text style={styles.done}>
                    Stop completed. Use back to continue the route.
                </Text>
            ) : null}
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { padding: 20, paddingBottom: 48 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
    },
    title: { flex: 1, fontSize: 20, fontWeight: '800', color: '#111827' },
    address: { marginTop: 8, color: '#4b5563', lineHeight: 22, fontSize: 15 },
    qty: { marginTop: 6, fontWeight: '600', color: '#111827' },
    error: { color: '#b91c1c', marginTop: 12 },
    section: {
        marginTop: 20,
        marginBottom: 8,
        fontSize: 13,
        fontWeight: '700',
        color: '#9ca3af',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    manifestRow: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        marginBottom: 8,
    },
    ref: { fontWeight: '700', color: '#111827' },
    manifestMeta: { marginTop: 4, color: '#6b7280', fontSize: 13 },
    notes: {
        minHeight: 88,
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 12,
        padding: 12,
        textAlignVertical: 'top',
        backgroundColor: '#fff',
        fontSize: 16,
    },
    input: {
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
        backgroundColor: '#fff',
        fontSize: 16,
    },
    photo: {
        marginTop: 10,
        width: '100%',
        height: 180,
        borderRadius: 12,
        backgroundColor: '#e5e7eb',
    },
    savedSig: { marginTop: 8, color: '#047857', fontWeight: '600' },
    hint: { marginTop: 16, color: '#92400e', lineHeight: 22, fontSize: 15 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: '#fff',
    },
    chipSelected: { borderColor: '#dc2626', backgroundColor: '#fef2f2' },
    chipLabel: { color: '#374151', fontWeight: '600' },
    chipLabelSelected: { color: '#b91c1c' },
    done: { marginTop: 24, color: '#374151', lineHeight: 22 },
})
