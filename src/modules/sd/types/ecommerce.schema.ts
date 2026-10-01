import { z } from 'zod'
import {
    RETAIL_DIVISION_ID,
    type SalesOrderShippingDetails,
} from '@/types/storefront/retail'
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

/**
 * E-commerce standard-flow order (Lane B): ATP + soft reservation, sales
 * order pending delivery, billing after PGI/POD. Prices are never accepted
 * from the client — SD pricing computes them from the SKUs.
 */
export const EcommerceOrderSchema = z.strictObject({
    /** Selling division; pricing only resolves SKUs from this division's catalog. */
    divisionId: z.enum(SALES_DIVISION_IDS).default(RETAIL_DIVISION_ID),
    customerId: z.string().trim().min(1, 'Customer is required'),
    items: z.array(POSOrderItemSchema).min(1, 'Cart is empty'),
    shipping: SalesOrderShippingSchema,
    discountCode: z.string().trim().optional(),
})

export type EcommerceOrder = z.input<typeof EcommerceOrderSchema>
