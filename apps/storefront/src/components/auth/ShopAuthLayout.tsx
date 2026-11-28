import { Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../../theme'
import { AuthBrandPanel } from './AuthBrandPanel'
import { ShopAuthForm, type ShopAuthNext } from './ShopAuthForm'

type Props = {
    next?: ShopAuthNext
    onBack?: () => void
    backLabel?: string
}

/** Split brand + form layout matching http://localhost:3010/shop/sign-in. */
export function ShopAuthLayout({ next = 'account', onBack, backLabel }: Props) {
    const insets = useSafeAreaInsets()
    const { width } = useWindowDimensions()
    const split = width >= 900

    if (split) {
        return (
            <View style={[styles.split, { minHeight: Platform.OS === 'web' ? ('100vh' as unknown as number) : undefined }]}>
                <View style={styles.brandPane}>
                    <AuthBrandPanel />
                </View>
                <ScrollView
                    style={styles.formPane}
                    contentContainerStyle={[
                        styles.formInner,
                        { paddingTop: Math.max(insets.top, 48), paddingBottom: Math.max(insets.bottom, 48) },
                    ]}
                    keyboardShouldPersistTaps="handled"
                >
                    <ShopAuthForm next={next} onBack={onBack} backLabel={backLabel} />
                </ScrollView>
            </View>
        )
    }

    return (
        <ScrollView
            style={styles.stack}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) }}
            keyboardShouldPersistTaps="handled"
        >
            <AuthBrandPanel compact />
            <View
                style={[
                    styles.stackForm,
                    { paddingBottom: 24 },
                ]}
            >
                <ShopAuthForm next={next} onBack={onBack} backLabel={backLabel} />
            </View>
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    split: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: colors.surface,
        width: '100%',
    },
    brandPane: {
        flexBasis: 0,
        flexGrow: 1,
        flexShrink: 1,
    },
    formPane: {
        flex: 1,
        backgroundColor: colors.surface,
    },
    formInner: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: 40,
        alignItems: 'center',
    },
    stack: {
        flex: 1,
        backgroundColor: colors.surface,
    },
    stackForm: {
        paddingHorizontal: 20,
        paddingTop: 24,
        alignItems: 'center',
    },
})
