import Ionicons from '@expo/vector-icons/Ionicons'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
    ActivityIndicator,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native'
import { commerceApi } from '@/src/api/client'
import { USE_MOCK_API } from '@/src/api/client'
import type { AccountForm as FormState } from '@/src/accountFields'
import type { GeocodedAddress, PlaceSuggestion } from '@/src/types'
import { initialPinForText } from '@/src/utils/mapPin'
import { colors, radius } from '@/src/theme'
import { DeliveryLocationMap } from './maps/DeliveryLocationMap'

type Pin = { latitude: number; longitude: number }

type Props = {
    form: FormState
    enabled?: boolean
    onApplyDetected: (patch: Partial<FormState>) => void
    onPinChange?: (pin: Pin) => void
    initialPin?: Pin | null
}

function detectedToForm(detected: GeocodedAddress): Partial<FormState> {
    return {
        addressLine1:
            detected.addressLine?.trim() ||
            detected.formattedAddress?.trim() ||
            undefined,
        city: detected.cityOrMunicipality?.trim() || undefined,
        region: detected.provinceOrState?.trim() || undefined,
        postalCode: detected.postalCode?.trim() || undefined,
        country: detected.country?.trim() || 'PH',
    }
}

/** Search, 3D map pin, and reverse geocode — same ERP endpoints as /shop account. */
export function DeliveryLocationPicker({
    form,
    enabled = true,
    onApplyDetected,
    onPinChange,
    initialPin,
}: Props) {
    const [pin, setPin] = useState<Pin>(
        initialPin ?? initialPinForText(form.city, form.region),
    )

    useEffect(() => {
        if (initialPin) setPin(initialPin)
    }, [initialPin?.latitude, initialPin?.longitude])
    const [search, setSearch] = useState('')
    const [results, setResults] = useState<PlaceSuggestion[]>([])
    const [searching, setSearching] = useState(false)
    const [reverseLoading, setReverseLoading] = useState(false)
    const [reverseError, setReverseError] = useState<string | null>(null)
  const pinRef = useRef(pin)

    useEffect(() => {
        pinRef.current = pin
    }, [pin])

    const setPinBoth = useCallback(
        (next: Pin) => {
            setPin(next)
            onPinChange?.(next)
        },
        [onPinChange],
    )

    const runReverse = useCallback(
        async (latitude: number, longitude: number) => {
            if (!enabled) return
            if (USE_MOCK_API && !commerceApi.getSessionToken()) {
                return
            }
            setReverseLoading(true)
            setReverseError(null)
            try {
                const detected = await commerceApi.reverseAddress(latitude, longitude)
                const patch = detectedToForm(detected)
                if (Object.values(patch).some(Boolean)) {
                    onApplyDetected(patch)
                }
            } catch {
                setReverseError(
                    'We could not identify this pin. Adjust the map or edit the address fields.',
                )
            } finally {
                setReverseLoading(false)
            }
        },
        [enabled, onApplyDetected],
    )

    useEffect(() => {
        if (!enabled) return
        const timeout = setTimeout(() => {
            void runReverse(pin.latitude, pin.longitude)
        }, 350)
        return () => clearTimeout(timeout)
    }, [enabled, pin.latitude, pin.longitude, runReverse])

    useEffect(() => {
        if (!enabled || search.trim().length < 3) {
            setResults([])
            return
        }
        let active = true
        const timeout = setTimeout(() => {
            setSearching(true)
            void commerceApi
                .searchAddress(search.trim())
                .then((items) => active && setResults(items))
                .catch(() => active && setResults([]))
                .finally(() => active && setSearching(false))
        }, 350)
        return () => {
            active = false
            clearTimeout(timeout)
        }
    }, [enabled, search])

    const selectPlace = (place: PlaceSuggestion) => {
        setSearch('')
        setResults([])
        setPinBoth({ latitude: place.lat, longitude: place.lng })
    }

    if (!enabled) return null

    return (
        <View style={styles.block}>
            <View style={styles.head}>
                <Ionicons name="map" size={18} color={colors.brand} />
                <Text style={styles.title}>Pin on 3D map</Text>
            </View>
            <Text style={styles.hint}>
                Search, tap the map, or drag the pin. Address fields below update from the ERP
                geocoder (same as the web shop).
            </Text>

            <TextInput
                style={styles.search}
                placeholder="Search address or landmark…"
                placeholderTextColor={colors.textFaint}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
                autoCapitalize="words"
            />
            {searching ? <Text style={styles.meta}>Searching…</Text> : null}
            {results.length > 0 ? (
                <View style={styles.results}>
                    {results.map((place) => (
                        <Pressable
                            key={place.id}
                            style={({ pressed }) => [styles.resultRow, pressed && styles.pressed]}
                            onPress={() => selectPlace(place)}
                        >
                            <Text style={styles.resultTitle}>{place.label}</Text>
                            <Text style={styles.resultSub}>{place.address}</Text>
                        </Pressable>
                    ))}
                </View>
            ) : null}

            <DeliveryLocationMap
                latitude={pin.latitude}
                longitude={pin.longitude}
                onPinChange={(latitude, longitude) => setPinBoth({ latitude, longitude })}
            />

            <View style={styles.coordsRow}>
                <Text style={styles.coords}>
                    {pin.latitude.toFixed(6)}, {pin.longitude.toFixed(6)}
                </Text>
                {reverseLoading ? <ActivityIndicator size="small" color={colors.brand} /> : null}
            </View>
            {reverseError ? (
                <Pressable
                    accessibilityRole="button"
                    onPress={() => void runReverse(pin.latitude, pin.longitude)}
                    style={styles.warn}
                >
                    <Ionicons name="warning-outline" size={16} color={colors.warning} />
                    <Text style={styles.warnText}>{reverseError} Tap to retry.</Text>
                </Pressable>
            ) : null}
        </View>
    )
}

export type { Pin as DeliveryPin }

const styles = StyleSheet.create({
    block: { gap: 10 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontSize: 15, fontWeight: '700', color: colors.text },
    hint: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
    search: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.sm,
        paddingHorizontal: 12,
        paddingVertical: Platform.OS === 'web' ? 10 : 12,
        fontSize: 15,
        color: colors.text,
        backgroundColor: colors.surface,
    },
    meta: { fontSize: 12, color: colors.textMuted },
    results: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.sm,
        backgroundColor: colors.surface,
        overflow: 'hidden',
    },
    resultRow: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    pressed: { opacity: 0.75 },
    resultTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
    resultSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    coordsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    coords: { fontSize: 12, color: colors.textFaint, fontVariant: ['tabular-nums'] },
    warn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 8,
        borderRadius: radius.sm,
        backgroundColor: colors.warningSoft,
    },
    warnText: { flex: 1, fontSize: 12, color: colors.warning },
})