import {
    RETAIL_DIVISION_ID,
    type InventoryATP,
    type RetailProduct,
    type RetailProductReview,
    type SalesOrderPayload,
} from '@/types/storefront/retail'

type ProductSeed = Omit<RetailProduct, 'details' | 'features' | 'reviews'> & {
    details: string
    features: string[]
    reviews: RetailProductReview[]
}

const MOCK_PRODUCTS: ProductSeed[] = [
    {
        itemId: 'RET-001',
        sku: 'VIT-MULTI-60',
        name: 'Daily Essentials Multivitamin',
        description:
            'Balanced daily support with vitamins A, C, D, E, and minerals.',
        details:
            'A once-daily formula built for real routines — steady energy, immune support, and micronutrient coverage without a bulky stack. Made for adults who want one clean bottle instead of five.',
        features: [
            '60 vegetarian capsules · 2-month supply',
            'Vitamins A, C, D3, E + zinc & selenium',
            'No artificial dyes or unnecessary fillers',
            'Third-party purity tested',
        ],
        reviews: [
            {
                id: 'r1',
                author: 'Maya L.',
                rating: 5,
                title: 'Easy daily habit',
                body: 'No aftertaste and I actually remember to take it. Energy feels more even through the afternoon.',
                date: '2026-02-12',
            },
            {
                id: 'r2',
                author: 'Chris P.',
                rating: 4,
                title: 'Solid everyday multi',
                body: 'Switched from a bigger brand. Packaging feels premium and the dose is straightforward.',
                date: '2026-01-28',
            },
        ],
        basePrice: 24.99,
        category: 'Vitamins',
        imageUrl:
            'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&q=80',
        salesOrgId: RETAIL_DIVISION_ID,
        popularity: 92,
    },
    {
        itemId: 'RET-002',
        sku: 'VIT-OMEGA-90',
        name: 'Omega-3 Fish Oil Softgels',
        description: 'Heart and cognitive support with purified EPA and DHA.',
        details:
            'Molecularly distilled fish oil with a clean EPA/DHA profile. Softgels are easy to swallow and lightly lemon-touched to keep the finish fresh.',
        features: [
            '90 softgels · 1,000 mg fish oil each',
            'High EPA + DHA for heart & focus',
            'Molecularly distilled · mercury screened',
            'Burp-minimizing lemon finish',
        ],
        reviews: [
            {
                id: 'r1',
                author: 'Elena R.',
                rating: 5,
                title: 'No fishy aftertaste',
                body: 'Finally an omega that doesn’t linger. Taking with breakfast works best for me.',
                date: '2026-03-02',
            },
            {
                id: 'r2',
                author: 'Jon D.',
                rating: 4,
                title: 'Noticeable focus',
                body: 'Been consistent for six weeks — mornings feel clearer. Would buy again.',
                date: '2026-02-18',
            },
        ],
        basePrice: 32.5,
        category: 'Vitamins',
        imageUrl:
            'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=800&q=80',
        salesOrgId: RETAIL_DIVISION_ID,
        popularity: 88,
    },
    {
        itemId: 'RET-003',
        sku: 'VIT-C-1000',
        name: 'Vitamin C + Zinc Immunity',
        description: 'Immune-focused formula with sustained-release vitamin C.',
        details:
            'Sustained-release vitamin C paired with zinc for day-long immune support — especially useful during travel and busy seasons.',
        features: [
            '1,000 mg vitamin C with zinc',
            'Sustained-release tablet',
            'Travel-friendly blister packs',
            'Non-acidic buffer for gentler stomach feel',
        ],
        reviews: [
            {
                id: 'r1',
                author: 'Paolo M.',
                rating: 4,
                title: 'Good travel companion',
                body: 'Kept a pack in my weekender. Easy dosing and no stomach upset.',
                date: '2026-01-09',
            },
        ],
        basePrice: 18.75,
        category: 'Vitamins',
        imageUrl:
            'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=800&q=80',
        salesOrgId: RETAIL_DIVISION_ID,
        popularity: 76,
    },
    {
        itemId: 'RET-004',
        sku: 'VIT-COLLAGEN-30',
        name: 'Collagen Beauty Blend',
        description: 'Hydrolyzed collagen peptides with biotin support.',
        details:
            'Hydrolyzed peptides designed to dissolve cleanly in coffee or water, with biotin for hair and nail support. Unflavored so it stays out of the way.',
        features: [
            '30 sachets · hydrolyzed Type I & III',
            'With biotin & vitamin C',
            'Unflavored · mixes into hot or cold drinks',
            'Pasture-raised bovine collagen',
        ],
        reviews: [
            {
                id: 'r1',
                author: 'Ava S.',
                rating: 5,
                title: 'Skin looks calmer',
                body: 'Mixed into morning coffee for a month — nails are stronger and skin feels smoother.',
                date: '2026-02-25',
            },
            {
                id: 'r2',
                author: 'Nina K.',
                rating: 4,
                title: 'Dissolves well',
                body: 'No clumps, no taste. Easy to stay consistent.',
                date: '2026-02-01',
            },
        ],
        basePrice: 39.0,
        category: 'Vitamins',
        imageUrl:
            'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&q=80',
        salesOrgId: RETAIL_DIVISION_ID,
        popularity: 81,
    },
    {
        itemId: 'RET-005',
        sku: 'BAG-TRAVEL-NAVY',
        name: 'Heritage Weekender Bag',
        description: 'Water-resistant canvas weekender with leather trim.',
        details:
            'Built for short trips and long weekends — structured canvas, leather accents, and a roomy main compartment that still slides under most seats.',
        features: [
            'Water-resistant waxed canvas',
            'Full-grain leather handles & trim',
            'Interior laptop sleeve + zip pocket',
            'Detachable shoulder strap',
        ],
        reviews: [
            {
                id: 'r1',
                author: 'Marco T.',
                rating: 5,
                title: 'Weekend-ready',
                body: 'Fits two outfits plus toiletries without looking overstuffed. Leather ages beautifully.',
                date: '2026-03-05',
            },
            {
                id: 'r2',
                author: 'Lia H.',
                rating: 5,
                title: 'Worth every peso',
                body: 'Stitching is clean and the shape holds. Gets compliments every flight.',
                date: '2026-01-20',
            },
        ],
        basePrice: 89.0,
        category: 'Bags',
        imageUrl:
            'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&q=80',
        salesOrgId: RETAIL_DIVISION_ID,
        popularity: 94,
    },
    {
        itemId: 'RET-006',
        sku: 'BAG-TOTE-OLIVE',
        name: 'Market Tote — Olive',
        description: 'Lightweight structured tote with interior pockets.',
        details:
            'A everyday carry that still stands upright when you set it down. Soft structure, quiet hardware, and pockets that actually organize your day.',
        features: [
            'Structured olive canvas',
            'Interior zip + slip pockets',
            'Reinforced base panel',
            'Magnetic top closure',
        ],
        reviews: [
            {
                id: 'r1',
                author: 'Priya N.',
                rating: 4,
                title: 'Perfect market bag',
                body: 'Light enough for errands but doesn’t collapse. Olive color hides everyday scuffs.',
                date: '2026-02-14',
            },
        ],
        basePrice: 45.0,
        category: 'Bags',
        imageUrl:
            'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=800&q=80',
        salesOrgId: RETAIL_DIVISION_ID,
        popularity: 85,
    },
    {
        itemId: 'RET-007',
        sku: 'BAG-BACKPACK-SLATE',
        name: 'Commuter Backpack',
        description: 'Minimal backpack with padded laptop sleeve.',
        details:
            'A clean silhouette for the commute — padded laptop sleeve, quick-access pocket, and breathable straps that don’t shout “tech bag.”',
        features: [
            'Fits 15" laptop',
            'Padded back panel & straps',
            'Water-resistant shell',
            'Hidden zip pocket for valuables',
        ],
        reviews: [
            {
                id: 'r1',
                author: 'Kenji W.',
                rating: 5,
                title: 'Minimal and tough',
                body: 'Daily train commute for months — still looks sharp. Laptop stays secure.',
                date: '2026-03-01',
            },
            {
                id: 'r2',
                author: 'Sofia G.',
                rating: 4,
                title: 'Great size',
                body: 'Not bulky. Enough room for charger, notebook, and a light shell.',
                date: '2026-01-15',
            },
        ],
        basePrice: 72.0,
        category: 'Bags',
        imageUrl:
            'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80',
        salesOrgId: RETAIL_DIVISION_ID,
        popularity: 90,
    },
    {
        itemId: 'RET-008',
        sku: 'ACC-SCARF-GOLD',
        name: 'Woven Accent Scarf',
        description: 'Soft-touch scarf with subtle gold thread.',
        details:
            'A soft weave with a quiet gold thread that catches light without glitter. Layer it for travel days or evenings out.',
        features: [
            'Soft-touch woven blend',
            'Subtle gold filament detail',
            'Generous 180 × 70 cm drape',
            'Hand-finished fringe',
        ],
        reviews: [
            {
                id: 'r1',
                author: 'Helen C.',
                rating: 5,
                title: 'Quiet luxury feel',
                body: 'Soft against skin and the gold thread is tasteful — not flashy.',
                date: '2026-02-08',
            },
        ],
        basePrice: 28.0,
        category: 'Accessories',
        imageUrl:
            'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800&q=80',
        salesOrgId: RETAIL_DIVISION_ID,
        popularity: 62,
    },
    {
        itemId: 'RET-009',
        sku: 'GEN-CANDLE-ECO',
        name: 'Soy Candle — Forest & Amber',
        description: 'Clean-burning soy candle, 45-hour burn.',
        details:
            'A slow, clean burn with notes of forest resin and warm amber. Poured in a reusable vessel that fits the Amalgated World palette.',
        features: [
            '100% soy wax · cotton wick',
            '~45-hour burn time',
            'Forest resin & amber scent profile',
            'Reusable glass vessel',
        ],
        reviews: [
            {
                id: 'r1',
                author: 'Drew F.',
                rating: 5,
                title: 'Evening ritual',
                body: 'Scent is grounded, not sugary. Burns evenly with almost no soot.',
                date: '2026-02-22',
            },
        ],
        basePrice: 22.0,
        category: 'General Goods',
        imageUrl:
            'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=800&q=80',
        salesOrgId: RETAIL_DIVISION_ID,
        popularity: 70,
    },
    {
        itemId: 'RET-010',
        sku: 'GEN-BOTTLE-750',
        name: 'Insulated Steel Bottle',
        description: 'Double-wall vacuum bottle, cold 24h / hot 12h.',
        details:
            'Double-wall vacuum insulation that keeps drinks cold through a full workday. Powder-coated finish, leak-resistant lid, and a silhouette that fits most cup holders.',
        features: [
            '750 ml capacity',
            'Cold 24h · hot 12h insulation',
            'Leak-resistant flip lid',
            'BPA-free · cup-holder friendly',
        ],
        reviews: [
            {
                id: 'r1',
                author: 'Ian B.',
                rating: 5,
                title: 'Still icy at 6pm',
                body: 'Filled at 8am, ice left at dinner. Lid hasn’t leaked in my bag once.',
                date: '2026-03-04',
            },
            {
                id: 'r2',
                author: 'Rina A.',
                rating: 4,
                title: 'Solid daily bottle',
                body: 'Weight is fair for the size. Easy to clean.',
                date: '2026-01-30',
            },
        ],
        basePrice: 34.99,
        category: 'General Goods',
        imageUrl:
            'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&q=80',
        salesOrgId: RETAIL_DIVISION_ID,
        popularity: 83,
    },
    {
        itemId: 'RET-011',
        sku: 'GEN-NOTEBOOK-A5',
        name: 'Linen Journal A5',
        description: 'Lay-flat journal with 192gsm pages.',
        details:
            'A linen-bound A5 journal that lays flat from the first page. Thick paper that handles fountain pens without ghosting.',
        features: [
            'A5 · 192 lined pages',
            '192gsm cream paper',
            'Linen hardcover · ribbon marker',
            'Lay-flat binding',
        ],
        reviews: [
            {
                id: 'r1',
                author: 'Theo V.',
                rating: 5,
                title: 'Fountain-pen friendly',
                body: 'Zero bleed-through with my EF nib. Binding feels durable.',
                date: '2026-02-11',
            },
        ],
        basePrice: 16.5,
        category: 'General Goods',
        imageUrl:
            'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800&q=80',
        salesOrgId: RETAIL_DIVISION_ID,
        popularity: 58,
    },
    {
        itemId: 'RET-012',
        sku: 'ACC-SUNGLASS-01',
        name: 'Polarized Daylight Sunglasses',
        description: 'UV400 polarized lenses, acetate frames.',
        details:
            'Polarized UV400 lenses in a light acetate frame — made for bright coastal days and city glare without the oversized look.',
        features: [
            'UV400 polarized lenses',
            'Hand-polished acetate frames',
            'Spring hinges for all-day comfort',
            'Includes hard case & cloth',
        ],
        reviews: [
            {
                id: 'r1',
                author: 'Camille O.',
                rating: 5,
                title: 'Crisp and light',
                body: 'Polarization is excellent driving west at sunset. Frames don’t dig in.',
                date: '2026-03-06',
            },
            {
                id: 'r2',
                author: 'Noah J.',
                rating: 4,
                title: 'Clean look',
                body: 'Simple shape that works with most outfits. Case feels sturdy.',
                date: '2026-02-03',
            },
        ],
        basePrice: 54.0,
        category: 'Accessories',
        imageUrl:
            'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=800&q=80',
        salesOrgId: RETAIL_DIVISION_ID,
        popularity: 74,
    },
]

