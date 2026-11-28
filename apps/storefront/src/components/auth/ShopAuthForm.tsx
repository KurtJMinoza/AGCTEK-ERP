import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
    ActivityIndicator,
    Linking,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native'
import { WEB_BASE } from '../../api/client'
import {
    fetchShopAuthPublicConfig,
    GMAIL_VALIDATION_MESSAGE,
    isGmailInput,
    normalizeGmailInput,
    requestShopEmailCode,
    signInWithGoogle,
} from '../../api/shopAuthApi'
import { saveJson, STORAGE_KEYS } from '../../api/storage'
import { MARKETPLACE_NAME } from '../../catalog'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { colors, radius } from '../../theme'
import { shopAuth } from '../../theme/shopAuth'
import { GoogleLogo } from './GoogleLogo'

export type ShopAuthNext = 'account' | 'checkout' | 'orders' | ''

type Props = {
    /** Post-auth / OTP destination. */
    next?: ShopAuthNext
    /** Optional back control (sign-in modal). Account tab omits this. */
    onBack?: () => void
    backLabel?: string
}

/** Gmail OTP + Google sign-in form, matching live /shop/sign-in. */
export function ShopAuthForm({ next = 'account', onBack, backLabel }: Props) {
    const router = useRouter()
    const { applyShopSession } = useAuth()
    const { notify } = useToast()

    const [email, setEmail] = useState('')
    const [emailError, setEmailError] = useState<string | null>(null)
    const [formError, setFormError] = useState<string | null>(null)
    const [sending, setSending] = useState(false)
    const [googleBusy, setGoogleBusy] = useState(false)
    const [googleClientId, setGoogleClientId] = useState<string | null>(null)

    useEffect(() => {
        let live = true
        fetchShopAuthPublicConfig()
            .then((config) => {
                if (live) setGoogleClientId(config.googleClientId)
            })
            .catch(() => {
                if (live) setGoogleClientId(null)
            })
        return () => {
            live = false
        }
    }, [])

    const validateEmail = (value: string) => {
        const normalized = normalizeGmailInput(value)
        if (!normalized) {
            setEmailError('Email address is required.')
            return false
        }
        if (!isGmailInput(normalized)) {
            setEmailError(GMAIL_VALIDATION_MESSAGE)
            return false
        }
        setEmailError(null)
        return true
    }

    const goAfterAuth = () => {
        if (next === 'checkout') router.replace('/checkout')
        else if (next === 'orders') router.replace('/orders')
        else if (next === 'account') router.replace('/account')
        else if (router.canGoBack()) router.back()
        else router.replace('/')
    }

    const sendCode = async () => {
        setFormError(null)
        if (!validateEmail(email)) return
        const normalized = normalizeGmailInput(email)
        setSending(true)
        try {
            const message = await requestShopEmailCode(normalized)
            await saveJson(STORAGE_KEYS.otpEmail, normalized)
            await saveJson(STORAGE_KEYS.otpSentAt, Date.now())
            notify('success', 'Code sent', message)
            router.push({ pathname: '/otp', params: { next: next || 'account' } })
        } catch (e) {
            setFormError(e instanceof Error ? e.message : 'We could not send the email. Please try again.')
        } finally {
            setSending(false)
        }
    }

    const google = async () => {
        setFormError(null)
        setGoogleBusy(true)
        try {
            const config = await fetchShopAuthPublicConfig()
            if (!config.googleClientId) {
                throw new Error('Google sign-in is not configured on this store.')
            }
            const session = await signInWithGoogle(config.googleClientId)
            await applyShopSession(session)
            notify(
                'success',
                'Welcome',
                session.needsProfile
                    ? 'Your Gmail is verified. Complete your profile when ready.'
                    : 'You are now signed in.',
            )
            if (session.needsProfile) router.replace('/account')
            else goAfterAuth()
        } catch (e) {
            setFormError(e instanceof Error ? e.message : 'Google sign-in could not be verified.')
        } finally {
            setGoogleBusy(false)
        }
    }

    return (
        <View style={styles.root}>
            {onBack ? (
                <Pressable
                    accessibilityRole="link"
                    onPress={onBack}
                    style={({ pressed }) => [styles.back, pressed && styles.pressed]}
                >
                    <Ionicons name="arrow-back" size={16} color={colors.textMuted} />
                    <Text style={styles.backText}>{backLabel ?? `Back to ${MARKETPLACE_NAME}`}</Text>
                </Pressable>
            ) : null}

            <Text style={styles.title}>Sign in to your account</Text>

            {formError ? (
                <View style={styles.alertDanger}>
                    <Ionicons name="alert-circle" size={18} color={colors.danger} />
                    <Text style={styles.alertDangerText}>{formError}</Text>
                </View>
            ) : null}

            <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !googleClientId || googleBusy, busy: googleBusy }}
                disabled={!googleClientId || googleBusy}
                onPress={() => void google()}
                style={({ pressed }) => [
                    styles.googleBtn,
                    (!googleClientId || googleBusy) && styles.googleDisabled,
                    pressed && googleClientId && styles.pressed,
                ]}
            >
                {googleBusy ? (
                    <ActivityIndicator color={colors.text} />
                ) : (
                    <>
                        <GoogleLogo size={20} />
                        <Text style={styles.googleLabel}>Continue with Google</Text>
                    </>
                )}
            </Pressable>

            <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
            </View>

            <View style={styles.field}>
                <Text style={styles.label}>
                    <Text style={styles.asterisk}>* </Text>Email Address
                </Text>
                <View style={[styles.inputBox, !!emailError && styles.inputInvalid]}>
                    <Ionicons name="mail-outline" size={18} color={colors.textFaint} style={styles.mailIcon} />
                    <TextInput
                        value={email}
                        placeholder="you@gmail.com"
                        placeholderTextColor={colors.textFaint}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        inputMode="email"
                        style={styles.input}
                        accessibilityLabel="Email Address"
                        onChangeText={(value) => {
                            setEmail(value)
                            if (emailError) validateEmail(value)
                            if (formError) setFormError(null)
                        }}
                        onBlur={() => {
                            if (email.trim()) validateEmail(email)
                        }}
                        onSubmitEditing={() => void sendCode()}
                    />
                </View>
                {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}
            </View>

            <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: sending, busy: sending }}
                disabled={sending}
                onPress={() => void sendCode()}
                style={({ pressed }) => [
                    styles.primaryBtn,
                    sending && styles.googleDisabled,
                    pressed && !sending && styles.primaryPressed,
                ]}
            >
                {sending ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.primaryLabel}>Send sign-in code</Text>
                )}
            </Pressable>

            <Text style={styles.legal}>
                By continuing, you agree to the{' '}
                <Text
                    style={styles.legalLink}
                    onPress={() => void Linking.openURL(`${WEB_BASE}/shop`)}
                >
                    Terms
                </Text>{' '}
                and{' '}
                <Text
                    style={styles.legalLink}
                    onPress={() => void Linking.openURL(`${WEB_BASE}/shop`)}
                >
                    Privacy Policy
                </Text>
                .
            </Text>
        </View>
    )
}

