import { z } from 'zod'

export const POSOrderItemSchema = z.strictObject({
    sku: z.string().trim().min(1, 'SKU is required'),
    quantity: z.number().int().positive('Quantity must be at least 1'),
})

/**
 * POS fast-track order: over-the-counter sale with immediate PGI and cash-sale
 * billing. Strict object — shipping or any delivery fields are rejected.
 */
export const POSOrderSchema = z.strictObject({
    branchId: z.string().trim().min(1, 'Select a branch before completing the sale'),
    items: z.array(POSOrderItemSchema).min(1, 'Cart is empty'),
    paymentReceived: z.number().nonnegative('Payment cannot be negative'),
})

export type POSOrderItem = z.infer<typeof POSOrderItemSchema>
export type POSOrder = z.infer<typeof POSOrderSchema>
