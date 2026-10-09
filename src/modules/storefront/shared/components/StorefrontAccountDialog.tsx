'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { z } from 'zod'
import { HiOutlineUserCircle } from 'react-icons/hi'
import FormDialog from '@/components/shared/FormDialog'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import PasswordInput from '@/components/shared/PasswordInput'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Tabs from '@/components/ui/Tabs'
import { Form, FormItem } from '@/components/ui/Form'
import { toApiError } from '@/modules/sd/services/apiError'
import type { SalesOrderShippingDetails } from '@/types/storefront/retail'
import type { createStorefrontClientStore } from '@/modules/storefront/shared/store/createStorefrontClientStore'
import StorefrontAddressBook from '@/modules/storefront/shared/components/StorefrontAddressBook'

type Mode = 'login' | 'register' | 'profile'
type FormState = SalesOrderShippingDetails & { password: string }
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
    /** Extra classes for the Sign in / Create account tabs. */
    accentTabClass?: string
    /** Extra classes for the dialog header band. */
    accentHeaderClass?: string
    /** Extra classes for inputs, e.g. focus ring colour. */
    accentInputClass?: string
    /** Extra classes for text links inside the account dialog. */
    accentTextClass?: string
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
    password: '',
}

const required = (label: string) =>
    z.string().trim().min(1, `${label} is required`)

const deliverySchema = {
    fullName: required('Full name'),
    phone: required('Mobile number'),
    addressLine1: required('Address'),
    city: required('City'),
    region: required('Region'),
    postalCode: required('Postal code'),
}

const SCHEMAS: Record<Mode, z.ZodType> = {
    login: z.object({
        email: z.email('Enter a valid email'),
        password: z.string().min(1, 'Password is required'),
    }),
    register: z.object({
        ...deliverySchema,
        email: z.email('Enter a valid email'),
        password: z.string().min(6, 'At least 6 characters'),
    }),
    profile: z.object(deliverySchema),
}

const DELIVERY_FIELDS: {
    key: Exclude<FieldKey, 'email' | 'password' | 'country'>
    label: string
    placeholder: string
    wide?: boolean
    type?: string
}[] = [
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
        label: 'Delivery address',
        placeholder: 'House no., street, barangay',
        wide: true,
    },
    { key: 'city', label: 'City', placeholder: 'Quezon City' },
    { key: 'region', label: 'Region / Province', placeholder: 'Metro Manila' },
    { key: 'postalCode', label: 'Postal code', placeholder: '1100' },
]

const CONFIRM_COPY: Record<Mode, { title: string; confirm: string }> = {
    login: { title: 'Sign in?', confirm: 'Sign in' },
    register: { title: 'Create account?', confirm: 'Create account' },
    profile: { title: 'Save changes?', confirm: 'Save' },
}

