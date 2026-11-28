import { createElement, useEffect, useMemo, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { MAP_STYLE_URL } from '@/src/utils/mapPin'
import { colors, radius } from '@/src/theme'
import { buildDeliveryMapHtml, parseMapPinMessage } from './mapHtml'

type Props = {
    latitude: number
    longitude: number
    readOnly?: boolean
    onPinChange: (latitude: number, longitude: number) => void
}

/** Expo web: isolated iframe + CDN MapLibre (Metro cannot bundle the GL worker). */
export function DeliveryLocationMap({
    latitude,
    longitude,
    readOnly = false,
    onPinChange,
}: Props) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null)
    const onPinChangeRef = useRef(onPinChange)
    onPinChangeRef.current = onPinChange

    const srcDoc = useMemo(
        () => buildDeliveryMapHtml(latitude, longitude, readOnly, MAP_STYLE_URL),
        // Initial HTML only; programmatic pin moves use postMessage
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [readOnly],
    )

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            if (event.source !== iframeRef.current?.contentWindow) return
            const raw = typeof event.data === 'string' ? event.data : ''
            const pin = parseMapPinMessage(raw)
            if (pin) onPinChangeRef.current(pin.lat, pin.lng)
        }
        window.addEventListener('message', onMessage)
        return () => window.removeEventListener('message', onMessage)
    }, [])

    useEffect(() => {
        iframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({ type: 'movePin', lat: latitude, lng: longitude }),
            '*',
        )
    }, [latitude, longitude])

    return (
        <View style={styles.wrap}>
            {createElement('iframe', {
                ref: iframeRef,
                title: 'Delivery location map',
                srcDoc,
                style: { width: '100%', height: '100%', border: 'none' },
                sandbox: 'allow-scripts allow-same-origin',
            })}
        </View>
    )
}

const styles = StyleSheet.create({
    wrap: {
        borderRadius: radius.md,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
        height: 280,
        backgroundColor: colors.tile,
    },
})