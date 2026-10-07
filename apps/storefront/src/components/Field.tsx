import Ionicons from '@expo/vector-icons/Ionicons'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { colors, radius } from '../theme'

type Props = TextInputProps & {
    label: string
    error?: string | null
    /** Password field with a show / hide toggle. */
    password?: boolean
}

/** Labelled text input with inline validation (web form look). */
export function Field({ label, error, password, style, editable = true, ...rest }: Props) {
    const [focused, setFocused] = useState(false)
    const [visible, setVisible] = useState(false)

    return (
        <View style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <View
                style={[
                    styles.box,
                    focused && styles.focused,
                    !!error && styles.invalid,
                    !editable && styles.readOnly,
                ]}
            >
                <TextInput
                    placeholderTextColor={colors.textFaint}
                    accessibilityLabel={label}
                    editable={editable}
                    secureTextEntry={password && !visible}
                    autoCapitalize={password ? 'none' : rest.autoCapitalize}
                    {...rest}
                    style={[styles.input, style]}
                    onFocus={(e) => {
                        setFocused(true)
                        rest.onFocus?.(e)
                    }}
                    onBlur={(e) => {
                        setFocused(false)
                        rest.onBlur?.(e)
                    }}
                />
                {password ? (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
                        hitSlop={8}
                        onPress={() => setVisible((v) => !v)}
                        style={styles.toggle}
                    >
                        <Ionicons
                            name={visible ? 'eye-off-outline' : 'eye-outline'}
                            size={18}
                            color={colors.textMuted}
                        />
                    </Pressable>
                ) : null}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
    )
}

const styles = StyleSheet.create({
    field: { gap: 6 },
    label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    box: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 46,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surface,
    },
    focused: { borderColor: colors.brand },
    invalid: { borderColor: colors.danger },
    readOnly: { backgroundColor: colors.tile },
    input: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text },
    toggle: { paddingHorizontal: 12 },
    error: { fontSize: 12, color: colors.danger },
})