const styles = StyleSheet.create({
    root: { width: '100%', maxWidth: 448, gap: 0 },
    back: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 32,
        alignSelf: 'flex-start',
    },
    backText: { fontSize: 14, color: colors.textMuted },
    pressed: { opacity: 0.75 },
    title: {
        fontSize: 24,
        fontWeight: '600',
        letterSpacing: -0.3,
        color: colors.text,
        marginBottom: 24,
    },
    alertDanger: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderRadius: radius.sm,
        backgroundColor: colors.dangerSoft,
        padding: 12,
        marginBottom: 16,
    },
    alertDangerText: { flex: 1, fontSize: 13, color: colors.danger },
    googleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        minHeight: 48,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surface,
        paddingHorizontal: 16,
    },
    googleDisabled: { opacity: 0.55 },
    googleLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginVertical: 22,
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.borderStrong },
    dividerText: {
        fontSize: 12,
        fontWeight: '500',
        color: colors.textFaint,
    },
    field: { gap: 6, marginBottom: 14 },
    label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    asterisk: { color: colors.danger },
    inputBox: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 48,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: colors.tile,
        paddingHorizontal: 12,
    },
    inputInvalid: { borderColor: colors.danger },
    mailIcon: { marginRight: 8 },
    input: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 10 },
    fieldError: { fontSize: 12, color: colors.danger },
    primaryBtn: {
        minHeight: 48,
        borderRadius: radius.sm,
        backgroundColor: shopAuth[600],
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    primaryPressed: { backgroundColor: shopAuth[700] },
    primaryLabel: { fontSize: 15, fontWeight: '600', color: '#fff' },
    legal: {
        marginTop: 28,
        fontSize: 12,
        lineHeight: 18,
        color: colors.textMuted,
        textAlign: 'center',
    },
    legalLink: { textDecorationLine: 'underline', color: colors.textMuted },
})
