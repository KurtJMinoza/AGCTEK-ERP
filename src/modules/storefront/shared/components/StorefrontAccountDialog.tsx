'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { z } from 'zod'
import { HiOutlineUserCircle } from 'react-icons/hi'
import FormDialog from '@/components/shared/FormDialog'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { Form, FormItem } from '@/components/ui/Form'
import { toApiError } from '@/modules/sd/services/apiError'
import type { SalesOrderShippingDetails } from '@/types/storefront/retail'
import type { createStorefrontClientStore } from '@/modules/storefront/shared/store/createStorefrontClientStore'
import { DELIVERY_FIELDS, deliverySchema } from './storefrontAccountFields'

type FormState = SalesOrderShippingDetails
type FieldKey = keyof FormState

export type StorefrontAccountDialogProps = {
    /** Session store for this storefront (see `createStorefrontClientStore`). */
    useClientStore: ReturnType<typeof createStorefrontClientStore>
    /** Shown in confirmations, e.g. "LPG Store". */
    storeName: string
    /** Accent class for primary buttons. */
    accentButtonClass: () => string
    /** Icon avatar colours; defaults to the ERP primary tint. */
    accentIconClass?: string
    /** Extra classes for the dialog header band. */
    accentHeaderClass?: string
    /** Extra classes for inputs, e.g. focus ring colour. */
    accentInputClass?: string
    formId: string
}

const EMPTY_FORM: FormState = {
    fullName: '',
    email: '',
    phone: '',
    addressLine1: '',
    city: '',
    region: '',
    postalCode: '',
    country: 'PH',
}

const PROFILE_SCHEMA = z.object(deliverySchema)

/** Signed-in shopper's profile: delivery details used at checkout, and sign-out. */
const StorefrontAccountDialog = ({
    useClientStore,
    storeName,
    accentButtonClass,
    accentIconClass,
    accentHeaderClass,
    accentInputClass,
    formId,
}: StorefrontAccountDialogProps) => {
    const client = useClientStore((s) => s.client)
    const isOpen = useClientStore((s) => s.isAccountOpen)
    const isBusy = useClientStore((s) => s.isBusy)
    const closeAccount = useClientStore((s) => s.closeAccount)
    const updateProfile = useClientStore((s) => s.updateProfile)
    const logout = useClientStore((s) => s.logout)

    const [form, setForm] = useState<FormState>(EMPTY_FORM)
    const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({})
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [confirmSubmit, setConfirmSubmit] = useState(false)
    const [confirmLogout, setConfirmLogout] = useState(false)

    useEffect(() => {
        if (!isOpen || !client) return
        setErrors({})
        setSubmitError(null)
        setForm({ ...EMPTY_FORM, ...client })
    }, [isOpen, client])

    const update = (key: FieldKey, value: string) =>
        setForm((prev) => ({ ...prev, [key]: value }))

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault()
        setSubmitError(null)
        const result = PROFILE_SCHEMA.safeParse(form)
        if (!result.success) {
            const next: Partial<Record<FieldKey, string>> = {}
            for (const issue of result.error.issues) {
                const key = issue.path[0] as FieldKey
                next[key] ??= issue.message
            }
            setErrors(next)
            return
        }
        setErrors({})
        setConfirmSubmit(true)
    }

    const runConfirmed = async () => {
        setConfirmSubmit(false)
        const { email: _email, ...profile } = form
        try {
            await updateProfile(
                Object.fromEntries(
                    Object.entries(profile).map(([k, v]) => [k, v.trim()]),
                ),
            )
        } catch (error) {
            setSubmitError(toApiError(error, 'Unable to save changes').message)
        }
    }

    return (
        <>
            <FormDialog
                isOpen={isOpen && client !== null}
                size="md"
                title="Your account"
                description="Your saved delivery details are used at checkout."
                icon={<HiOutlineUserCircle />}
                iconClassName={accentIconClass}
                headerClassName={accentHeaderClass}
                onClose={closeAccount}
                footerClassName="!justify-between"
                footer={
                    <>
                        <Button
                            type="button"
                            size="sm"
                            variant="plain"
                            disabled={isBusy}
                            onClick={() => setConfirmLogout(true)}
                        >
                            Sign out
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            type="submit"
                            form={formId}
                            loading={isBusy}
                            customColorClass={accentButtonClass}
                        >
                            Save
                        </Button>
                    </>
                }
            >
                <Form id={formId} onSubmit={handleSubmit}>
                    {submitError ? (
                        <Alert showIcon type="danger" className="mb-4">
                            {submitError}
                        </Alert>
                    ) : null}
                    <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <FormItem label="Email">
                                <Input
                                    type="email"
                                    value={form.email}
                                    disabled
                                    className={accentInputClass}
                                />
                            </FormItem>
                        </div>
                        {DELIVERY_FIELDS.map((f) => (
                            <div
                                key={f.key}
                                className={f.wide ? 'sm:col-span-2' : undefined}
                            >
                                <FormItem
                                    asterisk
                                    label={f.label}
                                    invalid={Boolean(errors[f.key])}
                                    errorMessage={errors[f.key]}
                                >
                                    <Input
                                        type={f.type ?? 'text'}
                                        value={form[f.key]}
                                        placeholder={f.placeholder}
                                        autoComplete={f.autoComplete}
                                        className={accentInputClass}
                                        onChange={(e) =>
                                            update(f.key, e.target.value)
                                        }
                                    />
                                </FormItem>
                            </div>
                        ))}
                    </div>
                </Form>
            </FormDialog>

            <ConfirmDialog
                isOpen={confirmSubmit}
                type="info"
                title="Save changes?"
                confirmText="Save"
                cancelText="Cancel"
                confirmButtonProps={{ customColorClass: accentButtonClass }}
                onClose={() => setConfirmSubmit(false)}
                onRequestClose={() => setConfirmSubmit(false)}
                onCancel={() => setConfirmSubmit(false)}
                onConfirm={() => void runConfirmed()}
            >
                <p>Update the delivery details saved on your account?</p>
            </ConfirmDialog>

            <ConfirmDialog
                isOpen={confirmLogout}
                type="danger"
                title="Sign out?"
                confirmText="Sign out"
                cancelText="Stay signed in"
                confirmButtonProps={{
                    customColorClass: () =>
                        'bg-red-500 hover:bg-red-600 text-white',
                }}
                onClose={() => setConfirmLogout(false)}
                onRequestClose={() => setConfirmLogout(false)}
                onCancel={() => setConfirmLogout(false)}
                onConfirm={() => {
                    setConfirmLogout(false)
                    logout()
                }}
            >
                <p>Sign out of your {storeName} account on this device?</p>
            </ConfirmDialog>
        </>
    )
}

export default StorefrontAccountDialog
