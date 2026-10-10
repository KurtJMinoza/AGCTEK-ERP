'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import {
    HiOutlineCheckCircle,
    HiOutlineLocationMarker,
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineRefresh,
    HiOutlineTrash,
    HiOutlineUserCircle,
} from 'react-icons/hi'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import { Form, FormItem } from '@/components/ui/Form'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { toApiError } from '@/modules/sd/services/apiError'
import { normalizePhilippineMobile } from '@/modules/storefront/shared/components/storefrontAccountFields'
import {
    createRetailClientAddress,
    deleteRetailClientAddress,
    fetchRetailClientAddresses,
    reverseRetailAddress,
    searchRetailAddress,
    setRetailClientDefaultAddress,
    updateRetailClientAddress,
    type RetailAddressPayload,
    type RetailClientAddress,
    type RetailGeocodedAddress,
    type RetailPlaceSuggestion,
} from '@/services/storefront/retailClientService'
import MarketplaceHeader from '../components/MarketplaceHeader'
import {
    MARKETPLACE_ACCOUNT_PATH,
    MARKETPLACE_SIGN_IN_PATH,
    marketplaceAuthHref,
} from '../host'
import { notify, useMarketplace } from '../MarketplaceProvider'
import { PRIMARY_BUTTON } from '../marketplaceUi'
import { useMarketplaceClientStore } from '../store/useMarketplaceClientStore'

const MarketplaceAddressMap = dynamic(
    () => import('../components/MarketplaceAddressMap'),
    {
        ssr: false,
        loading: () => (
            <div className="h-72 animate-pulse rounded-xl bg-gray-100 sm:h-80" />
        ),
    },
)

const PHILIPPINE_MOBILE = /^(?:\+63|0)9\d{9}$/
const INITIAL_PIN = { latitude: 14.5995, longitude: 120.9842 }

type EditorState = {
    address: RetailClientAddress | null
    readOnly: boolean
}

type AddressDraft = {
    addressType: 'HOME' | 'WORK'
    latitude: number
    longitude: number
    detected: RetailGeocodedAddress
    additionalInfo: string
    isDefault: boolean
}

const emptyDetected = (): RetailGeocodedAddress => ({
    formattedAddress: null,
    addressLine: null,
    barangayOrNeighborhood: null,
    cityOrMunicipality: null,
    provinceOrState: null,
    postalCode: null,
    country: null,
})

const newDraft = (): AddressDraft => ({
    addressType: 'HOME',
    ...INITIAL_PIN,
    detected: emptyDetected(),
    additionalInfo: '',
    isDefault: false,
})

const addressToDraft = (address: RetailClientAddress): AddressDraft => ({
    addressType: address.addressType,
    latitude: address.latitude,
    longitude: address.longitude,
    detected: {
        formattedAddress: address.formattedAddress,
        addressLine: address.addressLine,
        barangayOrNeighborhood: address.barangayOrNeighborhood,
        cityOrMunicipality: address.cityOrMunicipality,
        provinceOrState: address.provinceOrState,
        postalCode: address.postalCode,
        country: address.country,
    },
    additionalInfo: address.additionalInfo ?? '',
    isDefault: address.isDefault,
})

const addressLines = (address: RetailClientAddress) =>
    [
        address.addressLine,
        address.barangayOrNeighborhood,
        [address.cityOrMunicipality, address.provinceOrState]
            .filter(Boolean)
            .join(', '),
        [address.postalCode, address.country].filter(Boolean).join(' '),
    ].filter(Boolean) as string[]

