import { StyleSheet, Text, View, type ViewProps } from 'react-native'
import { colors } from '../theme'

type Props = ViewProps & { title?: string }

export function Card({ title, style, children, ...rest }: Props) {
    return (
        <View style={[styles.card, style]} {...rest}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {children}
        </View>
    )
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 14,
        gap: 4,
    },
    title: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 4 },
})
