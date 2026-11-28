import Ionicons from '@expo/vector-icons/Ionicons'
import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { colors, radius } from '@/src/theme'

type Props = {
    email: string
    countdownLabel: string
    expired: boolean
    progress: number
}

/** Pulsing mail icon + live countdown ring (Expo OTP step). */
export function OtpAnimatedMail({ email, countdownLabel, expired, progress }: Props) {
    const pulse = useRef(new Animated.Value(0)).current
    const bob = useRef(new Animated.Value(0)).current

    useEffect(() => {
        const pulseLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, {
                    toValue: 1,
                    duration: 1200,
                    easing: Easing.out(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(pulse, {
                    toValue: 0,
                    duration: 1200,
                    easing: Easing.in(Easing.quad),
                    useNativeDriver: true,
                }),
            ]),
        )
        const bobLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(bob, { toValue: -4, duration: 900, useNativeDriver: true }),
                Animated.timing(bob, { toValue: 0, duration: 900, useNativeDriver: true }),
            ]),
        )
        pulseLoop.start()
        bobLoop.start()
        return () => {
            pulseLoop.stop()
            bobLoop.stop()
        }
    }, [bob, pulse])

    const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] })
    const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] })

    return (
        <View style={styles.wrap}>
            <View style={styles.ringHost}>
                <Animated.View
                    style={[
                        styles.pulseRing,
                        {
                            opacity: ringOpacity,
                            transform: [{ scale: ringScale }],
                            borderColor: expired ? colors.danger : colors.brand,
                        },
                    ]}
                />
                <View
                    style={[
                        styles.progressTrack,
                        { borderColor: expired ? colors.danger : colors.border },
                    ]}
                >
                    <View
                        style={[
                            styles.progressFill,
                            {
                                width: `${Math.round(progress * 100)}%`,
                                backgroundColor: expired ? colors.danger : colors.brand,
                            },
                        ]}
                    />
                </View>
                <Animated.View style={[styles.iconBox, { transform: [{ translateY: bob }] }]}>
                    <Ionicons name="mail-outline" size={34} color={colors.brandText} />
                </Animated.View>
            </View>
            <Text style={[styles.timer, expired && styles.timerExpired]}>
                {expired ? 'Code expired' : `${countdownLabel} left`}
            </Text>
            <Text style={styles.hint}>
                {expired
                    ? 'Tap Resend code for a new verification email.'
                    : `Check ${email || 'your Gmail'} for the six digits.`}
            </Text>
        </View>
    )
}

const styles = StyleSheet.create({
    wrap: { alignItems: 'center', gap: 8, marginVertical: 4 },
    ringHost: {
        width: 112,
        height: 112,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pulseRing: {
        position: 'absolute',
        width: 88,
        height: 88,
        borderRadius: 44,
        borderWidth: 2,
    },
    progressTrack: {
        position: 'absolute',
        bottom: 4,
        left: 8,
        right: 8,
        height: 4,
        borderRadius: 2,
        borderWidth: 1,
        overflow: 'hidden',
        backgroundColor: colors.tile,
    },
    progressFill: { height: '100%', borderRadius: 2 },
    iconBox: {
        width: 64,
        height: 64,
        borderRadius: radius.md,
        backgroundColor: colors.tile,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.brandBorder,
    },
    timer: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.brandText,
        fontVariant: ['tabular-nums'],
    },
    timerExpired: { color: colors.danger },
    hint: { fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
})