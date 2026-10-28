import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Image,
    Linking,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native'
import {
    useFocusEffect,
    useLocalSearchParams,
    useNavigation,
    useRouter,
} from 'expo-router'
import { CashReceivedSheet } from '@/src/components/CashReceivedSheet'
import { DamageReportSection } from '@/src/components/DamageReportSection'
import { PrimaryButton } from '@/src/components/PrimaryButton'
import { SignaturePad } from '@/src/components/SignaturePad'
import { StatusBadge } from '@/src/components/StatusBadge'
import {
    apiArriveStop,
    apiCashReceived,
    apiDeliverStop,
    apiGetTrip,
} from '@/src/api/client'
import { capturePhotoDataUrl } from '@/src/utils/camera'
import { formatMoney } from '@/src/utils/money'
import {
    LINK_ACTION_LABEL,
    LOAD_FAILURE_CODES,
    STOP_KIND_LABEL,
    stopKind,
    type StopKind,
} from '@/src/utils/stopKind'
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

/** Same rules as the API: load stops fail only for operational reasons, returns never fail. */
const REASONS_BY_KIND: Record<StopKind, typeof FAILURE_REASONS> = {
    DELIVER: FAILURE_REASONS,
    LOAD: FAILURE_REASONS.filter((r) => LOAD_FAILURE_CODES.includes(r.code)),
    RETURN: [],
}

const COPY: Record<
    StopKind,
    {
        notes: string
        confirm: string
        failHeading: string
        completed: string
        failed: string
    }
