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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
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
    const [cashSheetOpen, setCashSheetOpen] = useState(false)
    const [cashBusy, setCashBusy] = useState(false)
    const [cashError, setCashError] = useState<string | null>(null)
    /** One id per collection attempt — a retry after a dropped response replays, never double-collects. */
    const [cashActionId, setCashActionId] = useState<string | null>(null)
    const [cashReceipt, setCashReceipt] = useState<string | null>(null)
    /** shipmentLineId → qty the customer keeps (defaults to full line qty). */
    const [acceptedByLine, setAcceptedByLine] = useState<Record<string, number>>({})

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
                const next: Record<string, number> = {}
                for (const link of stop.shipments ?? []) {
                    if (link.action !== 'DROPOFF') continue
                    for (const line of link.shipment?.lines ?? []) {
                        const recorded = stop.lines?.find(
                            (l) => l.shipmentLineId === line.id,
                        )?.acceptedQuantity
                        next[line.id] =
                            recorded != null ? recorded : line.quantity
                    }
                }
                setAcceptedByLine(next)
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
            setTrip(await apiArriveStop(tripId, stopId, await captureStopMeta()))
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

    const dropoffLines = useMemo(() => {
        const rows: Array<{
            shipmentLineId: string
            label: string
            quantity: number
        }> = []
        for (const link of stop?.shipments ?? []) {
            if (link.action !== 'DROPOFF') continue
            for (const line of link.shipment?.lines ?? []) {
                rows.push({
                    shipmentLineId: line.id,
                    label:
                        line.description ??
                        line.materialCode ??
                        link.shipment?.reference ??
                        'Item',
                    quantity: line.quantity,
                })
            }
        }
        return rows
    }, [stop])

    const acceptedLinesPayload = useMemo(() => {
        if (!dropoffLines.length) return undefined
        const lines = dropoffLines.map((l) => ({
            shipmentLineId: l.shipmentLineId,
            acceptedQuantity: acceptedByLine[l.shipmentLineId] ?? l.quantity,
        }))
        const anyReject = lines.some(
            (l) =>
                l.acceptedQuantity <
                (dropoffLines.find((d) => d.shipmentLineId === l.shipmentLineId)
                    ?.quantity ?? 0),
        )
        return anyReject ? lines : undefined
    }, [dropoffLines, acceptedByLine])

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
        if (outcome === 'DELIVERED' && dropoffLines.length) {
            const totalAccepted = dropoffLines.reduce(
                (n, l) => n + (acceptedByLine[l.shipmentLineId] ?? l.quantity),
                0,
            )
            if (totalAccepted === 0) {
                setError('Refuse all units with Mark failed — or accept at least one unit')
                return
            }
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
                ...(outcome === 'DELIVERED' && acceptedLinesPayload
                    ? { acceptedLines: acceptedLinesPayload }
                    : {}),
            })
            setTrip(updated)
            // Stay after a delivery so the driver can collect COD / report more damage.
            if (outcome === 'FAILED') router.back()
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
    const cod = stop.collection ?? null
    // Same window as Confirm delivered, plus right after POD (server allows ARRIVED / COMPLETED).
    const canCollectCash =
        cod?.status === 'PENDING' && (canDeliverOrFail || stop.status === 'COMPLETED')

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

            {canDeliverOrFail ? (
                <>
                    {dropoffLines.length > 0 ? (
                        <>
                            <Text style={styles.section}>Accepted qty</Text>
                            <Text style={styles.acceptHint}>
                                Customer keeps these units and pays COD for them. Reduce
                                qty for damaged/rejected units (or Mark failed to refuse
                                all).
                            </Text>
                            {dropoffLines.map((line) => {
                                const accepted =
                                    acceptedByLine[line.shipmentLineId] ?? line.quantity
                                const rejected = line.quantity - accepted
                                return (
                                    <View key={line.shipmentLineId} style={styles.manifestRow}>
                                        <Text style={styles.ref} numberOfLines={2}>
                                            {line.label}
                                        </Text>
                                        <Text style={styles.manifestMeta}>
                                            Shipped {line.quantity}
                                            {rejected > 0
                                                ? ` · reject ${rejected}`
                                                : ''}
                                        </Text>
                                        <View style={styles.qtyRow}>
                                            <Pressable
                                                accessibilityLabel="Decrease accepted"
                                                disabled={accepted <= 0 || busy}
                                                onPress={() =>
                                                    setAcceptedByLine((prev) => ({
                                                        ...prev,
                                                        [line.shipmentLineId]: Math.max(
                                                            0,
                                                            accepted - 1,
                                                        ),
                                                    }))
                                                }
                                                style={styles.qtyBtn}
                                            >
                                                <Text style={styles.qtyBtnLabel}>−</Text>
                                            </Pressable>
                                            <Text style={styles.qtyValue}>{accepted}</Text>
                                            <Pressable
                                                accessibilityLabel="Increase accepted"
                                                disabled={accepted >= line.quantity || busy}
                                                onPress={() =>
                                                    setAcceptedByLine((prev) => ({
                                                        ...prev,
                                                        [line.shipmentLineId]: Math.min(
                                                            line.quantity,
                                                            accepted + 1,
                                                        ),
                                                    }))
                                                }
                                                style={styles.qtyBtn}
                                            >
                                                <Text style={styles.qtyBtnLabel}>+</Text>
                                            </Pressable>
                                        </View>
                                    </View>
                                )
                            })}
                        </>
                    ) : null}

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
                <>
                    <Text style={styles.done}>
                        Stop completed. Use back to continue the route.
                    </Text>
                    <DamageReportSection tripId={tripId!} stopId={stopId!} />
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
    codDue: { fontSize: 18, fontWeight: '800', color: '#b45309' },
    codCollected: { fontSize: 18, fontWeight: '800', color: '#047857' },
    hint: { marginTop: 16, color: '#92400e', lineHeight: 22, fontSize: 15 },
    acceptHint: { marginBottom: 10, color: '#6b7280', lineHeight: 20, fontSize: 14 },
    qtyRow: {
        marginTop: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    qtyBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#d1d5db',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f9fafb',
    },
    qtyBtnLabel: { fontSize: 22, fontWeight: '700', color: '#111827', lineHeight: 24 },
    qtyValue: { minWidth: 36, textAlign: 'center', fontSize: 20, fontWeight: '800' },
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
