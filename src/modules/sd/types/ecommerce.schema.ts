import { z } from 'zod'
import type { SalesOrderShippingDetails } from '@/types/storefront/retail'
import { SALES_DIVISION_IDS } from '../services/pricingEngine'
import { POSOrderItemSchema } from './pos.schema'

export const SalesOrderShippingSchema = z.strictObject({
    fullName: z.string().trim(),
    email: z.string().trim(),
    phone: z.string().trim(),
    addressLine1: z.string().trim(),
    city: z.string().trim(),
    region: z.string().trim(),
    postalCode: z.string().trim(),
    country: z.string().trim().min(1, 'Country is required').default('PH'),
}) satisfies z.ZodType<SalesOrderShippingDetails>

/** Cart line; SKUs are unique per division only, so the seller division is part of the key. */
export const EcommerceOrderItemSchema = POSOrderItemSchema.extend({
    divisionId: z.enum(SALES_DIVISION_IDS),
})

/**
 * Marketplace e-commerce order (Lane B). Items may come from several
 * divisions; each division becomes its own sales order pending delivery.
 * Prices are never accepted from the client — SD pricing computes them.
 */
export const EcommerceOrderSchema = z.strictObject({
    /** Reuse on retry so a resubmitted checkout is not recorded twice. */
    checkoutId: z.string().trim().min(1).max(100).optional(),
    customerId: z.string().trim().min(1, 'Customer is required'),
    items: z.array(EcommerceOrderItemSchema).min(1, 'Cart is empty'),
    shipping: SalesOrderShippingSchema,
    discountCode: z.string().trim().optional(),
})

export type EcommerceOrderItem = z.infer<typeof EcommerceOrderItemSchema>
export type EcommerceOrder = z.input<typeof EcommerceOrderSchema>
