import { Image, View } from 'react-native'

/** Official Google “G” (developers.google.com identity asset). */
const GOOGLE_G_PNG = 'https://developers.google.com/static/identity/images/g-logo.png'

/** Multicolor Google mark for the Continue with Google button. */
export function GoogleLogo({ size = 20 }: { size?: number }) {
    return (
        <View
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={{ width: size, height: size }}
        >
            <Image
                source={{ uri: GOOGLE_G_PNG }}
                style={{ width: size, height: size }}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
            />
        </View>
    )
}