const MOCK_ATP: Record<string, InventoryATP> = Object.fromEntries(
    MOCK_PRODUCTS.map((product, index) => [
        product.sku,
        {
            sku: product.sku,
            availableQuantity: index === 2 ? 0 : 40 + index * 7,
            reservedQuantity: 2,
            physicalStock: index === 2 ? 0 : 42 + index * 7,
        },
    ]),
)

const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, ms)
    })

const cloneProduct = (product: ProductSeed): RetailProduct => ({
    ...product,
    features: [...product.features],
    reviews: product.reviews.map((review) => ({ ...review })),
})

export async function fetchRetailProducts(): Promise<RetailProduct[]> {
    await sleep(280)
    return MOCK_PRODUCTS.map(cloneProduct)
}

export async function fetchRetailProductBySku(
    sku: string,
): Promise<RetailProduct | null> {
    await sleep(180)
    const product = MOCK_PRODUCTS.find(
        (item) => item.sku.toLowerCase() === sku.trim().toLowerCase(),
    )
    return product ? cloneProduct(product) : null
}

export async function checkStockATP(sku: string): Promise<InventoryATP> {
    await sleep(120)
    return (
        MOCK_ATP[sku] ?? {
            sku,
            availableQuantity: 0,
            reservedQuantity: 0,
            physicalStock: 0,
        }
    )
}

export type SubmitSalesOrderResult = {
    orderId: string
    status: 'created'
    message: string
}

export async function submitSalesOrder(
    order: SalesOrderPayload,
): Promise<SubmitSalesOrderResult> {
    await sleep(500)
    const orderId = `SO-${Date.now().toString(36).toUpperCase()}`
    return {
        orderId,
        status: 'created',
        message: `Sales order ${orderId} submitted to SD for ${order.divisionId}.`,
    }
}