const StorefrontAccountDialog = ({
    useClientStore,
    storeName,
    accentButtonClass,
    accentIconClass,
    accentTabClass,
    accentHeaderClass,
    accentInputClass,
    accentTextClass = 'text-emerald-700 hover:!text-emerald-800',
    formId,
}: StorefrontAccountDialogProps) => {
    const client = useClientStore((s) => s.client)
    const isOpen = useClientStore((s) => s.isLoginOpen)
    const isBusy = useClientStore((s) => s.isBusy)
    const closeLogin = useClientStore((s) => s.closeLogin)
    const login = useClientStore((s) => s.login)
    const register = useClientStore((s) => s.register)
    const updateProfile = useClientStore((s) => s.updateProfile)
    const logout = useClientStore((s) => s.logout)

    const [mode, setMode] = useState<Mode>('login')
    const [form, setForm] = useState<FormState>(EMPTY_FORM)
    const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({})
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [confirmSubmit, setConfirmSubmit] = useState(false)
    const [confirmLogout, setConfirmLogout] = useState(false)

    useEffect(() => {
        if (!isOpen) return
        setErrors({})
        setSubmitError(null)
        if (client) {
            setMode('profile')
            setForm({ ...EMPTY_FORM, ...client, password: '' })
        } else {
            setMode('login')
            setForm(EMPTY_FORM)
        }
    }, [isOpen, client])

    const update = (key: FieldKey, value: string) =>
        setForm((prev) => ({ ...prev, [key]: value }))

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault()
        setSubmitError(null)
        const result = SCHEMAS[mode].safeParse(form)
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
        const trimmed = Object.fromEntries(
            Object.entries(form).map(([k, v]) => [
                k,
                k === 'password' ? v : v.trim(),
            ]),
        ) as FormState
        try {
            if (mode === 'login') {
                await login({
                    email: trimmed.email,
                    password: trimmed.password,
                })
            } else if (mode === 'register') {
                await register({ ...trimmed, country: trimmed.country || 'PH' })
            } else {
                const {
                    email: _email,
                    password: _password,
                    ...profile
                } = trimmed
                await updateProfile(profile)
            }
        } catch (error) {
            setSubmitError(
                toApiError(
                    error,
                    mode === 'login'
                        ? 'Unable to sign in'
                        : mode === 'register'
                          ? 'Unable to create account'
                          : 'Unable to save changes',
                ).message,
            )
        }
    }

    const field = (
        key: FieldKey,
        label: string,
        placeholder: string,
        type = 'text',
        disabled = false,
    ) => (
        <FormItem
            label={label}
            asterisk={!disabled}
            invalid={Boolean(errors[key])}
            errorMessage={errors[key]}
        >
            {type === 'password' ? (
                <PasswordInput
                    value={form[key]}
                    placeholder={placeholder}
                    disabled={disabled}
                    autoComplete={
                        mode === 'register'
                            ? 'new-password'
                            : 'current-password'
                    }
                    className={accentInputClass}
                    onChange={(e) => update(key, e.target.value)}
                />
            ) : (
                <Input
                    type={type}
                    value={form[key]}
                    placeholder={placeholder}
                    disabled={disabled}
                    className={accentInputClass}
                    onChange={(e) => update(key, e.target.value)}
                />
            )}
        </FormItem>
    )

    return (
        <>
            <FormDialog
                isOpen={isOpen}
                size="md"
                title={
                    mode === 'login'
                        ? 'Welcome back'
                        : mode === 'register'
                          ? 'Create your account'
                          : 'Your account'
                }
                description={
                    mode === 'profile'
                        ? 'Your saved delivery details are used at checkout.'
                        : 'Sign in to check out faster with saved delivery details.'
                }
                icon={<HiOutlineUserCircle />}
                iconClassName={accentIconClass}
                headerClassName={accentHeaderClass}
                onClose={closeLogin}
                headerExtra={
                    client ? null : (
                        <Tabs
                            value={mode}
                            onChange={(value) => {
                                setMode(value as Mode)
                                setErrors({})
                                setSubmitError(null)
                            }}
                        >
                            <Tabs.TabList>
                                <Tabs.TabNav
                                    value="login"
                                    className={accentTabClass}
                                >
                                    Sign in
                                </Tabs.TabNav>
                                <Tabs.TabNav
                                    value="register"
                                    className={accentTabClass}
                                >
                                    Create account
                                </Tabs.TabNav>
                            </Tabs.TabList>
                        </Tabs>
                    )
                }
                footerClassName="!justify-between"
                footer={
                    <>
                        {client ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="plain"
                                disabled={isBusy}
                                onClick={() => setConfirmLogout(true)}
                            >
                                Sign out
                            </Button>
                        ) : (
                            <span />
                        )}
                        <Button
                            size="sm"
                            variant="solid"
                            type="submit"
                            form={formId}
                            loading={isBusy}
                            customColorClass={accentButtonClass}
                        >
                            {CONFIRM_COPY[mode].confirm}
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
                    {mode === 'login' ? (
                        <>
                            {field(
                                'email',
                                'Email',
                                'you@example.com',
                                'email',
                            )}
                            {field(
                                'password',
                                'Password',
                                '••••••••',
                                'password',
                            )}
                        </>
                    ) : (
                        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                                {field(
                                    'email',
                                    'Email',
                                    'you@example.com',
                                    'email',
                                    mode === 'profile',
                                )}
                            </div>
                            {mode === 'register' ? (
                                <div className="sm:col-span-2">
                                    {field(
                                        'password',
                                        'Password',
                                        'Min. 6 characters',
                                        'password',
                                    )}
                                </div>
                            ) : null}
                            {DELIVERY_FIELDS.map((f) => (
                                <div
                                    key={f.key}
                                    className={
                                        f.wide ? 'sm:col-span-2' : undefined
                                    }
                                >
                                    {field(
                                        f.key,
                                        f.label,
                                        f.placeholder,
                                        f.type,
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </Form>
                {mode === 'profile' && client ? (
                    <StorefrontAddressBook
                        clientId={client.customerId}
                        accentButtonClass={accentButtonClass}
                        accentInputClass={accentInputClass}
                        accentTextClass={accentTextClass}
                    />
                ) : null}
            </FormDialog>

            <ConfirmDialog
                isOpen={confirmSubmit}
                type="info"
                title={CONFIRM_COPY[mode].title}
                confirmText={CONFIRM_COPY[mode].confirm}
                cancelText="Cancel"
                confirmButtonProps={{ customColorClass: accentButtonClass }}
                onClose={() => setConfirmSubmit(false)}
                onRequestClose={() => setConfirmSubmit(false)}
                onCancel={() => setConfirmSubmit(false)}
                onConfirm={() => void runConfirmed()}
            >
                <p>
                    {mode === 'login'
                        ? `Sign in as ${form.email.trim()}?`
                        : mode === 'register'
                          ? `Create a ${storeName} account for ${form.email.trim()} with this delivery address?`
                          : 'Update the delivery details saved on your account?'}
                </p>
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
