import { Image, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { WEB_BASE } from '../../api/client'
import { MARKETPLACE_NAME } from '../../catalog'
import { shopAuth } from '../../theme/shopAuth'

const LOGO = `${WEB_BASE}/storefront/aci.png`
const scene = (name: string) => `${WEB_BASE}/storefront/auth-scene/${name}.png`

type FloatAsset = {
    name: string
    style: object
    size: number
}

/** Decorative 3D retail floats behind the branding copy (web AuthBrandScene). */
const FLOATS: FloatAsset[] = [
    { name: 'fridge', size: 88, style: { left: '4%', top: '8%', transform: [{ rotate: '-6deg' }] } },
    { name: 'lpg', size: 76, style: { right: '5%', top: '10%', transform: [{ rotate: '6deg' }] } },
    { name: 'microwave', size: 110, style: { left: '5%', bottom: '12%', transform: [{ rotate: '3deg' }] } },
    { name: 'parcel', size: 96, style: { right: '6%', bottom: '10%', transform: [{ rotate: '-12deg' }] } },
    { name: 'card', size: 64, style: { left: '2%', bottom: '32%', transform: [{ rotate: '12deg' }], opacity: 0.55 } },
    { name: 'coin', size: 40, style: { right: '16%', top: '18%', opacity: 0.5 } },
    { name: 'star', size: 36, style: { left: '16%', top: '6%', opacity: 0.45 } },
    { name: 'bag', size: 140, style: { left: -28, bottom: -24, transform: [{ rotate: '-12deg' }], opacity: 0.35 } },
]

/** Deep navy brand panel with grid + product floats (matches /shop/sign-in left rail). */
export function AuthBrandPanel({ compact }: { compact?: boolean }) {
    const { width } = useWindowDimensions()
    const showFloats = !compact && width >= 900

    return (
        <View style={[styles.panel, compact && styles.panelCompact]}>
            <View style={styles.grid} pointerEvents="none" />
            {showFloats
                ? FLOATS.map((asset) => (
                      <Image
                          key={`${asset.name}-${String(asset.style)}`}
                          source={{ uri: scene(asset.name) }}
                          style={[styles.float, { width: asset.size, height: asset.size }, asset.style]}
                          resizeMode="contain"
                          accessibilityElementsHidden
                          importantForAccessibility="no"
                      />
                  ))
                : null}
            <View style={styles.copy}>
                <View style={[styles.logoWrap, compact && styles.logoWrapCompact]}>
                    <Image
                        source={{ uri: LOGO }}
                        style={compact ? styles.logoCompact : styles.logo}
                        resizeMode="contain"
                        accessibilityLabel={`${MARKETPLACE_NAME} logo`}
                    />
                </View>
                <Text style={styles.eyebrow}>{MARKETPLACE_NAME.toUpperCase()}</Text>
                <Text style={[styles.headline, compact && styles.headlineCompact]}>
                    Seamless Shopping, Direct to Your Door
                </Text>
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    panel: {
        flex: 1,
        minHeight: 220,
        backgroundColor: shopAuth[950],
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        paddingHorizontal: 24,
        paddingVertical: 40,
    },
    panelCompact: {
        minHeight: 200,
        paddingVertical: 28,
    },
    grid: {
        ...StyleSheet.absoluteFill,
        ...(Platform.OS === 'web'
            ? ({
                  backgroundImage:
                      'linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)',
                  backgroundSize: '4rem 4rem',
              } as object)
            : null),
    },
    float: {
        position: 'absolute',
    },
    copy: {
        zIndex: 2,
        maxWidth: 420,
        alignItems: 'center',
    },
    logoWrap: {
        width: 128,
        height: 128,
        borderRadius: 64,
        backgroundColor: '#fff',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
    },
    logoWrapCompact: {
        width: 88,
        height: 88,
        borderRadius: 44,
    },
    logo: { width: 128, height: 128 },
    logoCompact: { width: 88, height: 88 },
    eyebrow: {
        marginTop: 24,
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 4,
        color: shopAuth[300],
        textAlign: 'center',
    },
    headline: {
        marginTop: 12,
        fontSize: 32,
        fontWeight: '600',
        lineHeight: 40,
        color: '#fff',
        textAlign: 'center',
    },
    headlineCompact: {
        fontSize: 22,
        lineHeight: 28,
    },
})
