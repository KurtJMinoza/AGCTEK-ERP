import { useEffect, useRef, type ElementRef } from 'react'
import { Animated, Pressable, StyleSheet, TextInput, View } from 'react-native'

type InputRef = ElementRef<typeof TextInput>
import { colors, radius } from '@/src/theme'

type Props = {
    length?: number
    value: string
    disabled?: boolean
    invalidDigits?: number[]
    onChange: (value: string) => void
    onComplete?: (value: string) => void
}

/** Six animated OTP cells (matches web OtpInput). */
export function OtpDigitInput({
    length = 6,
    value,
    disabled,
    invalidDigits,
    onChange,
    onComplete,
}: Props) {
    const refs = useRef<(InputRef | null)[]>([])
    const scales = useRef(
        Array.from({ length }, () => new Animated.Value(1)),
    ).current
    const shake = useRef(new Animated.Value(0)).current
    const onCompleteRef = useRef(onComplete)
    onCompleteRef.current = onComplete

    useEffect(() => {
        if (value.length === length) onCompleteRef.current?.(value)
    }, [value, length])

    useEffect(() => {
        if (!invalidDigits?.length) {
            shake.setValue(0)
            return
        }
        Animated.sequence([
            Animated.timing(shake, {
                toValue: -5,
                duration: 60,
                useNativeDriver: true,
            }),
            Animated.timing(shake, {
                toValue: 5,
                duration: 90,
                useNativeDriver: true,
            }),
            Animated.timing(shake, {
                toValue: -3,
                duration: 90,
                useNativeDriver: true,
            }),
            Animated.timing(shake, {
                toValue: 0,
                duration: 60,
                useNativeDriver: true,
            }),
        ]).start()
    }, [invalidDigits, shake])

    const bump = (index: number) => {
        Animated.sequence([
            Animated.timing(scales[index]!, {
                toValue: 1.08,
                duration: 90,
                useNativeDriver: true,
            }),
            Animated.timing(scales[index]!, {
                toValue: 1,
                duration: 90,
                useNativeDriver: true,
            }),
        ]).start()
    }

    const setDigit = (index: number, digit: string) => {
        if (!/^\d?$/.test(digit)) return
        const next = value.slice(0, index) + digit + value.slice(index + 1)
        onChange(next.slice(0, length))
        if (digit) {
            bump(index)
            if (index < length - 1) refs.current[index + 1]?.focus()
        }
    }

    return (
        <View style={styles.row}>
            {Array.from({ length }).map((_, index) => {
                const filled = Boolean(value[index])
                const invalid = invalidDigits?.includes(index) ?? false
                return (
                    <Pressable
                        key={index}
                        onPress={() => refs.current[index]?.focus()}
                    >
                        <Animated.View
                            style={[
                                styles.cell,
                                filled && styles.cellFilled,
                                invalid && styles.cellInvalid,
                                disabled && styles.cellDisabled,
                                {
                                    transform: [
                                        { scale: scales[index]! },
                                        { translateX: invalid ? shake : 0 },
                                    ],
                                },
                            ]}
                        >
                            <TextInput
                                ref={(ref) => {
                                    refs.current[index] = ref
                                }}
                                style={[
                                    styles.input,
                                    invalid && styles.inputInvalid,
                                ]}
                                value={value[index] ?? ''}
                                editable={!disabled}
                                keyboardType="number-pad"
                                maxLength={1}
                                selectTextOnFocus
                                onChangeText={(text) => {
                                    if (text.length > 1) {
                                        const pasted = text
                                            .replace(/\D/g, '')
                                            .slice(0, length)
                                        onChange(pasted)
                                        refs.current[
                                            Math.min(pasted.length, length - 1)
                                        ]?.focus()
                                        return
                                    }
                                    setDigit(index, text)
                                }}
                                onKeyPress={({ nativeEvent }) => {
                                    if (
                                        nativeEvent.key === 'Backspace' &&
                                        !value[index] &&
                                        index > 0
                                    ) {
                                        refs.current[index - 1]?.focus()
                                    }
                                }}
                            />
                        </Animated.View>
                    </Pressable>
                )
            })}
        </View>
    )
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        flexWrap: 'wrap',
    },
    cell: {
        width: 46,
        height: 52,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cellFilled: {
        borderColor: colors.brand,
        backgroundColor: colors.brandSoft,
    },
    cellInvalid: {
        borderColor: colors.danger,
        backgroundColor: colors.dangerSoft,
    },
    cellDisabled: { opacity: 0.5 },
    input: {
        width: '100%',
        height: '100%',
        textAlign: 'center',
        fontSize: 20,
        fontWeight: '700',
        color: colors.text,
    },
    inputInvalid: { color: colors.danger },
})
