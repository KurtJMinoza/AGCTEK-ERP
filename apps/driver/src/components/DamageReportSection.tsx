import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    ActivityIndicator,
    Image,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native'
import { apiGetStopDamage, apiReportStopDamage } from '../api/client'
import type { StopDamageContext } from '../types'
import { capturePhotoDataUrl } from '../utils/camera'
import { PrimaryButton } from './PrimaryButton'

const MAX_PHOTOS = 3

const STATUS_LABEL: Record<string, string> = {
    SUBMITTED: 'Sent to dispatch',
    RETURN_CREATED: 'Return opened',
    CANCELLED: 'Withdrawn',
}

/**
 * Optional damage evidence on a delivered stop. The delivery stays complete — dispatch and
 * sales decide on any return or credit; the driver only records what was damaged.
 */
export function DamageReportSection({
    tripId,
    stopId,
}: {
    tripId: string
    stopId: string
}) {
    const [context, setContext] = useState<StopDamageContext | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [open, setOpen] = useState(false)
    const [shipmentId, setShipmentId] = useState<string | null>(null)
    const [lineId, setLineId] = useState<string | null>(null)
    const [qty, setQty] = useState('1')
    const [description, setDescription] = useState('')
    const [photos, setPhotos] = useState<string[]>([])
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    /** One key per submission attempt — a retry after a dropped response never duplicates. */
    const [submitKey, setSubmitKey] = useState<string | null>(null)

    const load = useCallback(async () => {
        try {
            setContext(await apiGetStopDamage(tripId, stopId))
            setLoadError(null)
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : 'Could not load damage reports')
        }
    }, [tripId, stopId])

    useEffect(() => {
        void load()
    }, [load])

    const shipment = useMemo(
        () =>
            context?.shipments.find((s) => s.id === shipmentId) ??
            (context?.shipments.length === 1 ? context.shipments[0] : undefined),
        [context, shipmentId],
    )
    const line = useMemo(
        () =>
            shipment?.lines.find((l) => l.id === lineId) ??
            (shipment?.lines.length === 1 ? shipment.lines[0] : undefined),
        [shipment, lineId],
    )

    const reset = () => {
        setOpen(false)
        setShipmentId(null)
        setLineId(null)
        setQty('1')
        setDescription('')
        setPhotos([])
        setError(null)
        setSubmitKey(null)
    }

    const startReport = () => {
        setSubmitKey(`dmg-${stopId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
        setOpen(true)
    }

    const addPhoto = async () => {
        try {
            const photo = await capturePhotoDataUrl()
            if (photo) setPhotos((current) => [...current, photo].slice(0, MAX_PHOTOS))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not take photo')
        }
    }

    const submit = async () => {
        const damaged = Number(qty)
        if (!shipment || !line) return setError('Choose the damaged item')
        if (!Number.isInteger(damaged) || damaged < 1 || damaged > line.quantity) {
            return setError(`Damaged quantity must be 1–${line.quantity}`)
        }
        if (!description.trim()) return setError('Describe the damage')
        setBusy(true)
        setError(null)
        try {
            await apiReportStopDamage(tripId, stopId, {
                shipmentId: shipment.id,
                shipmentLineId: line.id,
                damagedQuantity: damaged,
                description: description.trim(),
                photoUrls: photos,
                idempotencyKey: submitKey!,
            })
            reset()
            await load()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not send the report')
        } finally {
            setBusy(false)
        }
    }

    if (!context) {
        return loadError ? (
            <Text style={styles.error}>{loadError}</Text>
        ) : (
            <ActivityIndicator style={{ marginTop: 16 }} color="#ea580c" />
        )
    }

    return (
        <View>
            <Text style={styles.section}>Damage</Text>
            {context.reports.map((report) => (
                <View key={report.id} style={styles.card}>
                    <Text style={styles.ref}>
                        {report.reference} · {report.damagedQuantity} damaged
                    </Text>
                    <Text style={styles.meta}>{report.description}</Text>
                    <Text style={styles.meta}>
                        {STATUS_LABEL[report.status] ?? report.status}
                    </Text>
                </View>
            ))}

            {!context.canReport ? (
                context.reports.length === 0 && context.blockedReason ? (
                    <Text style={styles.meta}>{context.blockedReason}</Text>
                ) : null
            ) : !open ? (
                <PrimaryButton
                    title="Report damage (optional)"
                    variant="secondary"
                    onPress={startReport}
                />
            ) : (
                <View style={styles.card}>
                    <Text style={styles.hint}>
                        The delivery stays complete. Dispatch decides on any return or credit.
                    </Text>

                    {context.shipments.length > 1 ? (
                        <>
                            <Text style={styles.label}>Shipment</Text>
                            <Chips
                                options={context.shipments.map((s) => ({
                                    id: s.id,
                                    label: s.reference,
                                }))}
                                selected={shipment?.id ?? null}
                                onSelect={(id) => {
                                    setShipmentId(id)
                                    setLineId(null)
                                }}
                            />
                        </>
                    ) : null}

                    {shipment ? (
                        <>
                            <Text style={styles.label}>Damaged item</Text>
                            <Chips
                                options={shipment.lines.map((l) => ({
                                    id: l.id,
                                    label: `${l.description ?? l.materialCode ?? `Line ${l.lineNo}`} (${l.quantity})`,
                                }))}
                                selected={line?.id ?? null}
                                onSelect={setLineId}
                            />
                        </>
                    ) : null}

                    <Text style={styles.label}>
                        Damaged quantity{line ? ` (of ${line.quantity})` : ''}
                    </Text>
                    <TextInput
                        value={qty}
                        onChangeText={setQty}
                        keyboardType="number-pad"
                        style={styles.input}
                    />

                    <Text style={styles.label}>What happened</Text>
                    <TextInput
                        value={description}
                        onChangeText={setDescription}
                        placeholder="e.g. 2 boxes crushed, contents leaking"
                        multiline
                        style={[styles.input, styles.multiline]}
                    />

                    <Text style={styles.label}>
                        Photos ({photos.length}/{MAX_PHOTOS})
                    </Text>
                    <View style={styles.photos}>
                        {photos.map((uri, index) => (
                            <Pressable
                                key={index}
                                accessibilityLabel="Remove photo"
                                onPress={() =>
                                    setPhotos((current) => current.filter((_, i) => i !== index))
                                }
                            >
                                <Image
                                    source={{ uri }}
                                    alt={`Damage photo ${index + 1}`}
                                    style={styles.thumb}
                                />
                            </Pressable>
                        ))}
                    </View>
                    {photos.length < MAX_PHOTOS ? (
                        <PrimaryButton
                            title="Add photo"
                            variant="secondary"
                            onPress={() => void addPhoto()}
                        />
                    ) : null}

                    {error ? <Text style={styles.error}>{error}</Text> : null}
                    <PrimaryButton
                        title="Send damage report"
                        loading={busy}
                        onPress={() => void submit()}
                        style={{ marginTop: 12 }}
                    />
                    <PrimaryButton title="Cancel" variant="ghost" onPress={reset} />
                </View>
            )}
        </View>
    )
}

function Chips({
    options,
    selected,
    onSelect,
}: {
    options: Array<{ id: string; label: string }>
    selected: string | null
    onSelect: (id: string) => void
}) {
    return (
        <View style={styles.chips}>
            {options.map((option) => {
                const active = option.id === selected
                return (
                    <Pressable
                        key={option.id}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        onPress={() => onSelect(option.id)}
                        style={[styles.chip, active && styles.chipActive]}
                    >
                        <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                            {option.label}
                        </Text>
                    </Pressable>
                )
            })}
        </View>
    )
}

const styles = StyleSheet.create({
    section: {
        marginTop: 20,
        marginBottom: 8,
        fontSize: 13,
        fontWeight: '700',
        color: '#9ca3af',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        marginBottom: 8,
    },
    ref: { fontWeight: '700', color: '#111827' },
    meta: { marginTop: 4, color: '#6b7280', fontSize: 13 },
    hint: { color: '#92400e', fontSize: 13, lineHeight: 19 },
    label: { marginTop: 14, marginBottom: 6, fontWeight: '600', color: '#374151' },
    input: {
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#fff',
        fontSize: 16,
    },
    multiline: { minHeight: 72, textAlignVertical: 'top' },
    photos: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#e5e7eb' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
        backgroundColor: '#fff',
    },
    chipActive: { borderColor: '#ea580c', backgroundColor: '#fff7ed' },
    chipLabel: { color: '#374151', fontWeight: '600' },
    chipLabelActive: { color: '#c2410c' },
    error: { color: '#b91c1c', marginTop: 10 },
})
