import Ionicons from '@expo/vector-icons/Ionicons'
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, radius, shadow } from '../theme'

type ToastType = 'success' | 'danger'
type Toast = { id: number; type: ToastType; title: string; message?: string }

type ToastContextValue = { notify: (type: ToastType, title: string, message?: string) => void }

const ToastContext = createContext<ToastContextValue | null>(null)

const VISIBLE_MS = 2800

/** Top toast, like the web marketplace notifications. */
export function ToastProvider({ children }: { children: ReactNode }) {
    const insets = useSafeAreaInsets()
    const [toast, setToast] = useState<Toast | null>(null)
    const opacity = useRef(new Animated.Value(0)).current
    const nextId = useRef(0)

    const notify = useCallback((type: ToastType, title: string, message?: string) => {
        setToast({ id: ++nextId.current, type, title, message })
    }, [])

    useEffect(() => {
        if (!toast) return
        opacity.setValue(0)
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start()
        const timer = setTimeout(() => {
            Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(
                () => setToast((current) => (current?.id === toast.id ? null : current)),
            )
        }, VISIBLE_MS)
        return () => clearTimeout(timer)
    }, [toast, opacity])

    const value = useMemo(() => ({ notify }), [notify])
    const success = toast?.type === 'success'

    return (
        <ToastContext.Provider value={value}>
            {children}
            {toast ? (
                <Animated.View
                    pointerEvents="none"
                    accessibilityLiveRegion="polite"
                    style={[styles.wrap, { top: insets.top + 10, opacity }]}
                >
                    <View style={styles.toast}>
                        <Ionicons
                            name={success ? 'checkmark-circle' : 'alert-circle'}
                            size={22}
                            color={success ? colors.success : colors.danger}
                        />
                        <View style={styles.text}>
                            <Text style={styles.title}>{toast.title}</Text>
                            {toast.message ? (
                                <Text style={styles.message} numberOfLines={2}>
                                    {toast.message}
                                </Text>
                            ) : null}
                        </View>
                    </View>
                </Animated.View>
            ) : null}
        </ToastContext.Provider>
    )
}

export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext)
    if (!ctx) throw new Error('useToast must be used within ToastProvider')
    return ctx
}

const styles = StyleSheet.create({
    wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 1000 },
    toast: {
        ...shadow,
        width: '100%',
        maxWidth: 420,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    text: { flex: 1 },
    title: { fontSize: 14, fontWeight: '700', color: colors.text },
    message: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
})
