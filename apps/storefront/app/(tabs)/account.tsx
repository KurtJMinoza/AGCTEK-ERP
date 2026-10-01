import { useState } from 'react'
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
} from 'react-native'
import { API_BASE, USE_MOCK_API } from '@/src/api/client'
import { Card } from '@/src/components/Card'
import { PrimaryButton } from '@/src/components/PrimaryButton'
import { ScreenState } from '@/src/components/ScreenState'
import { useAuth } from '@/src/context/AuthContext'
import { colors } from '@/src/theme'
import { formatDateTime } from '@/src/utils/format'

export default function AccountScreen() {
    const { session, loading, signIn, signOut } = useAuth()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    if (loading) return <ScreenState kind="loading" />

    const handleSignIn = async () => {
        setSubmitting(true)
        setError(null)
        try {
            await signIn({ email, password })
            setPassword('')
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Sign in failed')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                {session ? (
                    <>
                        <Card title="Signed in">
                            <Text style={styles.name}>{session.customer.name}</Text>
                            <Text style={styles.body}>{session.customer.email}</Text>
                            <Text style={styles.meta}>Since {formatDateTime(session.signedInAt)}</Text>
                        </Card>
                        <Card title="Default delivery address">
                            <Text style={styles.body}>{session.customer.defaultAddress ?? '—'}</Text>
                        </Card>
                        <PrimaryButton title="Sign out" variant="secondary" onPress={() => void signOut()} />
                    </>
                ) : (
                    <Card title="Sign in">
                        <TextInput
                            value={email}
                            onChangeText={setEmail}
                            placeholder="Email"
                            placeholderTextColor={colors.textMuted}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="email-address"
                            textContentType="emailAddress"
                            style={styles.input}
                        />
                        <TextInput
                            value={password}
                            onChangeText={setPassword}
                            placeholder="Password"
                            placeholderTextColor={colors.textMuted}
                            secureTextEntry
                            textContentType="password"
                            style={styles.input}
                            onSubmitEditing={handleSignIn}
                        />
                        {error ? <Text style={styles.error}>{error}</Text> : null}
                        <PrimaryButton title="Sign in" loading={submitting} onPress={handleSignIn} />
                        {USE_MOCK_API ? (
                            <Text style={styles.meta}>Demo mode: any email and password works.</Text>
                        ) : null}
                    </Card>
                )}

                <Card title="App">
                    <Text style={styles.meta}>
                        Data source: {USE_MOCK_API ? 'Mock API (demo data)' : `ERP API · ${API_BASE}`}
                    </Text>
                </Card>
            </ScrollView>
        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    content: { padding: 16, gap: 16 },
    name: { fontSize: 17, fontWeight: '700', color: colors.text },
    body: { fontSize: 14, color: colors.text },
    meta: { fontSize: 13, color: colors.textMuted },
    input: {
        height: 46,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
        paddingHorizontal: 12,
        fontSize: 15,
        color: colors.text,
        marginBottom: 10,
    },
    error: { color: colors.danger, fontSize: 13, fontWeight: '600', marginBottom: 8 },
})
