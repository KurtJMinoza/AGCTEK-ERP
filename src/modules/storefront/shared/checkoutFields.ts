import type { SalesOrderShippingDetails } from '@/types/storefront/retail'

export const BLANK_SHIPPING: SalesOrderShippingDetails = {
    fullName: '',
    email: '',
    phone: '',
    addressLine1: '',
    city: '',
    region: '',
    postalCode: '',
    country: 'PH',
}

export const SHIPPING_FIELDS: {
    name: Exclude<keyof SalesOrderShippingDetails, 'country'>
    label: string
    placeholder: string
    type?: string
    wide?: boolean
}[] = [
    { name: 'fullName', label: 'Full name', placeholder: 'Juan Dela Cruz' },
    {
        name: 'phone',
        label: 'Mobile number',
        placeholder: '+63 917 000 0000',
        type: 'tel',
    },
    {
        name: 'email',
        label: 'Email',
        placeholder: 'you@example.com',
        type: 'email',
        wide: true,
    },
    {
        name: 'addressLine1',
        label: 'Delivery address',
        placeholder: 'House no., street, barangay',
        wide: true,
    },
    { name: 'city', label: 'City', placeholder: 'Quezon City' },
    { name: 'region', label: 'Region / Province', placeholder: 'Metro Manila' },
    { name: 'postalCode', label: 'Postal code', placeholder: '1100' },
]
