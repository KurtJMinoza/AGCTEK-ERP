import type { TextInputProps } from 'react-native'
import type { ShippingDetails } from './types'

/** Same delivery fields and rules as the web account / checkout forms. */
export type DeliveryKey = Exclude<keyof ShippingDetails, 'email' | 'country'>
export type AccountForm = ShippingDetails & { password: string }
export type AccountMode = 'login' | 'register' | 'profile' | 'checkout'
export type FieldErrors = Partial<Record<keyof AccountForm, string>>

export const BLANK_ACCOUNT: AccountForm = {
    fullName: '',
    email: '',
    phone: '',
    addressLine1: '',
    city: '',
    region: '',
    postalCode: '',
    country: 'PH',
    password: '',
}

export const DELIVERY_FIELDS: {
    key: DeliveryKey
    label: string
    placeholder: string
    required: string
    keyboardType?: TextInputProps['keyboardType']
    autoComplete?: TextInputProps['autoComplete']
    half?: boolean
}[] = [
    { key: 'fullName', label: 'Full name', placeholder: 'Juan Dela Cruz', required: 'Full name is required', autoComplete: 'name' },
    {
        key: 'phone',
        label: 'Mobile number',
        placeholder: '+63 917 000 0000',
        required: 'Mobile number is required',
        keyboardType: 'phone-pad',
        autoComplete: 'tel',
    },
    {
        key: 'addressLine1',
        label: 'Delivery address',
        placeholder: 'House no., street, barangay',
        required: 'Address is required',
        autoComplete: 'street-address',
    },
    { key: 'city', label: 'City', placeholder: 'Quezon City', required: 'City is required', half: true },
    { key: 'region', label: 'Region / Province', placeholder: 'Metro Manila', required: 'Region is required', half: true },
    {
        key: 'postalCode',
        label: 'Postal code',
        placeholder: '1100',
        required: 'Postal code is required',
        keyboardType: 'number-pad',
        autoComplete: 'postal-code',
        half: true,
    },
]

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateAccount(mode: AccountMode, form: AccountForm): FieldErrors {
    const errors: FieldErrors = {}
    if (mode === 'login' || mode === 'register' || mode === 'checkout') {
        if (!EMAIL.test(form.email.trim())) errors.email = 'Enter a valid email'
    }
    if (mode === 'login' && !form.password) errors.password = 'Password is required'
    if (mode === 'register' && form.password.length < 6) errors.password = 'At least 6 characters'
    if (mode !== 'login') {
        for (const field of DELIVERY_FIELDS) {
            if (!form[field.key].trim()) errors[field.key] = field.required
        }
    }
    return errors
}

/** Trimmed copy (passwords are left as typed). */
export const trimAccount = (form: AccountForm): AccountForm => ({
    fullName: form.fullName.trim(),
    email: form.email.trim().toLowerCase(),
    phone: form.phone.trim(),
    addressLine1: form.addressLine1.trim(),
    city: form.city.trim(),
    region: form.region.trim(),
    postalCode: form.postalCode.trim(),
    country: form.country.trim() || 'PH',
    password: form.password,
})
