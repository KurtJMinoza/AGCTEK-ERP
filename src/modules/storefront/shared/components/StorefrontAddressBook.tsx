'use client'

import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { HiOutlineLocationMarker, HiOutlinePlus } from 'react-icons/hi'
import Alert from '@/components/ui/Alert'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { Form, FormItem } from '@/components/ui/Form'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { toApiError } from '@/modules/sd/services/apiError'
import {
    createRetailClientAddress,
    deleteRetailClientAddress,
    listRetailClientAddresses,
    setDefaultRetailClientAddress,
    type RetailAddress,
    type RetailAddressInput,
} from '@/services/storefront/retailClientService'

export type StorefrontAddressBookProps = {
    clientId: string
    /** Accent class for primary buttons ("Add New Address"). */
    accentButtonClass: () => string
    /** Accent class for inputs, e.g. focus ring colour. */
    accentInputClass?: string
    /** Accent class for text links ("Set as default"). */
    accentTextClass?: string
}

const BLANK_ADDRESS: RetailAddressInput & { label: string } = {
    label: '',
    fullName: '',
    phone: '',
    addressLine1: '',
    city: '',
    region: '',
    postalCode: '',
}

const ADDRESS_SCHEMA = z.object({
    label: z.string().trim().max(40, 'Keep the label short').optional(),
    fullName: z.string().trim().min(1, 'Full name is required'),
    phone: z.string().trim().min(1, 'Mobile number is required'),
    addressLine1: z.string().trim().min(1, 'Address is required'),
    city: z.string().trim().min(1, 'City is required'),
    region: z.string().trim().min(1, 'Region is required'),
    postalCode: z.string().trim().min(1, 'Postal code is required'),
})

type AddressFieldKey = keyof typeof BLANK_ADDRESS

const ADDRESS_FIELDS: {
    key: AddressFieldKey
    label: string
    placeholder: string
    type?: string
    wide?: boolean
}[] = [
    {
        key: 'label',
        label: 'Label (optional)',
        placeholder: 'Home, Office, …',
        wide: true,
    },
    {
        key: 'fullName',
        label: 'Full name',
        placeholder: 'Juan Dela Cruz',
        wide: true,
    },
    {
        key: 'phone',
        label: 'Mobile number',
        placeholder: '+63 917 000 0000',
        type: 'tel',
        wide: true,
    },
    {
        key: 'addressLine1',
        label: 'Address',
        placeholder: 'House no., street, barangay',
        wide: true,
    },
    { key: 'city', label: 'City', placeholder: 'Quezon City' },
    { key: 'region', label: 'Region / Province', placeholder: 'Metro Manila' },
    { key: 'postalCode', label: 'Postal code', placeholder: '1100' },
]

const formatAddressLine = (address: RetailAddress) =>
    [
        address.addressLine1,
        address.city,
        address.region,
        address.postalCode,
    ].join(', ')

/**
 * Customer address book: saved-address cards with Add / Set as default /
 * Delete, backed by the retail address API. The backend enforces the
 * first-address-is-default and cannot-delete-default rules.
 */
