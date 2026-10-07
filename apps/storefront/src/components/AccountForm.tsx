import Ionicons from '@expo/vector-icons/Ionicons'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
    BLANK_ACCOUNT,
    trimAccount,
    validateAccount,
    type AccountForm as FormState,
    type FieldErrors,
} from '../accountFields'
import { MARKETPLACE_NAME } from '../catalog'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { colors, radius } from '../theme'
import { ConfirmDialog } from './ConfirmDialog'
import { DeliveryFields } from './DeliveryFields'
import { Field } from './Field'
import { PrimaryButton } from './PrimaryButton'

type Mode = 'login' | 'register' | 'profile'

const CONFIRM: Record<Mode, { title: string; confirm: string }> = {
    login: { title: 'Sign in?', confirm: 'Sign in' },
    register: { title: 'Create account?', confirm: 'Create account' },
    profile: { title: 'Save changes?', confirm: 'Save' },
}

const FAIL: Record<Mode, string> = {
    login: 'Unable to sign in',
    register: 'Unable to create account',
    profile: 'Unable to save changes',
}

/** Sign in / create account / edit profile — the same marketplace accounts as the web shop. */
export function AccountForm({ onDone }: { onDone?: () => void }) {
    const { customer, signIn, register, updateProfile } = useAuth()
    const { notify } = useToast()
    const [mode, setMode] = useState<Mode>(customer ? 'profile' : 'login')
    const [form, setForm] = useState<FormState>(BLANK_ACCOUNT)
    const [errors, setErrors] = useState<FieldErrors>({})
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [confirming, setConfirming] = useState(false)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        setErrors({})
        setSubmitError(null)
        if (customer) {
            setMode('profile')
            setForm({ ...BLANK_ACCOUNT, ...customer, password: '' })
        } else {
            setMode((m) => (m === 'profile' ? 'login' : m))
            setForm(BLANK_ACCOUNT)
        }
    }, [customer])

    const update = (key: keyof FormState, value: string) => {
        setForm((prev) => ({ ...prev, [key]: value }))
        setErrors((prev) => ({ ...prev, [key]: undefined }))
    }

    const switchMode = (next: Mode) => {
        setMode(next)
        setErrors({})
        setSubmitError(null)
    }

    const submit = () => {
        setSubmitError(null)
        const next = validateAccount(mode, form)
        setErrors(next)
        if (Object.keys(next).length === 0) setConfirming(true)
    }

    const run = async () => {
        setBusy(true)
        const t = trimAccount(form)
        try {
            if (mode === 'login') {
                await signIn({ email: t.email, password: t.password })
                notify('success', 'Signed in', `Welcome back to ${MARKETPLACE_NAME}.`)
            } else if (mode === 'register') {
                const { password, ...details } = t
                await register({ ...details, password })
                notify('success', 'Account created', `Welcome to ${MARKETPLACE_NAME}!`)
            } else {
                const { email: _e, password: _p, ...profile } = t
                await updateProfile(profile)
                notify('success', 'Profile saved', 'Your delivery details were updated.')
            }
            setConfirming(false)
            onDone?.()
        } catch (e) {
            setConfirming(false)
            setSubmitError(e instanceof Error && e.message ? e.message : FAIL[mode])
        } finally {
            setBusy(false)
        }
    }

    return (
        <View style={styles.form}>
            {mode !== 'profile' ? (
                <View style={styles.tabs} accessibilityRole="tablist">
                    {(['login', 'register'] as const).map((m) => (
                        <Pressable
                            key={m}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: mode === m }}
                            onPress={() => switchMode(m)}
                            style={[styles.tab, mode === m && styles.tabActive]}
                        >
                            <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
                                {m === 'login' ? 'Sign in' : 'Create account'}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            ) : null}

            {mode === 'profile' ? (
                <Field label="Email" value={form.email} editable={false} />
            ) : (
                <>
                    <Field
                        label="Email"
                        placeholder="you@example.com"
                        value={form.email}
                        error={errors.email}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        onChangeText={(v) => update('email', v)}
                    />
                    <Field
                        label="Password"
                        placeholder={mode === 'register' ? 'At least 6 characters' : 'Your password'}
                        value={form.password}
                        error={errors.password}
                        password
                        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                        onChangeText={(v) => update('password', v)}
                        onSubmitEditing={mode === 'login' ? submit : undefined}
                    />
                </>
            )}

            {mode !== 'login' ? (
                <>
                    {mode === 'register' ? (
                        <Text style={styles.hint}>Delivery details are saved to fill in checkout.</Text>
                    ) : null}
                    <DeliveryFields form={form} errors={errors} onChange={update} />
                </>
            ) : null}

            {submitError ? (
                <View style={styles.error}>
                    <Ionicons name="alert-circle" size={18} color={colors.danger} />
                    <Text style={styles.errorText}>{submitError}</Text>
                </View>
            ) : null}

            <PrimaryButton
                title={mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Save changes'}
                loading={busy}
                onPress={submit}
            />

            {mode === 'login' ? (
                <Text style={styles.switch}>
                    New here?{' '}
                    <Text style={styles.switchLink} onPress={() => switchMode('register')}>
                        Create an account
                    </Text>
                </Text>
            ) : mode === 'register' ? (
                <Text style={styles.switch}>
                    Already have an account?{' '}
                    <Text style={styles.switchLink} onPress={() => switchMode('login')}>
                        Sign in
                    </Text>
                </Text>
            ) : null}

            <ConfirmDialog
                visible={confirming}
                tone={mode === 'profile' ? 'warning' : 'info'}
                title={CONFIRM[mode].title}
                confirmText={CONFIRM[mode].confirm}
                loading={busy}
                onConfirm={() => void run()}
                onCancel={() => setConfirming(false)}
            >
                <Text style={styles.dialogText}>
                    {mode === 'login'
                        ? `Sign in to ${MARKETPLACE_NAME} as ${form.email.trim()}?`
                        : mode === 'register'
                          ? `Create a ${MARKETPLACE_NAME} account for ${form.email.trim()}?`
                          : 'Save these delivery details to your account?'}
                </Text>
            </ConfirmDialog>
        </View>
    )
}

const styles = StyleSheet.create({
    form: { gap: 14 },
    tabs: {
        flexDirection: 'row',
        backgroundColor: colors.tile,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 3,
    },
    tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 6 },
    tabActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.brandBorder },
    tabText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
    tabTextActive: { color: colors.brandText },
    hint: { fontSize: 13, color: colors.textMuted },
    error: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderRadius: radius.sm,
        backgroundColor: colors.dangerSoft,
        padding: 10,
    },
    errorText: { flex: 1, fontSize: 13, color: colors.danger },
    switch: { textAlign: 'center', fontSize: 13, color: colors.textMuted },
    switchLink: { fontWeight: '700', color: colors.brandText },
    dialogText: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
})
