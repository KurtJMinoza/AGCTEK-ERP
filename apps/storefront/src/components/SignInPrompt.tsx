import { useRouter } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'
import { PrimaryButton } from './PrimaryButton'

export function SignInPrompt({ message }: { message: string }) {
    const router = useRouter()
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Sign in required</Text>
            <Text style={styles.message}>{message}</Text>
            <PrimaryButton
                title="Sign in"
                onPress={() => router.push('/account')}
                style={styles.button}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backgroundColor: colors.background,
    },
    title: { fontSize: 17, fontWeight: '700', color: colors.text },
    message: { marginTop: 6, fontSize: 14, color: colors.textMuted, textAlign: 'center' },
    button: { marginTop: 16, alignSelf: 'stretch' },
})
