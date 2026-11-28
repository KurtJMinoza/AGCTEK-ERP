import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MARKETPLACE_NAME } from '@/src/catalog'
import { PrimaryButton } from '@/src/components/PrimaryButton'
import { OtpAnimatedMail } from '@/src/components/auth/OtpAnimatedMail'
import { OtpDigitInput } from '@/src/components/auth/OtpDigitInput'
import { Field } from '@/src/components/Field'
import {
    requestShopEmailCode,
    verifyShopEmailCode,
    type ShopAuthSession,
} from '@/src/api/shopAuthApi'
import { CommerceApiError } from '@/src/api/commerceApi'
import { loadJson, removeKey, saveJson, STORAGE_KEYS } from '@/src/api/storage'
import { useAuth } from '@/src/context/AuthContext'
import { useToast } from '@/src/context/ToastContext'
import {
    OTP_RESEND_SECONDS,
    useOtpExpiryCountdown,
} from '@/src/hooks/useOtpExpiryCountdown'
import { colors, radius } from '@/src/theme'

const OTP_LENGTH = 6

/** Gmail OTP step with live countdown + animated mail (matches /shop OTP). */
export default function OtpScreen() {
    const router = useRouter()
    const insets = useSafeAreaInsets()
    const { next } = useLocalSearchParams<{ next?: string }>()
    const { applyShopSession, updateProfile } = useAuth()
    const { notify } = useToast()

    const [email, setEmail] = useState('')
    const [code, setCode] = useState('')
    const [firstName, setFirstName] = useState('')
    const [needsProfile, setNeedsProfile] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [info, setInfo] = useState<string | null>(null)
    const [wrongDigits, setWrongDigits] = useState<number[]>([])
    const [busy, setBusy] = useState(false)
    const [resendIn, setResendIn] = useState(OTP_RESEND_SECONDS)
    const [otpSentAt, setOtpSentAt] = useState<number | null>(null)
    const verifying = useRef(false)

    const {
        label: expiryLabel,
        expired: otpExpired,
        progress,
    } = useOtpExpiryCountdown(otpSentAt)

    useEffect(() => {
        let live = true
        void Promise.all([
            loadJson<string>(STORAGE_KEYS.otpEmail),
            loadJson<number>(STORAGE_KEYS.otpSentAt),
        ]).then(([storedEmail, sentAt]) => {
            if (!live) return
            if (!storedEmail) {
                router.replace('/account')
                return
            }
            setEmail(storedEmail)
            setOtpSentAt(typeof sentAt === 'number' ? sentAt : Date.now())
        })
        return () => {
            live = false
        }
    }, [router])

    useEffect(() => {
        if (resendIn <= 0) return
        const timer = setInterval(
            () => setResendIn((value) => Math.max(0, value - 1)),
            1000,
        )
        return () => clearInterval(timer)
    }, [resendIn])

    const finish = () => {
        void removeKey(STORAGE_KEYS.otpEmail)
        void removeKey(STORAGE_KEYS.otpSentAt)
        if (next === 'checkout') router.replace('/checkout')
        else if (next === 'orders') router.replace('/orders')
        else router.replace('/account')
    }

    const verify = useCallback(
        async (otp: string, name?: string) => {
            if (
                verifying.current ||
                otp.length !== OTP_LENGTH ||
                !email ||
                otpExpired
            )
                return
            verifying.current = true
            setBusy(true)
            setError(null)
            try {
                const session: ShopAuthSession = await verifyShopEmailCode({
                    email,
                    code: otp,
                    firstName: name,
                })
                await applyShopSession(session)
                if (session.needsProfile && !name?.trim()) {
                    setNeedsProfile(true)
                    setInfo('Your Gmail has been verified.')
                    return
                }
                notify(
                    'success',
                    'Signed in',
                    `Welcome to ${MARKETPLACE_NAME}.`,
                )
                finish()
            } catch (e) {
                setWrongDigits(
                    e instanceof CommerceApiError && e.mismatchedDigits
                        ? e.mismatchedDigits
                        : [],
                )
                setError(
                    e instanceof Error
                        ? e.message
                        : 'The code could not be verified.',
                )
            } finally {
                setBusy(false)
                verifying.current = false
            }
        },
        [applyShopSession, email, finish, notify, otpExpired],
    )

    const completeProfile = async () => {
        const name = firstName.trim()
        if (!name) {
            setError('First name is required.')
            return
        }
        setBusy(true)
        setError(null)
        try {
            await updateProfileWithName(name)
            finish()
        } catch (e) {
            setError(
                e instanceof Error ? e.message : 'Unable to save your profile.',
            )
        } finally {
            setBusy(false)
        }
    }

    const updateProfileWithName = async (name: string) => {
        const session = await loadJson<{
            customer: Parameters<typeof updateProfile>[0] & { email: string }
        }>(STORAGE_KEYS.session)
        if (!session?.customer)
            throw new Error('Your session is missing. Sign in again.')
        const { email: _email, ...profile } = session.customer
        await updateProfile({ ...profile, fullName: name })
    }

    const resend = async () => {
        if (resendIn > 0 || !email) return
        setError(null)
        setBusy(true)
        try {
            const message = await requestShopEmailCode(email)
            const sentAt = Date.now()
            await saveJson(STORAGE_KEYS.otpSentAt, sentAt)
            setOtpSentAt(sentAt)
            setInfo(message)
            setResendIn(OTP_RESEND_SECONDS)
            setCode('')
            setWrongDigits([])
        } catch (e) {
            setError(
                e instanceof Error ? e.message : 'Unable to resend the code.',
            )
        } finally {
            setBusy(false)
        }
    }

    return (
        <ScrollView
            style={styles.screen}
            contentContainerStyle={[
                styles.body,
                {
                    paddingTop: insets.top + 20,
                    paddingBottom: insets.bottom + 24,
                },
            ]}
            keyboardShouldPersistTaps="handled"
        >
            <Pressable
                accessibilityRole="button"
                onPress={() => {
                    void removeKey(STORAGE_KEYS.otpEmail)
                    void removeKey(STORAGE_KEYS.otpSentAt)
                    router.replace('/account')
                }}
                style={styles.backLink}
            >
                <Text style={styles.backText}>Change email address</Text>
            </Pressable>

            <Text style={styles.title}>
                {needsProfile ? 'Almost there' : 'Verify your Gmail'}
            </Text>
            <Text style={styles.subtitle}>
                {needsProfile
                    ? 'Tell us your first name to finish setting up your account.'
                    : `We sent a six-digit verification code to ${email || '…'}.`}
            </Text>

            {error ? (
                <View style={styles.error}>
                    <Ionicons
                        name="alert-circle"
                        size={18}
                        color={colors.danger}
                    />
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            ) : null}
            {info ? (
                <View style={styles.info}>
                    <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={colors.brandText}
                    />
                    <Text style={styles.infoText}>{info}</Text>
                </View>
            ) : null}

            {needsProfile ? (
                <>
                    <Field
                        label="First name"
                        placeholder="Juan"
                        value={firstName}
                        autoComplete="given-name"
                        onChangeText={setFirstName}
                    />
                    <PrimaryButton
                        title="Continue to shop"
                        loading={busy}
                        onPress={() => void completeProfile()}
                    />
                </>
            ) : (
                <>
                    <OtpAnimatedMail
                        email={email}
                        countdownLabel={expiryLabel}
                        expired={otpExpired}
                        progress={progress}
                    />
                    <OtpDigitInput
                        value={code}
                        disabled={busy || otpExpired}
                        onChange={(value) => {
                            setCode(value)
                            setError(null)
                            setWrongDigits([])
                        }}
                        invalidDigits={wrongDigits}
                        onComplete={(value) => void verify(value)}
                    />
                    <Text style={styles.hint}>
                        {otpExpired
                            ? 'This code has expired.'
                            : `The code expires in ${expiryLabel}.`}
                    </Text>
                    {wrongDigits.length > 0 ? (
                        <Text style={styles.wrongHint}>
                            Check the highlighted digit
                            {wrongDigits.length > 1 ? 's' : ''} and try again.
                        </Text>
                    ) : null}
                    <PrimaryButton
                        title="Verify and continue"
                        loading={busy}
                        onPress={() => void verify(code)}
                        disabled={otpExpired || code.length !== OTP_LENGTH}
                    />
                    <Text style={styles.resend}>
                        Didn&apos;t receive the code?{' '}
                        {resendIn > 0 ? (
                            `Resend in ${resendIn}s`
                        ) : (
                            <Text
                                style={styles.link}
                                onPress={() => void resend()}
                            >
                                Resend code
                            </Text>
                        )}
                    </Text>
                </>
            )}
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surface },
    body: { paddingHorizontal: 20, gap: 14 },
    backLink: { alignSelf: 'flex-start' },
    backText: { fontSize: 14, fontWeight: '600', color: colors.brandText },
    title: {
        fontSize: 22,
        fontWeight: '700',
        color: colors.text,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        color: colors.textMuted,
        lineHeight: 20,
        textAlign: 'center',
    },
    error: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderRadius: radius.sm,
        backgroundColor: colors.dangerSoft,
        padding: 10,
    },
    errorText: { flex: 1, fontSize: 13, color: colors.danger },
    info: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderRadius: radius.sm,
        backgroundColor: colors.tile,
        padding: 10,
    },
    infoText: { flex: 1, fontSize: 13, color: colors.brandText },
    hint: { fontSize: 12, color: colors.textFaint, textAlign: 'center' },
    wrongHint: { fontSize: 12, color: colors.danger, textAlign: 'center' },
    resend: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
    link: { color: colors.brandText, fontWeight: '700' },
})
