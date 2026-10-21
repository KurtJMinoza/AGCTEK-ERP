import { useEffect, useState } from 'react'
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native'
import { PrimaryButton } from './PrimaryButton'
import { formatMoney } from '../utils/money'

type Props = {
    visible: boolean
    amountDue: number
    currency: string
    busy: boolean
    error: string | null
    onCancel: () => void
    onConfirm: (amountReceived: number) => void
}

function parseAmount(text: string): number | null {
    const cleaned = text.replace(/[,\s]/g, '')
    if (!cleaned) return null
    const value = Number(cleaned)
    return Number.isFinite(value) && value >= 0 ? value : null
}

const cents = (value: number) => Math.round(value * 100)

/** Confirm the cash handed over. Received must cover the stop due (full or post–partial-accept). */
export function CashReceivedSheet({
    visible,
    amountDue,
    currency,
    busy,
    error,
    onCancel,
    onConfirm,
}: Props) {
    const [receivedText, setReceivedText] = useState(amountDue.toFixed(2))

    useEffect(() => {
        if (visible) setReceivedText(amountDue.toFixed(2))
    }, [visible, amountDue])

    const received = parseAmount(receivedText)
    const short = received == null || cents(received) < cents(amountDue)
    const change = received == null || short ? null : (cents(received) - cents(amountDue)) / 100

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.backdrop}
            >
                <Pressable style={styles.dismiss} onPress={busy ? undefined : onCancel} />
                <View style={styles.sheet}>
                    <Text style={styles.title}>Cash received</Text>

                    <Text style={styles.label}>Amount due</Text>
                    <Text style={styles.due}>{formatMoney(amountDue, currency)}</Text>

                    <Text style={styles.label}>Cash received</Text>
                    <TextInput
                        value={receivedText}
                        onChangeText={setReceivedText}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                        editable={!busy}
                        style={styles.input}
                        accessibilityLabel="Cash received"
                    />

                    {received == null ? (
                        <Text style={styles.warn}>Enter the cash amount received.</Text>
                    ) : short ? (
                        <Text style={styles.warn}>
                            Less than the amount due — collect the full amount (partial payment is not
                            supported).
                        </Text>
                    ) : (
                        <Text style={styles.change}>Change: {formatMoney(change ?? 0, currency)}</Text>
                    )}

                    {error ? <Text style={styles.error}>{error}</Text> : null}

                    <PrimaryButton
                        title="Confirm cash received"
                        loading={busy}
                        disabled={short}
                        onPress={() => received != null && onConfirm(received)}
                        style={{ marginTop: 16 }}
                    />
                    <PrimaryButton
                        title="Cancel"
                        variant="ghost"
                        disabled={busy}
                        onPress={onCancel}
                        style={{ marginTop: 8 }}
                    />
                </View>
            </KeyboardAvoidingView>
        </Modal>
    )
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,24,39,0.45)' },
    dismiss: { flex: 1 },
    sheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        paddingBottom: 32,
    },
    title: { fontSize: 20, fontWeight: '800', color: '#111827' },
    label: {
        marginTop: 16,
        fontSize: 13,
        fontWeight: '700',
        color: '#9ca3af',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    due: { marginTop: 4, fontSize: 28, fontWeight: '800', color: '#111827' },
    input: {
        marginTop: 6,
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
        backgroundColor: '#fff',
        fontSize: 22,
        fontWeight: '700',
    },
    change: { marginTop: 10, fontSize: 16, fontWeight: '700', color: '#047857' },
    warn: { marginTop: 10, color: '#b45309', lineHeight: 20 },
    error: { marginTop: 10, color: '#b91c1c' },
})