> = {
    DELIVER: {
        notes: 'POD notes',
        confirm: 'Confirm delivered',
        failHeading: 'Could not deliver?',
        completed:
            'Delivered. Collect cash if due and report any damage, then go back to continue the route.',
        failed: 'Delivery failed',
    },
    LOAD: {
        notes: 'Load notes',
        confirm: 'Confirm loaded',
        failHeading: 'Could not load?',
        completed: 'Loaded. Go back to continue the route.',
        failed: 'Load failed',
    },
    RETURN: {
        notes: 'Notes',
        confirm: 'Confirm returned to hub',
        failHeading: '',
        completed: 'Returned to hub.',
        failed: 'Return failed',
    },
}

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
    const [cashSheetOpen, setCashSheetOpen] = useState(false)
    const [cashBusy, setCashBusy] = useState(false)
    const [cashError, setCashError] = useState<string | null>(null)
    /** One id per collection attempt — a retry after a dropped response replays, never double-collects. */
    const [cashActionId, setCashActionId] = useState<string | null>(null)
    const [cashReceipt, setCashReceipt] = useState<string | null>(null)

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
        try {
            const dataUrl = await capturePhotoDataUrl()
            if (dataUrl) setPhotoUri(dataUrl)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not take photo')
        }
    }

    const onArrive = async () => {
        if (!tripId || !stopId) return
        setBusy(true)
        setError(null)
        try {
            setTrip(
                await apiArriveStop(
                    tripId,
                    stopId,
                    await captureStopMeta({ requireFix: kind === 'DELIVER' }),
                ),
            )
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Arrive failed')
        } finally {
            setBusy(false)
        }
    }

    const openCashSheet = () => {
        setCashError(null)
        setCashActionId(
            (current) =>
                current ?? `cash-${stopId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        )
        setCashSheetOpen(true)
    }

    const onConfirmCash = async (amountReceived: number) => {
        if (!tripId || !stopId || !cashActionId) return
        setCashBusy(true)
        setCashError(null)
        try {
            const { trip: updated, collection } = await apiCashReceived(tripId, stopId, {
                ...(await captureStopMeta()),
                clientActionId: cashActionId,
                amountReceived,
            })
            setTrip(updated)
            setCashSheetOpen(false)
            setCashActionId(null)
            setCashReceipt(
                collection.change != null
                    ? `Cash collected. Change ${formatMoney(collection.change, collection.currency)}.`
                    : 'Cash already recorded for this stop.',
            )
        } catch (err) {
            setCashError(err instanceof Error ? err.message : 'Could not record cash')
        } finally {
            setCashBusy(false)
        }
    }

    const kind = stopKind(stop?.stopType)

    // Delivered but the COD not recorded yet: confirm before the driver leaves the stop.
    const navigation = useNavigation()
    const cashStillDue =
        kind === 'DELIVER' &&
        stop?.status === 'COMPLETED' &&
        stop.collection?.status === 'PENDING' &&
        stop.collection.amountDue != null
    useEffect(() => {
        if (!cashStillDue) return
        return navigation.addListener('beforeRemove', (event) => {
            event.preventDefault()
            Alert.alert(
                'Cash not recorded',
                'This delivery is Cash on Delivery and the cash is not recorded yet.',
                [
                    { text: 'Stay', style: 'cancel' },
                    {
                        text: 'Leave anyway',
                        style: 'destructive',
                        onPress: () => navigation.dispatch(event.data.action),
                    },
                ],
            )
        })
    }, [navigation, cashStillDue])

    const openPhone = (scheme: 'tel' | 'sms', phone: string) => {
        Linking.openURL(`${scheme}:${phone.replace(/[^\d+]/g, '')}`).catch(() =>
            setError(scheme === 'tel' ? 'Could not start a call' : 'Could not open messages'),
        )
    }

    const onComplete = async (outcome: 'DELIVERED' | 'FAILED') => {
        if (!tripId || !stopId) return
        if (outcome === 'FAILED' && !failureCode) {
            setError('Choose why the stop failed')
            return
        }
        if (outcome === 'FAILED' && failureCode === 'OTHER' && !failureReason.trim()) {
            setError('Describe what happened')
            return
        }
        const deliveringToCustomer = outcome === 'DELIVERED' && kind === 'DELIVER'
        if (deliveringToCustomer && (!photoUri || !signatureUrl)) {
            setError('Take a photo and get the customer signature first')
            return
        }
        setBusy(true)
        setError(null)
        try {
            const updated = await apiDeliverStop(tripId, stopId, {
                ...(await captureStopMeta({ requireFix: deliveringToCustomer })),
                outcome,
                podNotes: notes || null,
                podPhotoUrl: photoUri,
                // A customer signature only applies to deliveries (the API rejects it elsewhere).
                podSignatureUrl: deliveringToCustomer ? signatureUrl : null,
                ...(outcome === 'FAILED'
                    ? { reasonCode: failureCode!, failureReason: failureReason.trim() || null }
                    : {}),
            })
            setTrip(updated)
            // Stay after a delivery so the driver can collect COD / report damage.
            if (outcome === 'FAILED' || kind !== 'DELIVER') router.back()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not complete the stop')
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

    const copy = COPY[kind]
    const reasons = REASONS_BY_KIND[kind]
    // Mirrors backend rules — the API stays authoritative and its errors are shown as-is.
    const tripInTransit = trip?.status === 'IN_TRANSIT'
    const blockingStop = trip?.allowOutOfOrder
        ? undefined
        : (trip?.stops ?? [])
              .filter((s) => s.sequence < stop.sequence && !TERMINAL.includes(s.status))
              .sort((a, b) => a.sequence - b.sequence)[0]
    const canArrive = tripInTransit && stop.status === 'PENDING' && !blockingStop
    const canComplete = tripInTransit && stop.status === 'ARRIVED'
    const podMissing = kind === 'DELIVER' && (!photoUri || !signatureUrl)
    const failureLabel = FAILURE_REASONS.find((r) => r.code === stop.failureCode)?.label
    // COD is only ever on deliver stops (the API attaches it from drop-off shipments).
    const cod = kind === 'DELIVER' ? (stop.collection ?? null) : null
    // Same window as Confirm delivered, plus right after POD (server allows ARRIVED / COMPLETED).
    const canCollectCash =
        cod?.status === 'PENDING' && (canComplete || stop.status === 'COMPLETED')
    // The API only sends contacts for open deliver stops; show them once the route is running.
    const contacts =
        kind === 'DELIVER' && tripInTransit && !TERMINAL.includes(stop.status)
            ? (stop.contacts ?? [])
            : []

    return (
        <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.header}>
                <Text style={styles.title}>
                    #{stop.sequence} {stop.name ?? 'Stop'}
                </Text>
                <StatusBadge status={stop.status} />
            </View>
            <Text style={styles.kind}>{STOP_KIND_LABEL[kind]}</Text>
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

            {contacts.length > 0 ? (
                <>
                    <Text style={styles.section}>Customer</Text>
                    {contacts.map((contact) => (
                        <View key={contact.phone} style={styles.manifestRow}>
                            <Text style={styles.ref}>{contact.name ?? 'Customer'}</Text>
                            <Text style={styles.manifestMeta}>
                                {contact.phone} · {contact.orderNumber}
                            </Text>
                            <View style={styles.contactActions}>
                                <PrimaryButton
                                    title="Call"
                                    variant="secondary"
                                    onPress={() => openPhone('tel', contact.phone)}
                                    style={{ flex: 1 }}
                                />
                                <PrimaryButton
                                    title="SMS"
                                    variant="secondary"
                                    onPress={() => openPhone('sms', contact.phone)}
                                    style={{ flex: 1 }}
                                />
                            </View>
                        </View>
                    ))}
                </>
            ) : null}

            <Text style={styles.section}>Manifest</Text>
            {(stop.shipments ?? []).map((link) => (
                <View key={link.id} style={styles.manifestRow}>
                    <Text style={styles.ref}>
                        {link.shipment?.reference ?? link.shipmentId}
                    </Text>
                    <Text style={styles.manifestMeta}>
                        {LINK_ACTION_LABEL[link.action] ?? link.action} ·{' '}
                        {(link.shipment?.quantity ?? 0).toLocaleString()} items
                        {link.shipment?.customerName
                            ? ` · ${link.shipment.customerName}`
                            : ''}
                    </Text>
                </View>
            ))}

            {cod ? (
                <>
                    <Text style={styles.section}>Payment · Cash on delivery</Text>
                    <View style={styles.manifestRow}>
                        {cod.status === 'COLLECTED' ? (
                            <Text style={styles.codCollected}>
                                Collected {formatMoney(cod.amountCollected, cod.currency)}
                            </Text>
                        ) : cod.status === 'PENDING' ? (
                            <Text style={styles.codDue}>
                                {cod.amountDue != null
                                    ? `Collect ${formatMoney(cod.amountDue, cod.currency)}`
                                    : 'Amount due unavailable — contact dispatch'}
                            </Text>
                        ) : (
                            <Text style={styles.manifestMeta}>
                                Not collectible — payment{' '}
                                {cod.orders.map((o) => o.paymentStatus ?? 'missing').join(', ')}
                            </Text>
                        )}
                        <Text style={styles.manifestMeta}>
                            {cod.orders.map((o) => o.orderNumber).join(', ')}
                        </Text>
                    </View>
                    {cashReceipt ? <Text style={styles.savedSig}>{cashReceipt}</Text> : null}
                    {canCollectCash ? (
                        <PrimaryButton
                            title="Cash received"
                            disabled={cod.amountDue == null}
                            onPress={openCashSheet}
                        />
                    ) : null}
                    {cod.status === 'PENDING' && cod.amountDue != null ? (
                        <CashReceivedSheet
                            visible={cashSheetOpen}
                            amountDue={cod.amountDue}
                            currency={cod.currency}
                            busy={cashBusy}
                            error={cashError}
                            onCancel={() => setCashSheetOpen(false)}
                            onConfirm={(amount) => void onConfirmCash(amount)}
                        />
                    ) : null}
                </>
            ) : null}

            {canComplete ? (
                <>
                    <Text style={styles.section}>{copy.notes}</Text>
                    <TextInput
                        value={notes}
                        onChangeText={setNotes}
                        placeholder="Notes…"
                        multiline
                        style={styles.notes}
                    />

                    <Text style={styles.section}>
                        {kind === 'DELIVER' ? 'Photo (required)' : 'Photo (optional)'}
                    </Text>
                    <PrimaryButton
                        title={photoUri ? 'Retake photo' : 'Take photo'}
                        variant="secondary"
                        onPress={() => void pickPhoto()}
                    />
                    {photoUri ? (
                        <Image source={{ uri: photoUri }} style={styles.photo} />
                    ) : null}

                    {kind === 'DELIVER' ? (
                        <>
                            <Text style={styles.section}>Customer signature (required)</Text>
                            <SignaturePad
                                onOK={(data) => setSignatureUrl(data)}
                                onEmpty={() => setSignatureUrl(null)}
                            />
                            {signatureUrl ? (
                                <Text style={styles.savedSig}>Signature saved</Text>
                            ) : null}
                            <Text style={styles.acceptHint}>
                                The customer receives all items. If something is
                                damaged, deliver it and use Report damage — the
                                customer can request a refund or replacement.
                            </Text>
                        </>
                    ) : null}

                    {podMissing ? (
                        <Text style={styles.acceptHint}>
                            Proof of delivery needs a photo, the customer signature
                            and your location.
                        </Text>
                    ) : null}
                    <PrimaryButton
                        title={copy.confirm}
                        loading={busy}
                        disabled={podMissing}
                        onPress={() => void onComplete('DELIVERED')}
                        style={{ marginTop: 16 }}
                    />

                    {reasons.length > 0 ? (
                        <>
                            <Text style={styles.section}>{copy.failHeading}</Text>
                            <View style={styles.chips}>
                                {reasons.map((reason) => {
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
                                onPress={() => void onComplete('FAILED')}
                                style={{ marginTop: 10 }}
                            />
                        </>
                    ) : (
                        <Text style={styles.acceptHint}>
                            Something wrong at the hub? Contact dispatch.
                        </Text>
                    )}
                </>
            ) : null}

            {stop.status === 'FAILED' ? (
                <Text style={styles.done}>
                    {copy.failed}
                    {failureLabel ? `: ${failureLabel}` : ''}
                    {stop.failureReason ? ` — ${stop.failureReason}` : ''}. The
                    dispatcher will follow up; continue with the next stop.
                </Text>
            ) : null}
            {stop.status === 'COMPLETED' ? (
                <>
                    <Text style={styles.done}>{copy.completed}</Text>
                    {kind === 'DELIVER' ? (
                        <DamageReportSection tripId={tripId!} stopId={stopId!} />
                    ) : null}
                </>
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
    kind: {
        marginTop: 6,
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: '#fff7ed',
        color: '#c2410c',
        fontWeight: '700',
        fontSize: 13,
        overflow: 'hidden',
    },
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
    contactActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
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
    codDue: { fontSize: 18, fontWeight: '800', color: '#b45309' },
    codCollected: { fontSize: 18, fontWeight: '800', color: '#047857' },
    hint: { marginTop: 16, color: '#92400e', lineHeight: 22, fontSize: 15 },
    acceptHint: { marginTop: 10, color: '#6b7280', lineHeight: 20, fontSize: 14 },
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