const AddressDialog = ({
    editor,
    token,
    onClose,
    onSaved,
}: {
    editor: EditorState | null
    token: string
    onClose: () => void
    onSaved: () => Promise<void>
}) => {
    const [draft, setDraft] = useState<AddressDraft>(newDraft)
    const [search, setSearch] = useState('')
    const [results, setResults] = useState<RetailPlaceSuggestion[]>([])
    const [searching, setSearching] = useState(false)
    const [reverseLoading, setReverseLoading] = useState(false)
    const [reverseError, setReverseError] = useState<string | null>(null)
    const [reverseAttempt, setReverseAttempt] = useState(0)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const open = editor !== null
    const readOnly = editor?.readOnly ?? false

    useEffect(() => {
        if (!editor) return
        setDraft(editor.address ? addressToDraft(editor.address) : newDraft())
        setSearch('')
        setResults([])
        setReverseError(null)
        setSaveError(null)
        setReverseAttempt(0)
    }, [editor])

    useEffect(() => {
        if (!open || readOnly || search.trim().length < 3) {
            setResults([])
            return
        }
        let active = true
        const timeout = window.setTimeout(() => {
            setSearching(true)
            void searchRetailAddress(token, search.trim())
                .then((items) => active && setResults(items))
                .catch(() => active && setResults([]))
                .finally(() => active && setSearching(false))
        }, 350)
        return () => {
            active = false
            window.clearTimeout(timeout)
        }
    }, [open, readOnly, search, token])

    useEffect(() => {
        if (!open || readOnly) return
        let active = true
        const timeout = window.setTimeout(() => {
            setReverseLoading(true)
            setReverseError(null)
            void reverseRetailAddress(token, draft.latitude, draft.longitude)
                .then((detected) => {
                    if (active)
                        setDraft((current) => ({ ...current, detected }))
                })
                .catch(() => {
                    if (active) {
                        setReverseError(
                            'We could not identify this pin yet. You can retry or save the exact coordinates.',
                        )
                    }
                })
                .finally(() => active && setReverseLoading(false))
        }, 120)
        return () => {
            active = false
            window.clearTimeout(timeout)
        }
    }, [open, readOnly, token, draft.latitude, draft.longitude, reverseAttempt])

    const selectPlace = (place: RetailPlaceSuggestion) => {
        setDraft((current) => ({
            ...current,
            latitude: place.lat,
            longitude: place.lng,
            detected: {
                ...current.detected,
                formattedAddress: place.address,
                cityOrMunicipality: place.city,
                postalCode: place.postalCode,
                country: place.country,
            },
        }))
        setSearch(place.label)
        setResults([])
    }

    const save = async () => {
        if (!editor || readOnly) return
        setSaving(true)
        setSaveError(null)
        // Leaflet pins carry full float precision; store 6 decimals to keep
        // the saved point stable, display-friendly and safely within DTO bounds.
        const roundCoord = (value: number, digits = 6) =>
            Number(value.toFixed(digits))
        const payload: RetailAddressPayload = {
            addressType: draft.addressType,
            latitude: roundCoord(draft.latitude),
            longitude: roundCoord(draft.longitude),
            formattedAddress: draft.detected.formattedAddress,
            addressLine: draft.detected.addressLine,
            barangayOrNeighborhood: draft.detected.barangayOrNeighborhood,
            cityOrMunicipality: draft.detected.cityOrMunicipality,
            provinceOrState: draft.detected.provinceOrState,
            postalCode: draft.detected.postalCode,
            country: draft.detected.country,
            additionalInfo: draft.additionalInfo.trim() || null,
            isDefault: draft.isDefault,
        }
        try {
            if (editor.address) {
                await updateRetailClientAddress(
                    token,
                    editor.address.id,
                    payload,
                )
            } else {
                await createRetailClientAddress(token, payload)
            }
            await onSaved()
            onClose()
            notify(
                'success',
                'Address saved',
                'Your delivery address is ready to use.',
            )
        } catch (error) {
            setSaveError(toApiError(error, 'Unable to save address').message)
        } finally {
            setSaving(false)
        }
    }

    const title = readOnly
        ? 'Address location'
        : editor?.address
          ? 'Edit address'
          : 'Add new address'

    return (
        <Dialog
            isOpen={open}
            width={780}
            onClose={onClose}
            onRequestClose={onClose}
            contentClassName="max-h-[calc(100dvh-1.5rem)] overflow-y-auto"
        >
            <div className="p-5 sm:p-6">
                <div className="mb-5 pr-8">
                    <h2 className="text-xl font-semibold text-gray-900">
                        {title}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                        {readOnly
                            ? 'Saved map pin and delivery information.'
                            : 'Search, click the map, or drag the pin to the exact delivery point.'}
                    </p>
                </div>
                {saveError ? (
                    <Alert showIcon type="danger" className="mb-4">
                        {saveError}
                    </Alert>
                ) : null}

                <Form
                    onSubmit={(event) => {
                        event.preventDefault()
                        void save()
                    }}
                >
                    {!readOnly ? (
                        <>
                            <FormItem asterisk label="Address type">
                                <div className="grid grid-cols-2 gap-3">
                                    {(['HOME', 'WORK'] as const).map((type) => (
                                        <button
                                            key={type}
                                            type="button"
                                            className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${draft.addressType === type ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500' : 'border-gray-200 bg-white text-gray-600 hover:border-emerald-300'}`}
                                            onClick={() =>
                                                setDraft((current) => ({
                                                    ...current,
                                                    addressType: type,
                                                }))
                                            }
                                        >
                                            {type === 'HOME' ? 'Home' : 'Work'}
                                        </button>
                                    ))}
                                </div>
                            </FormItem>
                            <FormItem
                                label="Search address or location (optional)"
                                extra="Pin the map directly — search is only a shortcut."
                            >
                                <Input
                                    value={search}
                                    placeholder="Search for a location..."
                                    autoComplete="off"
                                    onChange={(event) =>
                                        setSearch(event.target.value)
                                    }
                                />
                                {searching ? (
                                    <p className="mt-1.5 text-xs text-gray-500">
                                        Searching locations…
                                    </p>
                                ) : null}
                                {results.length > 0 ? (
                                    <div className="relative z-20 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                                        {results.map((place) => (
                                            <button
                                                key={place.id}
                                                type="button"
                                                className="block w-full border-b border-gray-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-emerald-50"
                                                onClick={() =>
                                                    selectPlace(place)
                                                }
                                            >
                                                <span className="block text-sm font-medium text-gray-800">
                                                    {place.label}
                                                </span>
                                                <span className="mt-0.5 block text-xs text-gray-500">
                                                    {place.address}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </FormItem>
                        </>
                    ) : null}

                    <FormItem label="Map">
                        <MarketplaceAddressMap
                            latitude={draft.latitude}
                            longitude={draft.longitude}
                            readOnly={readOnly}
                            onPinChange={(latitude, longitude) =>
                                setDraft((current) => ({
                                    ...current,
                                    latitude,
                                    longitude,
                                }))
                            }
                        />
                        <p className="mt-2 text-xs text-gray-500">
                            {draft.latitude.toFixed(6)},{' '}
                            {draft.longitude.toFixed(6)}
                        </p>
                    </FormItem>

                    <section className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold text-gray-800">
                                Detected address
                            </h3>
                            {reverseLoading ? (
                                <span className="text-xs text-gray-500">
                                    Identifying location…
                                </span>
                            ) : null}
                        </div>
                        {reverseError ? (
                            <Alert showIcon type="warning" className="mt-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span>{reverseError}</span>
                                    {!readOnly ? (
                                        <Button
                                            size="xs"
                                            type="button"
                                            variant="plain"
                                            icon={<HiOutlineRefresh />}
                                            onClick={() =>
                                                setReverseAttempt(
                                                    (value) => value + 1,
                                                )
                                            }
                                        >
                                            Retry
                                        </Button>
                                    ) : null}
                                </div>
                            </Alert>
                        ) : null}
                        {draft.detected.formattedAddress ? (
                            <div className="mt-3 space-y-0.5 text-sm leading-6 text-gray-600">
                                {[
                                    draft.detected.addressLine,
                                    draft.detected.barangayOrNeighborhood,
                                    [
                                        draft.detected.cityOrMunicipality,
                                        draft.detected.provinceOrState,
                                    ]
                                        .filter(Boolean)
                                        .join(', '),
                                    [
                                        draft.detected.postalCode,
                                        draft.detected.country,
                                    ]
                                        .filter(Boolean)
                                        .join(' '),
                                ]
                                    .filter(Boolean)
                                    .map((line) => (
                                        <p key={line}>{line}</p>
                                    ))}
                            </div>
                        ) : (
                            <p className="mt-2 text-sm text-gray-500">
                                No text address found — you can still save. The
                                pinned point is your exact delivery location.
                            </p>
                        )}
                    </section>

                    <FormItem
                        label="Additional address information"
                        className="mt-5"
                    >
                        <textarea
                            value={draft.additionalInfo}
                            disabled={readOnly}
                            rows={3}
                            maxLength={1000}
                            placeholder="House 14, Green Gate, beside ABC Pharmacy"
                            className="input h-auto min-h-24 w-full resize-y py-2.5"
                            onChange={(event) =>
                                setDraft((current) => ({
                                    ...current,
                                    additionalInfo: event.target.value,
                                }))
                            }
                        />
                    </FormItem>

                    {!readOnly ? (
                        <Checkbox
                            checked={draft.isDefault}
                            disabled={editor?.address?.isDefault}
                            checkboxClass="text-emerald-600"
                            onChange={(isDefault) =>
                                setDraft((current) => ({
                                    ...current,
                                    isDefault,
                                }))
                            }
                        >
                            {editor?.address?.isDefault
                                ? 'This is your default address'
                                : 'Set as default address'}
                        </Checkbox>
                    ) : null}

                    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button type="button" variant="plain" onClick={onClose}>
                            Close
                        </Button>
                        {!readOnly ? (
                            <Button
                                type="submit"
                                loading={saving}
                                customColorClass={PRIMARY_BUTTON}
                            >
                                Save address
                            </Button>
                        ) : null}
                    </div>
                </Form>
            </div>
        </Dialog>
    )
}

const MarketplaceAccountPage = () => {
    const router = useRouter()
    const { hydrated, signedInClient } = useMarketplace()
    const token = useMarketplaceClientStore((state) => state.token)
    const isBusy = useMarketplaceClientStore((state) => state.isBusy)
    const updateProfile = useMarketplaceClientStore(
        (state) => state.updateProfile,
    )
    const refreshProfile = useMarketplaceClientStore(
        (state) => state.refreshProfile,
    )
    const logout = useMarketplaceClientStore((state) => state.logout)
    const [firstName, setFirstName] = useState('')
    const [phone, setPhone] = useState('')
    const [profileError, setProfileError] = useState<string | null>(null)
    const [savingProfile, setSavingProfile] = useState(false)
    const [addresses, setAddresses] = useState<RetailClientAddress[]>([])
    const [addressesLoading, setAddressesLoading] = useState(true)
    const [addressesError, setAddressesError] = useState<string | null>(null)
    const [editor, setEditor] = useState<EditorState | null>(null)
    const [deleteTarget, setDeleteTarget] =
        useState<RetailClientAddress | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [defaultingId, setDefaultingId] = useState<string | null>(null)

    const loadAddresses = useCallback(async () => {
        if (!token) return
        setAddressesLoading(true)
        setAddressesError(null)
        try {
            setAddresses(await fetchRetailClientAddresses(token))
        } catch (error) {
            setAddressesError(
                toApiError(error, 'Unable to load saved addresses').message,
            )
        } finally {
            setAddressesLoading(false)
        }
    }, [token])

    useEffect(() => {
        if (!hydrated) return
        if (!signedInClient || !token) {
            router.replace(
                marketplaceAuthHref(
                    MARKETPLACE_SIGN_IN_PATH,
                    MARKETPLACE_ACCOUNT_PATH,
                ),
            )
            return
        }
        setFirstName(signedInClient.firstName || signedInClient.fullName)
        setPhone(signedInClient.phone)
        void loadAddresses()
    }, [hydrated, signedInClient, token, router, loadAddresses])

    const normalizedPhone = normalizePhilippineMobile(phone)
    const phoneError =
        normalizedPhone && !PHILIPPINE_MOBILE.test(normalizedPhone)
            ? 'Enter a valid Philippine mobile number'
            : null
    const firstNameError = !firstName.trim() ? 'First name is required' : null
    const canSaveProfile =
        !firstNameError && !phoneError && !savingProfile && !isBusy

    const saveProfile = async () => {
        if (!canSaveProfile) return
        setSavingProfile(true)
        setProfileError(null)
        try {
            await updateProfile({
                firstName: firstName.trim(),
                ...(normalizedPhone && { phone: normalizedPhone }),
            })
            notify(
                'success',
                'Personal information saved',
                'Your account details have been updated.',
            )
        } catch (error) {
            const message = toApiError(
                error,
                'Unable to save personal information',
            ).message
            setProfileError(message)
            if (/sign in/i.test(message)) logout()
        } finally {
            setSavingProfile(false)
        }
    }

    const deleteAddress = async () => {
        if (!token || !deleteTarget) return
        setDeleting(true)
        try {
            await deleteRetailClientAddress(token, deleteTarget.id)
            setDeleteTarget(null)
            await Promise.all([loadAddresses(), refreshProfile()])
            notify(
                'success',
                'Address deleted',
                'Your saved addresses were updated.',
            )
        } catch (error) {
            setAddressesError(
                toApiError(error, 'Unable to delete address').message,
            )
        } finally {
            setDeleting(false)
        }
    }

    const makeDefault = async (address: RetailClientAddress) => {
        if (!token || address.isDefault) return
        setDefaultingId(address.id)
        try {
            await setRetailClientDefaultAddress(token, address.id)
            await Promise.all([loadAddresses(), refreshProfile()])
            notify(
                'success',
                'Default address updated',
                `${address.addressType === 'HOME' ? 'Home' : 'Work'} is now your default address.`,
            )
        } catch (error) {
            setAddressesError(
                toApiError(error, 'Unable to set default address').message,
            )
        } finally {
            setDefaultingId(null)
        }
    }

    const subtitle = useMemo(
        () =>
            `${addresses.length} saved ${addresses.length === 1 ? 'address' : 'addresses'}`,
        [addresses.length],
    )

    if (!hydrated || !signedInClient || !token) return null

    return (
        <>
            <MarketplaceHeader />
            <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
                <div className="mb-7">
                    <p className="text-sm font-semibold text-emerald-700">
                        My Account
                    </p>
                    <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-900">
                        Welcome,{' '}
                        {signedInClient.firstName || signedInClient.fullName}
                    </h1>
                    <p className="mt-2 text-sm text-gray-500">
                        Keep your contact details and delivery locations ready
                        for faster checkout.
                    </p>
                </div>

                <div className="grid gap-6 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
                    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
                        <div className="mb-5 flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                                <HiOutlineUserCircle className="text-xl" />
                            </span>
                            <div>
                                <h2 className="font-semibold text-gray-900">
                                    Personal information
                                </h2>
                                <p className="text-sm text-gray-500">
                                    Your contact details stay on your account.
                                </p>
                            </div>
                        </div>
                        {profileError ? (
                            <Alert showIcon type="danger" className="mb-4">
                                {profileError}
                            </Alert>
                        ) : null}
                        <Form
                            onSubmit={(event) => {
                                event.preventDefault()
                                void saveProfile()
                            }}
                        >
                            <FormItem
                                asterisk
                                label="First name"
                                invalid={Boolean(firstNameError)}
                                errorMessage={firstNameError ?? undefined}
                            >
                                <Input
                                    value={firstName}
                                    autoComplete="given-name"
                                    onChange={(event) =>
                                        setFirstName(event.target.value)
                                    }
                                />
                            </FormItem>
                            <FormItem label="Email address">
                                <Input
                                    value={signedInClient.email}
                                    disabled
                                    type="email"
                                />
                            </FormItem>
                            <FormItem
                                label="Phone number"
                                invalid={Boolean(phoneError)}
                                errorMessage={phoneError ?? undefined}
                                extra="Add a Philippine mobile number for delivery updates."
                            >
                                <Input
                                    value={phone}
                                    type="tel"
                                    placeholder="+63 917 000 0000"
                                    autoComplete="tel"
                                    onChange={(event) =>
                                        setPhone(event.target.value)
                                    }
                                />
                            </FormItem>
                            <Button
                                type="submit"
                                loading={savingProfile || isBusy}
                                disabled={!canSaveProfile}
                                customColorClass={PRIMARY_BUTTON}
                            >
                                Save changes
                            </Button>
                        </Form>
                    </section>

                    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
                        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="font-semibold text-gray-900">
                                    My addresses
                                </h2>
                                <p className="text-sm text-gray-500">
                                    {subtitle}
                                </p>
                            </div>
                            <Button
                                icon={<HiOutlinePlus />}
                                customColorClass={PRIMARY_BUTTON}
                                onClick={() =>
                                    setEditor({
                                        address: null,
                                        readOnly: false,
                                    })
                                }
                            >
                                Add address
                            </Button>
                        </div>
                        {addressesError ? (
                            <Alert showIcon type="danger" className="mb-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span>{addressesError}</span>
                                    <Button
                                        size="xs"
                                        type="button"
                                        variant="plain"
                                        onClick={() => void loadAddresses()}
                                    >
                                        Retry
                                    </Button>
                                </div>
                            </Alert>
                        ) : null}
                        {addressesLoading ? (
                            <div className="space-y-3">
                                <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
                                <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
                            </div>
                        ) : null}
                        {!addressesLoading && addresses.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 p-6 text-center">
                                <HiOutlineLocationMarker className="mx-auto text-3xl text-emerald-600" />
                                <h3 className="mt-2 font-semibold text-gray-800">
                                    No saved addresses yet
                                </h3>
                                <p className="mt-1 text-sm text-gray-500">
                                    Add a home or work location with an exact
                                    map pin.
                                </p>
                            </div>
                        ) : null}
                        <div className="space-y-3">
                            {addresses.map((address) => (
                                <article
                                    key={address.id}
                                    className="rounded-xl border border-gray-100 bg-gray-50/60 p-4"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-gray-900">
                                                {address.addressType === 'HOME'
                                                    ? 'Home'
                                                    : 'Work'}
                                            </h3>
                                            {address.isDefault ? (
                                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                                                    Default
                                                </span>
                                            ) : null}
                                        </div>
                                        <span className="text-xs text-gray-400">
                                            {address.latitude.toFixed(5)},{' '}
                                            {address.longitude.toFixed(5)}
                                        </span>
                                    </div>
                                    <div className="mt-2 text-sm leading-6 text-gray-600">
                                        {addressLines(address).length ? (
                                            addressLines(address).map(
                                                (line) => (
                                                    <p key={line}>{line}</p>
                                                ),
                                            )
                                        ) : (
                                            <p>
                                                {address.formattedAddress ??
                                                    'Pinned location'}
                                            </p>
                                        )}
                                    </div>
                                    {address.additionalInfo ? (
                                        <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-gray-600">
                                            <span className="font-medium text-gray-800">
                                                Additional information:{' '}
                                            </span>
                                            {address.additionalInfo}
                                        </p>
                                    ) : null}
                                    <div className="mt-4 flex flex-wrap gap-1">
                                        <Button
                                            size="xs"
                                            type="button"
                                            variant="plain"
                                            onClick={() =>
                                                setEditor({
                                                    address,
                                                    readOnly: true,
                                                })
                                            }
                                        >
                                            View on map
                                        </Button>
                                        <Button
                                            size="xs"
                                            type="button"
                                            variant="plain"
                                            icon={<HiOutlinePencil />}
                                            onClick={() =>
                                                setEditor({
                                                    address,
                                                    readOnly: false,
                                                })
                                            }
                                        >
                                            Edit
                                        </Button>
                                        {!address.isDefault ? (
                                            <Button
                                                size="xs"
                                                type="button"
                                                variant="plain"
                                                loading={
                                                    defaultingId === address.id
                                                }
                                                onClick={() =>
                                                    void makeDefault(address)
                                                }
                                            >
                                                Set as default
                                            </Button>
                                        ) : null}
                                        <Button
                                            size="xs"
                                            type="button"
                                            variant="plain"
                                            className="!text-red-600 hover:!text-red-700"
                                            icon={<HiOutlineTrash />}
                                            onClick={() =>
                                                setDeleteTarget(address)
                                            }
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                </div>
            </main>

            <AddressDialog
                editor={editor}
                token={token}
                onClose={() => setEditor(null)}
                onSaved={async () => {
                    await Promise.all([loadAddresses(), refreshProfile()])
                }}
            />
            <ConfirmDialog
                isOpen={deleteTarget !== null}
                type="danger"
                title="Delete address?"
                confirmText="Delete"
                cancelText="Cancel"
                confirmButtonProps={{
                    customColorClass: () =>
                        'bg-red-500 hover:bg-red-600 text-white',
                    loading: deleting,
                    disabled: deleting,
                }}
                onClose={() => setDeleteTarget(null)}
                onRequestClose={() => setDeleteTarget(null)}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={() => void deleteAddress()}
            >
                <p>
                    Are you sure you want to remove this address?{' '}
                    {deleteTarget?.isDefault && addresses.length > 1
                        ? 'Another saved address will become your default.'
                        : ''}
                </p>
            </ConfirmDialog>
        </>
    )
}

export default MarketplaceAccountPage
