import { z } from 'zod'
import type { SalesOrderShippingDetails } from '@/types/storefront/retail'

const PHILIPPINE_MOBILE = /^(?:\+63|0)9\d{9}$/

/** Normalizes the common spaces, hyphens and parentheses used in mobile input. */
export const normalizePhilippineMobile = (value: string) =>
    value.trim().replace(/[\s()-]/g, '')

/** Optional in account setup: empty is fine, non-empty must be valid. */
const optionalText = (label: string, minLength = 2) =>
    z
        .string()
        .trim()
        .refine(
            (value) =>
                value === '' || value.length >= minLength,
            `${label} must be at least ${minLength} characters`,
        )

const optionalPhilippineMobile = z
    .string()
    .trim()
    .refine(
        (value) =>
            value === '' ||
            PHILIPPINE_MOBILE.test(normalizePhilippineMobile(value)),
        'Enter a valid Philippine mobile number',
    )

const optionalPhilippinePostalCode = z
    .string()
    .trim()
    .regex(/^(?:\d{4})?$/, 'Enter a valid 4-digit postal code')

/** Delivery details a shopper account MAY keep for checkout (all optional). */
export const deliverySchema = {
    fullName: optionalText('Full name'),
    phone: optionalPhilippineMobile,
    addressLine1: optionalText('Address', 5),
    city: optionalText('City'),
    region: optionalText('Region'),
    postalCode: optionalPhilippinePostalCode,
}

export type DeliveryFieldKey = Exclude<
    keyof SalesOrderShippingDetails,
    'email' | 'country'
>

export const DELIVERY_FIELDS: {
    key: DeliveryFieldKey
    label: string
    placeholder: string
    autoComplete: string
    wide?: boolean
    type?: string
}[] = [
    {
        key: 'fullName',
        label: 'Full name',
        placeholder: 'Juan Dela Cruz',
        autoComplete: 'name',
        wide: true,
    },
    {
        key: 'phone',
        label: 'Mobile number',
        placeholder: '+63 917 000 0000',
        autoComplete: 'tel',
        type: 'tel',
        wide: true,
    },
    {
        key: 'addressLine1',
        label: 'Delivery address',
        placeholder: 'House no., street, barangay',
        autoComplete: 'street-address',
        wide: true,
    },
    {
        key: 'city',
        label: 'City',
        placeholder: 'Quezon City',
        autoComplete: 'address-level2',
    },
    {
        key: 'region',
        label: 'Region / Province',
        placeholder: 'Metro Manila',
        autoComplete: 'address-level1',
    },
    {
        key: 'postalCode',
        label: 'Postal code',
        placeholder: '1100',
        autoComplete: 'postal-code',
    },
]
