import Ionicons from '@expo/vector-icons/Ionicons'
import type { ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radius } from '../theme'
import { PrimaryButton, type IconName } from './PrimaryButton'

type Tone = 'info' | 'warning' | 'danger'

type Props = {
    visible: boolean
    tone?: Tone
    title: string
    children?: ReactNode
    confirmText: string
    cancelText?: string
    loading?: boolean
    onConfirm: () => void
    onCancel: () => void
}

const TONES: Record<Tone, { icon: IconName; fg: string; bg: string }> = {
    info: { icon: 'cart-outline', fg: colors.brand, bg: colors.brandSoft },
    warning: { icon: 'alert-circle-outline', fg: colors.warning, bg: colors.warningSoft },
    danger: { icon: 'trash-outline', fg: colors.danger, bg: colors.dangerSoft },
}

/** Cross-platform confirmation (React Native `Alert` has no buttons on web). */
export function ConfirmDialog({
    visible,
    tone = 'info',
    title,
    children,
    confirmText,
    cancelText = 'Cancel',
    loading,
    onConfirm,
    onCancel,
}: Props) {
    const t = TONES[tone]
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
            <Pressable style={styles.backdrop} onPress={loading ? undefined : onCancel} accessibilityLabel="Close">
                <Pressable style={styles.dialog} onPress={() => undefined}>
                    <View style={styles.header}>
                        <View style={[styles.icon, { backgroundColor: t.bg }]}>
                            <Ionicons name={t.icon} size={22} color={t.fg} />
                        </View>
                        <Text style={styles.title}>{title}</Text>
                    </View>
                    {children ? <View style={styles.body}>{children}</View> : null}
                    <View style={styles.actions}>
                        <PrimaryButton
                            title={cancelText}
                            variant="secondary"
                            disabled={loading}
                            onPress={onCancel}
                            style={styles.action}
                        />
                        <PrimaryButton
                            title={confirmText}
                            variant={tone === 'danger' ? 'danger' : 'primary'}
                            loading={loading}
                            onPress={onConfirm}
                            style={styles.action}
                        />
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    )
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(17,24,39,0.45)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    dialog: {
        width: '100%',
        maxWidth: 420,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: 20,
        gap: 14,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
    body: { gap: 6 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
    action: { flex: 1 },
})
