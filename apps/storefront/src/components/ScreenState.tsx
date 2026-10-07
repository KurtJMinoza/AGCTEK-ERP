import Ionicons from '@expo/vector-icons/Ionicons'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'
import { PrimaryButton, type IconName } from './PrimaryButton'

type Action = { title: string; onPress: () => void; icon?: IconName }

type Props =
    | { kind: 'loading'; message?: string }
    | { kind: 'error'; message: string; onRetry?: () => void }
    | { kind: 'empty'; title: string; message?: string; icon?: IconName; action?: Action }

export function ScreenState(props: Props) {
    return (
        <View style={styles.container}>
            {props.kind === 'loading' ? (
                <>
                    <ActivityIndicator size="large" color={colors.brand} />
                    {props.message ? <Text style={styles.message}>{props.message}</Text> : null}
                </>
            ) : props.kind === 'error' ? (
                <>
                    <View style={[styles.icon, styles.iconDanger]}>
                        <Ionicons name="cloud-offline-outline" size={28} color={colors.danger} />
                    </View>
                    <Text style={styles.title}>Couldn’t load</Text>
                    <Text style={styles.message}>{props.message}</Text>
                    {props.onRetry ? (
                        <PrimaryButton
                            title="Try again"
                            icon="refresh"
                            variant="secondary"
                            onPress={props.onRetry}
                            style={styles.action}
                        />
                    ) : null}
                </>
            ) : (
                <>
                    <View style={styles.icon}>
                        <Ionicons name={props.icon ?? 'file-tray-outline'} size={28} color={colors.brand} />
                    </View>
                    <Text style={styles.title}>{props.title}</Text>
                    {props.message ? <Text style={styles.message}>{props.message}</Text> : null}
                    {props.action ? (
                        <PrimaryButton
                            title={props.action.title}
                            icon={props.action.icon}
                            onPress={props.action.onPress}
                            style={styles.action}
                        />
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
    icon: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: colors.brandSoft,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    iconDanger: { backgroundColor: colors.dangerSoft },
    title: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' },
    message: { marginTop: 6, fontSize: 14, color: colors.textMuted, textAlign: 'center', maxWidth: 320 },
    action: { marginTop: 18, alignSelf: 'stretch', maxWidth: 320, width: '100%', marginHorizontal: 'auto' },
})