const StorefrontAddressBook = ({
    clientId,
    accentButtonClass,
    accentInputClass,
    accentTextClass = 'text-emerald-700 hover:!text-emerald-800',
}: StorefrontAddressBookProps) => {
    const [addresses, setAddresses] = useState<RetailAddress[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [showForm, setShowForm] = useState(false)
    const [form, setForm] = useState(BLANK_ADDRESS)
    const [formErrors, setFormErrors] = useState<
        Partial<Record<AddressFieldKey, string>>
    >({})
    const [busy, setBusy] = useState(false)
    const [pendingDelete, setPendingDelete] = useState<RetailAddress | null>(
        null,
    )

    const load = useCallback(async () => {
        try {
            setError(null)
            setAddresses(await listRetailClientAddresses(clientId))
        } catch (e) {
            setError(toApiError(e, 'Unable to load your addresses').message)
            setAddresses([])
        }
    }, [clientId])

    useEffect(() => {
        void load()
    }, [load])

    const update = (key: AddressFieldKey, value: string) => {
        setForm((prev) => ({ ...prev, [key]: value }))
        setFormErrors((prev) => ({ ...prev, [key]: undefined }))
    }

    const submitNew = async () => {
        const parsed = ADDRESS_SCHEMA.safeParse(form)
        if (!parsed.success) {
            const next: Partial<Record<AddressFieldKey, string>> = {}
            for (const issue of parsed.error.issues) {
                const key = issue.path[0] as AddressFieldKey
                next[key] ??= issue.message
            }
            setFormErrors(next)
            return
        }
        setBusy(true)
        try {
            await createRetailClientAddress(clientId, parsed.data)
            setForm(BLANK_ADDRESS)
            setFormErrors({})
            setShowForm(false)
            await load()
        } catch (e) {
            setError(toApiError(e, 'Unable to add address').message)
        } finally {
            setBusy(false)
        }
    }

    const setDefault = async (addressId: string) => {
        setBusy(true)
        try {
            await setDefaultRetailClientAddress(addressId)
            await load()
        } catch (e) {
            setError(toApiError(e, 'Unable to change default address').message)
        } finally {
            setBusy(false)
        }
    }

    const confirmDelete = async () => {
        if (!pendingDelete) return
        setBusy(true)
        try {
            await deleteRetailClientAddress(pendingDelete.id)
            await load()
        } catch (e) {
            setError(toApiError(e, 'Unable to delete address').message)
        } finally {
            setBusy(false)
            setPendingDelete(null)
        }
    }

    return (
        <div className="mt-4 border-t border-gray-100 pt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900">
                    Saved addresses
                </span>
                <Button
                    type="button"
                    size="sm"
                    variant="plain"
                    className={accentTextClass}
                    icon={<HiOutlinePlus className="text-base" />}
                    disabled={busy}
                    onClick={(e) => {
                        // Never let this leak into the profile form (it is a
                        // sibling subtree, but guard the default submit flow).
                        e.preventDefault()
                        e.stopPropagation()
                        setShowForm((v) => !v)
                    }}
                >
                    Add New Address
                </Button>
            </div>

            {error ? (
                <Alert showIcon type="danger" className="mb-3">
                    {error}
                </Alert>
            ) : null}

            {showForm ? (
                <Form
                    id="storefront-new-address-form"
                    className="mb-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3"
                    onSubmit={(e) => {
                        e.preventDefault()
                        void submitNew()
                    }}
                >
                    <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
                        {ADDRESS_FIELDS.map((field) => (
                            <FormItem
                                key={field.key}
                                label={field.label}
                                asterisk={field.key !== 'label'}
                                className={
                                    field.wide ? 'sm:col-span-2' : undefined
                                }
                                invalid={Boolean(formErrors[field.key])}
                                errorMessage={formErrors[field.key]}
                            >
                                <Input
                                    type={field.type ?? 'text'}
                                    value={form[field.key]}
                                    placeholder={field.placeholder}
                                    className={accentInputClass}
                                    onChange={(e) =>
                                        update(field.key, e.target.value)
                                    }
                                />
                            </FormItem>
                        ))}
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                                setShowForm(false)
                                setForm(BLANK_ADDRESS)
                                setFormErrors({})
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            type="submit"
                            form="storefront-new-address-form"
                            customColorClass={accentButtonClass}
                            loading={busy}
                        >
                            Save address
                        </Button>
                    </div>
                </Form>
            ) : null}

            {addresses === null ? (
                <p className="text-sm text-gray-400">Loading addresses…</p>
            ) : addresses.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-gray-400">
                    <HiOutlineLocationMarker className="text-lg" />
                    No saved addresses yet.
                </p>
            ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {addresses.map((address) => (
                        <div
                            key={address.id}
                            className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="truncate text-sm font-semibold text-gray-900">
                                            {address.label ?? address.fullName}
                                        </span>
                                        {address.isDefault ? (
                                            <Badge
                                                content="Default"
                                                innerClass="!bg-emerald-500"
                                            />
                                        ) : null}
                                    </div>
                                    <p className="mt-0.5 truncate text-xs text-gray-500">
                                        {address.fullName} · {address.phone}
                                    </p>
                                    <p className="mt-0.5 text-xs leading-5 text-gray-600">
                                        {formatAddressLine(address)}
                                    </p>
                                </div>
                            </div>
                            <div className="mt-2 flex items-center gap-1">
                                {address.isDefault ? (
                                    <span className="px-2 py-1 text-xs font-medium text-gray-400">
                                        Used at checkout
                                    </span>
                                ) : (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="plain"
                                        className={accentTextClass}
                                        disabled={busy}
                                        onClick={() =>
                                            void setDefault(address.id)
                                        }
                                    >
                                        Set as default
                                    </Button>
                                )}
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="plain"
                                    className="!text-red-600 hover:!bg-red-50"
                                    disabled={busy}
                                    onClick={() => setPendingDelete(address)}
                                >
                                    Delete
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <ConfirmDialog
                isOpen={pendingDelete !== null}
                type="danger"
                title="Delete address?"
                confirmText="Delete"
                cancelText="Cancel"
                onClose={() => setPendingDelete(null)}
                onRequestClose={() => setPendingDelete(null)}
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => void confirmDelete()}
            >
                <p>
                    {pendingDelete?.isDefault
                        ? 'This is your default address. You can only delete it once another address is set as default.'
                        : `Delete ${pendingDelete?.label ?? 'this address'}?`}
                </p>
            </ConfirmDialog>
        </div>
    )
}

export default StorefrontAddressBook