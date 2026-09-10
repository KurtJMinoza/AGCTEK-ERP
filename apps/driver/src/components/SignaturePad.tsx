import { useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import SignatureCanvas from 'react-native-signature-canvas'

type Props = {
    onOK: (dataUrl: string) => void
    onEmpty?: () => void
}

export function SignaturePad({ onOK, onEmpty }: Props) {
    const ref = useRef<any>(null)

    return (
        <View style={styles.wrap}>
            <SignatureCanvas
                ref={ref}
                onOK={onOK}
                onEmpty={onEmpty}
                descriptionText="Sign above"
                clearText="Clear"
                confirmText="Save signature"
                webStyle={`.m-signature-pad--footer {display: flex; justify-content: space-between;} body,html {height: 100%;}`}
                autoClear={false}
                imageType="image/png"
                style={styles.canvas}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    wrap: {
        height: 220,
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#fff',
    },
    canvas: { flex: 1 },
})
