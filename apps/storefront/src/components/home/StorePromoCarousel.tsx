import { useState } from 'react'
import {
    ImageBackground,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native'
import { WEB_BASE } from '../../api/client'
import { discountPercent, isLpgMain } from '../../catalog'
import { colors, radius } from '../../theme'
import type { DivisionId, Product } from '../../types'
import { formatMoney } from '../../utils/format'

type Promo = {
    divisionId: DivisionId
    eyebrow: string
    headline: string
    body: string
    /** Shown as a dashed code chip after the body (AWIC10). */
    code?: string
    cta: string
    photo: string
    shade: string
    eyebrowColor: string
    ctaColor: string
}

const photo = (name: string) => `${WEB_BASE}/images/marketplace/${name}`

/** Same featured-store copy as the web; offers are read from the live catalogue, never invented. */
function buildPromos(products: Product[]): Promo[] {
    const refills = products.filter(isLpgMain)
    const refillFrom = refills.length ? Math.min(...refills.map((p) => p.price)) : null
    const applianceDiscount = Math.max(
        0,
        ...products.filter((p) => p.divisionId === 'DIV_APPLIANCES').map((p) => discountPercent(p) ?? 0),
    )
    return [
        {
            divisionId: 'DIV_RETAIL',
            eyebrow: 'AWIC Official Store',
            headline: '10% off',
            body: 'Health & wellness picks. Use code',
            code: 'AWIC10',
            cta: 'Shop AWIC',
            photo: photo('awic-family-cooking-1.jpg'),
            shade: 'rgba(2,44,34,0.72)',
            eyebrowColor: '#fde68a',
            ctaColor: colors.brandText,
        },
        {
            divisionId: 'DIV_LPG',
            eyebrow: 'LPG Official Store',
            headline: refillFrom !== null ? `LPG from ${formatMoney(refillFrom)}` : 'LPG to your door',
            body: 'Gas refills, brand-new tanks and stove add-ons, delivered to your home. Pay cash on delivery.',
            cta: 'Shop LPG',
            photo: photo('lpg-family-cooking-1.jpg'),
            shade: 'rgba(67,20,7,0.72)',
            eyebrowColor: '#fed7aa',
            ctaColor: '#ea580c',
        },
        {
            divisionId: 'DIV_APPLIANCES',
            eyebrow: 'MCONPINCO Official Store',
            headline: applianceDiscount > 0 ? `Up to ${applianceDiscount}% off` : 'Home appliances',
            body: 'Refrigerators, washing machines and kitchen essentials for every Filipino home.',
            cta: 'Shop MCONPINCO',
            photo: photo('mconpinco-family-fridge-1.jpg'),
            shade: 'rgba(69,10,10,0.72)',
            eyebrowColor: '#fecaca',
            ctaColor: '#dc2626',
        },
    ]
}

type Props = { products: Product[]; onShop: (divisionId: DivisionId) => void }

/** Swipeable featured-store cards (web "store promo" card). */
export function StorePromoCarousel({ products, onShop }: Props) {
    const { width } = useWindowDimensions()
    const cardWidth = Math.min(width, 720) - 32
    const promos = buildPromos(products)
    const [page, setPage] = useState(0)

    return (
        <View style={styles.wrap}>
            <ScrollView
                horizontal
                snapToInterval={cardWidth + 12}
                snapToAlignment="start"
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.list}
                onScroll={(e) =>
                    setPage(Math.round(e.nativeEvent.contentOffset.x / (cardWidth + 12)))
                }
                scrollEventThrottle={32}
            >
                {promos.map((promo) => (
                    <ImageBackground
                        key={promo.divisionId}
                        source={{ uri: promo.photo }}
                        resizeMode="cover"
                        style={[styles.card, { width: cardWidth }]}
                        imageStyle={styles.image}
                    >
                        <View style={[styles.shade, { backgroundColor: promo.shade }]}>
                            <Text style={[styles.eyebrow, { color: promo.eyebrowColor }]}>{promo.eyebrow}</Text>
                            <Text style={styles.headline}>{promo.headline}</Text>
                            <Text style={styles.body}>
                                {promo.body}
                                {promo.code ? (
                                    <>
                                        {' '}
                                        <Text style={styles.code}> {promo.code} </Text> at checkout.
                                    </>
                                ) : null}
                            </Text>
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => onShop(promo.divisionId)}
                                style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
                            >
                                <Text style={[styles.ctaText, { color: promo.ctaColor }]}>{promo.cta}</Text>
                            </Pressable>
                        </View>
                    </ImageBackground>
                ))}
            </ScrollView>
            <View style={styles.dots}>
                {promos.map((promo, i) => (
                    <View key={promo.divisionId} style={[styles.dot, i === page && styles.dotActive]} />
                ))}
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    wrap: { gap: 10 },
    list: { paddingHorizontal: 16, gap: 12 },
    card: { height: 230, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#064e3b' },
    image: { borderRadius: radius.lg },
    shade: { flex: 1, padding: 20, justifyContent: 'flex-end', gap: 6 },
    eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
    headline: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
    body: { fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.9)' },
    code: {
        fontFamily: 'monospace',
        fontWeight: '700',
        color: '#fff',
        backgroundColor: 'rgba(255,255,255,0.18)',
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: 'rgba(255,255,255,0.6)',
    },
    cta: {
        alignSelf: 'flex-start',
        marginTop: 8,
        backgroundColor: '#fff',
        borderRadius: radius.sm,
        paddingHorizontal: 16,
        paddingVertical: 9,
    },
    ctaPressed: { opacity: 0.85 },
    ctaText: { fontSize: 14, fontWeight: '700' },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.borderStrong },
    dotActive: { width: 18, backgroundColor: colors.brand },
})
