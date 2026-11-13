import { z } from 'zod'

export const POSOrderItemSchema = z.strictObject({
    sku: z.string().trim().min(1, 'SKU is required'),
    quantity: z.number().int().positive('Quantity must be at least 1'),
    /** Selected variant (products with options); unit price overrides catalog. */
    variantId: z.string().trim().min(1).optional(),
    variantName: z.string().trim().optional(),
    unitPrice: z.number().nonnegative().optional(),
})

export type POSOrderItem = z.infer<typeof POSOrderItemSchema>

/** Tender methods the SD backend accepts (SD owns the tender vocabulary). */
export const POS_TENDER_METHODS = [
    'CASH',
    'GCASH',
    'BANK_TRANSFER',
    'CARD',
    'CHEQUE',
    'SALARY_LOAN',
] as const

export const PosTenderMethodSchema = z.enum(POS_TENDER_METHODS)
export type PosTenderMethod = z.infer<typeof PosTenderMethodSchema>

/** One tender of a sale. The server re-validates every field. */
export const PosTenderSchema = z.object({
    method: PosTenderMethodSchema,
    /** Amount of the sale this tender covers. */
    amount: z.number().min(0.01, 'Enter an amount greater than zero'),
    /** Cash handed over; may exceed `amount` (the surplus is the change). */
    tenderAmount: z.number().nonnegative().optional(),
    referenceNumber: z.string().trim().min(1).optional(),
    provider: z.string().trim().min(1).optional(),
    bankName: z.string().trim().min(1).optional(),
    transactionDate: z.string().trim().min(1).optional(),
    employeeNumber: z.string().trim().min(1).optional(),
    payrollReference: z.string().trim().min(1).optional(),
    /** Cashier that confirmed the tender; without it the tender stays pending. */
    verifiedBy: z.string().trim().min(1).optional(),
})

/** A sale carries one tender row per payment method (split payment). */
export const PosTenderListSchema = z
    .array(PosTenderSchema)
    .min(1, 'Add at least one payment method')

export const PosCheckoutLineSchema = z.object({
    sku: z.string().trim().min(1, 'SKU is required'),
    variantId: z.string().trim().min(1).optional(),
    variantName: z.string().trim().optional(),
    description: z.string().trim().optional(),
    quantity: z.number().positive('Quantity must be at least 1'),
    unitPrice: z.number().nonnegative(),
})

/** Body of POST /sd/pos/checkout. */
export const PosCheckoutPayloadSchema = z.object({
    posSessionId: z.string().trim().min(1, 'Open a shift first'),
    idempotencyKey: z.string().trim().min(1),
    divisionId: z.string().trim().min(1),
    branchId: z.string().trim().min(1, 'Select a branch first'),
    customerId: z.string().trim().min(1),
    customerName: z.string().trim().min(1).optional(),
    cashierUserId: z.string().trim().min(1).optional(),
    createdBy: z.string().trim().min(1).optional(),
    discountAmount: z.number().nonnegative().optional(),
    lines: z.array(PosCheckoutLineSchema).min(1, 'Cart is empty'),
    tenders: PosTenderListSchema,
})

export type PosTenderInput = z.infer<typeof PosTenderSchema>
export type PosTenderList = z.infer<typeof PosTenderListSchema>
export type PosCheckoutLine = z.infer<typeof PosCheckoutLineSchema>
export type PosCheckoutPayload = z.infer<typeof PosCheckoutPayloadSchema>

/** Parked cart of a held sale (snapshot owned by the terminal). */
export const PosHoldPayloadSchema = z.object({
    items: z.array(
        z.object({
            product: z.object({
                productId: z.string().default(''),
                itemId: z.string().default(''),
                sku: z.string(),
                name: z.string().default(''),
                description: z.string().default(''),
                details: z.string().default(''),
                features: z.array(z.string()).default([]),
                reviews: z.array(z.unknown()).default([]),
                basePrice: z.number().default(0),
                category: z.string().default('General Goods'),
                imageUrl: z.string().default(''),
                imageGallery: z.array(z.string()).default([]),
                salesOrgId: z.string().default(''),
            }),
            quantity: z.number().int().positive(),
            itemTotal: z.number().default(0),
            variant: z
                .object({
                    id: z.string(),
                    name: z.string(),
                    sku: z.string(),
                    unitPrice: z.number(),
                })
                .nullable()
                .default(null),
        }),
    ),
    discountAmount: z.number().nonnegative().default(0),
    customer: z
        .object({
            id: z.string(),
            name: z.string(),
            accountType: z.string().default('NON_CREDIT'),
        })
        .nullable()
        .default(null),
})

export type PosHoldPayload = z.infer<typeof PosHoldPayloadSchema>
