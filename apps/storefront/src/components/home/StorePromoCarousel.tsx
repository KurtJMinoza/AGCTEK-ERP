import { useEffect, useRef, useState } from 'react'
import {
    ImageBackground,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Platform,
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

/** Elegant, smoothly sliding & draggable featured-store promo banner. */
export function StorePromoCarousel({ products, onShop }: Props) {
    const { width } = useWindowDimensions()
    const containerWidth = Math.min(width, 768)
    const cardWidth = Math.max(280, containerWidth - 32)
    const stepWidth = cardWidth + 12
    const promos = buildPromos(products)

    const [page, setPage] = useState(0)
    const [dragOffset, setDragOffset] = useState(0)
    const [isDragging, setIsDragging] = useState(false)
    const [isHovered, setIsHovered] = useState(false)

    const isDraggingRef = useRef(false)
    const startXRef = useRef(0)
    const dragDistRef = useRef(0)
    const pageRef = useRef(0)
    pageRef.current = page

    // Graceful auto-advance with comfortable reading interval
    useEffect(() => {
        if (promos.length <= 1) return

        const timer = setInterval(() => {
            if (isDraggingRef.current || isHovered) return
            setPage((prev) => (prev + 1) % promos.length)
        }, 2800)

        return () => clearInterval(timer)
    }, [promos.length, isHovered])

    const goTo = (index: number) => {
        setPage(Math.max(0, Math.min(promos.length - 1, index)))
    }

    // Unified pointer/mouse drag start
    const handleDragStart = (clientX: number) => {
        isDraggingRef.current = true
        setIsDragging(true)
        startXRef.current = clientX
        dragDistRef.current = 0
    }

    // Unified pointer/mouse drag move
    const handleDragMove = (clientX: number) => {
        if (!isDraggingRef.current) return
        const diff = clientX - startXRef.current
        dragDistRef.current = diff

        // Gentle rubber-band resistance at boundaries
        let boundedDiff = diff
        if ((pageRef.current === 0 && diff > 0) || (pageRef.current === promos.length - 1 && diff < 0)) {
            boundedDiff = diff * 0.35
        }
        setDragOffset(boundedDiff)
    }

    // Unified pointer/mouse drag end
    const handleDragEnd = () => {
        if (!isDraggingRef.current) return
        isDraggingRef.current = false
        setIsDragging(false)

        const threshold = Math.min(60, cardWidth * 0.15)
        const dist = dragDistRef.current

        if (dist < -threshold && pageRef.current < promos.length - 1) {
            setPage((prev) => prev + 1)
        } else if (dist > threshold && pageRef.current > 0) {
            setPage((prev) => prev - 1)
        }
        setDragOffset(0)
    }

    // Mouse handlers for desktop web
    const mouseHandlers =
        Platform.OS === 'web'
            ? {
                  onMouseDown: (e: any) => handleDragStart(e.clientX ?? e.pageX ?? 0),
                  onMouseMove: (e: any) => handleDragMove(e.clientX ?? e.pageX ?? 0),
                  onMouseUp: handleDragEnd,
                  onMouseLeave: () => {
                      setIsHovered(false)
                      handleDragEnd()
                  },
                  onMouseEnter: () => setIsHovered(true),
              }
            : {}

    // Touch handlers for mobile / touchscreens
    const touchHandlers = {
        onTouchStart: (e: any) => {
            const touch = e.nativeEvent?.touches?.[0]
            if (touch) handleDragStart(touch.clientX ?? touch.pageX ?? 0)
        },
        onTouchMove: (e: any) => {
            const touch = e.nativeEvent?.touches?.[0]
            if (touch) handleDragMove(touch.clientX ?? touch.pageX ?? 0)
        },
        onTouchEnd: handleDragEnd,
        onTouchCancel: handleDragEnd,
    }

    const currentTranslateX = -page * stepWidth + dragOffset

    return (
        <View style={styles.wrap}>
            <View
                style={[
                    styles.viewport,
                    Platform.OS === 'web' &&
                        ({
                            cursor: isDragging ? 'grabbing' : 'grab',
                            userSelect: 'none',
                        } as any),
                ]}
                {...mouseHandlers}
                {...touchHandlers}
            >
                <View
                    style={[
                        styles.track,
                        {
                            transform: [{ translateX: currentTranslateX }],
                            ...(Platform.OS === 'web'
                                ? {
                                      transition: isDragging
                                          ? 'none'
                                          : 'transform 750ms cubic-bezier(0.16, 1, 0.3, 1)',
                                  }
                                : {}),
                        },
                    ]}
                >
                    {promos.map((promo, index) => {
                        const isActive = index === page
                        return (
                            <View
                                key={promo.divisionId}
                                style={[
                                    styles.cardWrapper,
                                    { width: cardWidth },
                                    Platform.OS === 'web' &&
                                        ({
                                            opacity: isActive ? 1 : 0.88,
                                            transform: [{ scale: isActive ? 1 : 0.985 }],
                                            transition:
                                                'transform 750ms cubic-bezier(0.16, 1, 0.3, 1), opacity 750ms ease',
                                        } as any),
                                ]}
                            >
                                <ImageBackground
                                    source={{ uri: promo.photo }}
                                    resizeMode="cover"
                                    style={styles.card}
                                    imageStyle={styles.image}
                                >
                                    <View style={[styles.shade, { backgroundColor: promo.shade }]}>
                                        <Text style={[styles.eyebrow, { color: promo.eyebrowColor }]}>
                                            {promo.eyebrow}
                                        </Text>
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
                                            onPress={() => {
                                                if (Math.abs(dragDistRef.current) > 8) return
                                                onShop(promo.divisionId)
                                            }}
                                            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
                                        >
                                            <Text style={[styles.ctaText, { color: promo.ctaColor }]}>
                                                {promo.cta}
                                            </Text>
                                        </Pressable>
                                    </View>
                                </ImageBackground>
                            </View>
                        )
                    })}
                </View>
            </View>

            {/* Elegant pagination pills */}
            <View style={styles.dots}>
                {promos.map((promo, i) => {
                    const isActive = i === page
                    return (
                        <Pressable
                            key={promo.divisionId}
                            onPress={() => goTo(i)}
                            hitSlop={12}
                            style={[
                                styles.dot,
                                isActive && styles.dotActive,
                                Platform.OS === 'web' &&
                                    ({
                                        transition: 'all 500ms cubic-bezier(0.16, 1, 0.3, 1)',
                                    } as any),
                            ]}
                        />
                    )
                })}
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    wrap: {
        gap: 12,
        overflow: 'hidden',
    },
    viewport: {
        overflow: 'hidden',
        paddingHorizontal: 16,
    },
    track: {
        flexDirection: 'row',
        gap: 12,
    },
    cardWrapper: {
        borderRadius: radius.lg,
        overflow: 'hidden',
    },
    card: {
        height: 230,
        borderRadius: radius.lg,
        overflow: 'hidden',
        backgroundColor: '#064e3b',
    },
    image: {
        borderRadius: radius.lg,
    },
    shade: {
        flex: 1,
        padding: 20,
        justifyContent: 'flex-end',
        gap: 6,
    },
    eyebrow: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
    },
    headline: {
        fontSize: 28,
        fontWeight: '800',
        color: '#fff',
        letterSpacing: -0.5,
    },
    body: {
        fontSize: 13,
        lineHeight: 19,
        color: 'rgba(255,255,255,0.92)',
    },
    code: {
        fontFamily: 'monospace',
        fontWeight: '700',
        color: '#fff',
        backgroundColor: 'rgba(255,255,255,0.18)',
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: 'rgba(255,255,255,0.6)',
        paddingHorizontal: 4,
        borderRadius: 4,
    },
    cta: {
        alignSelf: 'flex-start',
        marginTop: 8,
        backgroundColor: '#fff',
        borderRadius: radius.sm,
        paddingHorizontal: 16,
        paddingVertical: 9,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
        elevation: 2,
    },
    ctaPressed: {
        opacity: 0.88,
        transform: [{ scale: 0.98 }],
    },
    ctaText: {
        fontSize: 14,
        fontWeight: '700',
    },
    dots: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        marginTop: 2,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.borderStrong,
    },
    dotActive: {
        width: 22,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.brand,
    },
})
