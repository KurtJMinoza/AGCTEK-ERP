import { z } from 'zod'
import type { SalesOrderShippingDetails } from '@/types/storefront/retail'
import { SALES_DIVISION_IDS } from '../services/pricingEngine'
import { POSOrderItemSchema } from './pos.schema'

export const SalesOrderShippingSchema = z.strictObject({
    fullName: z.string().trim().min(1, 'Full name is required'),
    email: z.email('Enter a valid email address'),
    phone: z.string().trim().min(1, 'Phone is required'),
    addressLine1: z.string().trim().min(1, 'Address is required'),
    city: z.string().trim().min(1, 'City is required'),
    region: z.string().trim().min(1, 'Region is required'),
    postalCode: z.string().trim().min(1, 'Postal code is required'),
    country: z.string().trim().min(1, 'Country is required'),
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
