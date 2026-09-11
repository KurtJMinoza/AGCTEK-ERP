import { useState } from 'react'
import {
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { PrimaryButton } from '@/src/components/PrimaryButton'
import { useAuth } from '@/src/hooks/useAuth'
import { API_BASE } from '@/src/api/client'

export default function LoginScreen() {
    const { signIn } = useAuth()
    const [userName, setUserName] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const onSubmit = async () => {
        setLoading(true)
        setError(null)
        try {
            await signIn(userName, password)
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Sign-in failed. Check credentials and driver profile.',
            )
        } finally {
            setLoading(false)
        }
    }

    return (
        <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.container}
            >
                <Text style={styles.brand}>AGCTEK Driver</Text>
                <Text style={styles.sub}>
                    Logistics execution — today&apos;s trip, stops, POD
                </Text>

                <View style={styles.card}>
                    <Text style={styles.label}>Username</Text>
                    <TextInput
                        autoCapitalize="none"
                        autoCorrect={false}
                        value={userName}
                        onChangeText={setUserName}
                        placeholder="driver01"
                        style={styles.input}
                    />
                    <Text style={styles.label}>Password</Text>
                    <TextInput
                        secureTextEntry
                        value={password}
                        onChangeText={setPassword}
                        placeholder="••••••••"
                        style={styles.input}
                    />
                    {error ? <Text style={styles.error}>{error}</Text> : null}
                    <PrimaryButton
                        title="Sign in"
                        loading={loading}
                        onPress={() => void onSubmit()}
                        style={{ marginTop: 12 }}
                    />
                </View>

                <Text style={styles.hint}>
                    Demo: driver01 / 123Qwe (run backend seed if needed).
                    {'\n'}API: {API_BASE}/api/v1
                </Text>
            </KeyboardAvoidingView>
        </SafeAreaView>
    )
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#f9fafb' },
    container: {
        flex: 1,
        padding: 24,
        justifyContent: 'center',
    },
    brand: {
        fontSize: 32,
        fontWeight: '800',
        color: '#111827',
    },
    sub: {
        marginTop: 8,
        marginBottom: 28,
        fontSize: 15,
        color: '#6b7280',
        lineHeight: 22,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        gap: 8,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: '#374151',
        marginTop: 4,
    },
    input: {
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 14,
        fontSize: 16,
        backgroundColor: '#fff',
    },
    error: {
        color: '#b91c1c',
        marginTop: 4,
        fontSize: 14,
    },
    hint: {
        marginTop: 20,
        fontSize: 12,
        color: '#9ca3af',
        lineHeight: 18,
    },
})
