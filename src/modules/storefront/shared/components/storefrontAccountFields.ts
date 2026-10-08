import { z } from 'zod'
import type { SalesOrderShippingDetails } from '@/types/storefront/retail'

const PHILIPPINE_MOBILE = /^(?:\+63|0)9\d{9}$/

/** Normalizes the common spaces, hyphens and parentheses used in mobile input. */
export const normalizePhilippineMobile = (value: string) =>
    value.trim().replace(/[\s()-]/g, '')

const required = (label: string, minLength = 2) =>
    z
        .string()
        .trim()
        .min(1, `${label} is required`)
        .min(minLength, `${label} must be at least ${minLength} characters`)

const philippineMobile = z
    .string()
    .trim()
    .min(1, 'Mobile number is required')
    .refine(
        (value) => PHILIPPINE_MOBILE.test(normalizePhilippineMobile(value)),
        'Enter a valid Philippine mobile number',
    )

const philippinePostalCode = z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Enter a valid 4-digit postal code')

/** Delivery details every shopper account keeps for checkout. */
export const deliverySchema = {
    fullName: required('Full name'),
    phone: philippineMobile,
    addressLine1: required('Address', 5),
    city: required('City'),
    region: required('Region'),
    postalCode: philippinePostalCode,
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
