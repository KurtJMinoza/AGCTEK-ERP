import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { MAP_STYLE_URL } from '@/src/utils/mapPin'
import { colors, radius } from '@/src/theme'
import { buildDeliveryMapHtml, parseMapPinMessage } from './mapHtml'

type Props = {
    latitude: number
    longitude: number
    readOnly?: boolean
    onPinChange: (latitude: number, longitude: number) => void
}

/** Native: 3D MapLibre inside a WebView (CDN scripts — no Metro worker). */
export function DeliveryLocationMap({ latitude, longitude, readOnly = false, onPinChange }: Props) {
    const webRef = useRef<WebView>(null)
    const [ready, setReady] = useState(false)
    const html = useMemo(
        () => buildDeliveryMapHtml(latitude, longitude, readOnly, MAP_STYLE_URL),
        [latitude, longitude, readOnly],
    )

    useEffect(() => {
        if (!ready) return
        webRef.current?.injectJavaScript(
            `window.movePin && window.movePin(${latitude}, ${longitude}); true;`,
        )
    }, [latitude, longitude, ready])

    const onMessage = (event: WebViewMessageEvent) => {
        const pin = parseMapPinMessage(event.nativeEvent.data)
        if (pin) onPinChange(pin.lat, pin.lng)
    }

    return (
        <View style={styles.wrap}>
            {!ready ? (
                <View style={styles.loading}>
                    <ActivityIndicator color={colors.brand} />
                </View>
            ) : null}
            <WebView
                ref={webRef}
                originWhitelist={['*']}
                source={{ html }}
                onMessage={onMessage}
                onLoadEnd={() => setReady(true)}
                javaScriptEnabled
                domStorageEnabled
                scrollEnabled={false}
                style={styles.webview}
            />
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
    webview: { flex: 1, opacity: 0.99 },
    loading: {
        ...StyleSheet.absoluteFill,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
        backgroundColor: colors.tile,
    },
})