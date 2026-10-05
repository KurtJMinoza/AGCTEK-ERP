import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'
import { PrimaryButton } from './PrimaryButton'

type Props =
    | { kind: 'loading' }
    | { kind: 'error'; message: string; onRetry?: () => void }
    | { kind: 'empty'; title: string; message?: string }

export function ScreenState(props: Props) {
    return (
        <View style={styles.container}>
            {props.kind === 'loading' ? (
                <ActivityIndicator size="large" color={colors.brand} />
            ) : props.kind === 'error' ? (
                <>
                    <Text style={styles.title}>Couldn’t load</Text>
                    <Text style={styles.message}>{props.message}</Text>
                    {props.onRetry ? (
                        <PrimaryButton
                            title="Try again"
                            variant="secondary"
                            onPress={props.onRetry}
                            style={styles.retry}
                        />
                    ) : null}
                </>
            ) : (
                <>
                    <Text style={styles.title}>{props.title}</Text>
                    {props.message ? (
                        <Text style={styles.message}>{props.message}</Text>
                    ) : null}
                </>
            )}
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
    message: {
        marginTop: 6,
        fontSize: 14,
        color: colors.textMuted,
        textAlign: 'center',
    },
    retry: { marginTop: 16, alignSelf: 'stretch' },
})
