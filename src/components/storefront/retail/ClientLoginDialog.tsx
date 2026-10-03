'use client'

import {
    useEffect,
    useState,
    type ChangeEvent,
    type FormEvent,
} from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import ConfirmDialog from '@/components/storefront/retail/StorefrontConfirmDialog'
import classNames from '@/utils/classNames'
import { useRetailClientStore } from '@/modules/storefront/retail/store/retailClientStore'
import type { SalesOrderShippingDetails } from '@/types/storefront/retail'
import axios from 'axios'

type Mode = 'login' | 'register' | 'profile'

type FormState = SalesOrderShippingDetails & {
    password: string
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

const fieldClass =
    'rounded-none border-brand-line bg-brand-canvas font-storefront-body text-sm text-brand-ink placeholder:text-brand-ink/35 focus:border-brand-gold focus:ring-0'

const labelClass =
    'mb-1.5 block font-storefront-heading text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-ink/55'

function apiErrorMessage(error: unknown, fallback: string) {
    if (axios.isAxiosError(error)) {
        const data = error.response?.data as
            | { message?: string | string[] }
            | undefined
        const message = data?.message
        if (Array.isArray(message)) return message.join(' ')
        if (typeof message === 'string' && message.trim()) return message
    }
    if (error instanceof Error && error.message) return error.message
    return fallback
}

export default function ClientLoginDialog() {
    const {
        client,
        isLoginOpen,
        isBusy,
        closeLogin,
        register,
        login,
        updateProfile,
        logout,
    } = useRetailClientStore()

    const [mode, setMode] = useState<Mode>('login')
    const [form, setForm] = useState<FormState>(EMPTY_FORM)
    const [error, setError] = useState<string | null>(null)
    const [confirmSubmit, setConfirmSubmit] = useState(false)
    const [confirmLogout, setConfirmLogout] = useState(false)

    useEffect(() => {
        if (!isLoginOpen) return
        setError(null)
        if (client) {
            setMode('profile')
            setForm({
                fullName: client.fullName,
                email: client.email,
                phone: client.phone,
                addressLine1: client.addressLine1,
                city: client.city,
                region: client.region,
                postalCode: client.postalCode,
                country: client.country || 'PH',
                password: '',
            })
            return
        }
        setMode('login')
        setForm(EMPTY_FORM)
    }, [client, isLoginOpen])

    const update =
        (key: keyof FormState) => (event: ChangeEvent<HTMLInputElement>) => {
            setForm((prev) => ({ ...prev, [key]: event.target.value }))
        }

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault()
        setError(null)

        if (mode === 'login') {
            if (!form.email.trim() || !form.password) {
                setError('Enter your email and password.')
                return
            }
        } else if (mode === 'register') {
            const required: Array<keyof FormState> = [
                'fullName',
                'email',
                'password',
                'phone',
                'addressLine1',
                'city',
                'region',
                'postalCode',
            ]
            const missing = required.find((key) => !String(form[key]).trim())
            if (missing) {
                setError('Please complete your account and delivery details.')
                return
            }
            if (form.password.length < 6) {
                setError('Password must be at least 6 characters.')
                return
            }
        } else {
            const required: Array<keyof FormState> = [
                'fullName',
                'phone',
                'addressLine1',
                'city',
                'region',
                'postalCode',
            ]
            const missing = required.find((key) => !String(form[key]).trim())
            if (missing) {
                setError('Please complete your delivery details.')
                return
            }
        }

        setConfirmSubmit(true)
    }

    const runSubmitConfirmed = async () => {
        setConfirmSubmit(false)
        setError(null)
        try {
            if (mode === 'login') {
                await login({
                    email: form.email.trim(),
                    password: form.password,
                })
                return
            }

            if (mode === 'register') {
                await register({
                    fullName: form.fullName.trim(),
                    email: form.email.trim(),
                    password: form.password,
                    phone: form.phone.trim(),
                    addressLine1: form.addressLine1.trim(),
                    city: form.city.trim(),
                    region: form.region.trim(),
                    postalCode: form.postalCode.trim(),
                    country: form.country.trim() || 'PH',
                })
                return
            }

            await updateProfile({
                fullName: form.fullName.trim(),
                phone: form.phone.trim(),
                addressLine1: form.addressLine1.trim(),
                city: form.city.trim(),
                region: form.region.trim(),
                postalCode: form.postalCode.trim(),
                country: form.country.trim() || 'PH',
            })
        } catch (err) {
            setError(
                apiErrorMessage(
                    err,
                    mode === 'login'
                        ? 'Unable to sign in.'
                        : mode === 'register'
                          ? 'Unable to create account.'
                          : 'Unable to update profile.',
                ),
            )
        }
    }

    const title =
        mode === 'login'
            ? 'Welcome back'
            : mode === 'register'
              ? 'Create your account'
              : 'Your account'

    const subtitle =
        mode === 'login'
            ? 'Sign in to restore your saved bag and delivery details.'
            : mode === 'register'
              ? 'Save your account so your cart follows you every visit.'
              : 'Update delivery details saved to your account.'

    return (
        <>
        <Dialog
            isOpen={isLoginOpen}
            onClose={closeLogin}
            width={520}
            contentClassName="rounded-none border border-brand-line bg-brand-canvas p-0 shadow-[0_24px_80px_rgba(10,42,32,0.18)]"
        >
            <form
                onSubmit={handleSubmit}
                className="flex max-h-[min(90dvh,760px)] flex-col"
            >
                <div className="border-b border-brand-line bg-brand-deep px-7 py-6 pr-14">
                    <p className="font-storefront-heading text-[10px] font-semibold uppercase tracking-[0.32em] text-brand-gold">
                        Client account
                    </p>
                    <h2 className="mt-2 font-storefront-heading text-xl font-semibold uppercase tracking-[0.12em] text-brand-gold-soft">
                        {title}
                    </h2>
                    <p className="mt-2 font-storefront-body text-sm text-brand-gold-soft/70">
                        {subtitle}
                    </p>
                </div>

                {!client ? (
                    <div className="flex border-b border-brand-line">
                        <button
                            type="button"
                            onClick={() => {
                                setMode('login')
                                setError(null)
                            }}
                            className={classNames(
                                'flex-1 py-3 font-storefront-heading text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors',
                                mode === 'login'
                                    ? 'bg-brand-sage text-brand-gold'
                                    : 'text-brand-ink/45 hover:text-brand-ink',
                            )}
                        >
                            Sign in
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setMode('register')
                                setError(null)
                            }}
                            className={classNames(
                                'flex-1 py-3 font-storefront-heading text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors',
                                mode === 'register'
                                    ? 'bg-brand-sage text-brand-gold'
                                    : 'text-brand-ink/45 hover:text-brand-ink',
                            )}
                        >
                            Create account
                        </button>
                    </div>
                ) : null}

                <div className="space-y-5 overflow-y-auto px-7 py-6">
                    {mode === 'login' ? (
                        <div className="grid gap-4">
                            <div>
                                <label className={labelClass} htmlFor="client-email">
                                    Email
                                </label>
                                <Input
                                    id="client-email"
                                    type="email"
                                    value={form.email}
                                    onChange={update('email')}
                                    placeholder="you@email.com"
                                    className={fieldClass}
                                    autoComplete="email"
                                />
                            </div>
                            <div>
                                <label
                                    className={labelClass}
                                    htmlFor="client-password"
                                >
                                    Password
                                </label>
                                <Input
                                    id="client-password"
                                    type="password"
                                    value={form.password}
                                    onChange={update('password')}
                                    placeholder="••••••••"
                                    className={fieldClass}
                                    autoComplete="current-password"
                                />
                            </div>
                        </div>
                    ) : (
                        <>
                            <div>
                                <p className="mb-3 font-storefront-heading text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-gold">
                                    Account
                                </p>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="sm:col-span-2">
                                        <label
                                            className={labelClass}
                                            htmlFor="client-name"
                                        >
                                            Full name
                                        </label>
                                        <Input
                                            id="client-name"
                                            value={form.fullName}
                                            onChange={update('fullName')}
                                            placeholder="Jane Doe"
                                            className={fieldClass}
                                            autoComplete="name"
                                        />
                                    </div>
                                    <div>
                                        <label
                                            className={labelClass}
                                            htmlFor="client-email-reg"
                                        >
                                            Email
                                        </label>
                                        <Input
                                            id="client-email-reg"
                                            type="email"
                                            value={form.email}
                                            onChange={update('email')}
                                            placeholder="you@email.com"
                                            className={fieldClass}
                                            autoComplete="email"
                                            disabled={mode === 'profile'}
                                        />
                                    </div>
                                    {mode === 'register' ? (
                                        <div>
                                            <label
                                                className={labelClass}
                                                htmlFor="client-password-reg"
                                            >
                                                Password
                                            </label>
                                            <Input
                                                id="client-password-reg"
                                                type="password"
                                                value={form.password}
                                                onChange={update('password')}
                                                placeholder="Min. 6 characters"
                                                className={fieldClass}
                                                autoComplete="new-password"
                                            />
                                        </div>
                                    ) : (
                                        <div>
                                            <label
                                                className={labelClass}
                                                htmlFor="client-phone"
                                            >
                                                Phone
                                            </label>
                                            <Input
                                                id="client-phone"
                                                type="tel"
                                                value={form.phone}
                                                onChange={update('phone')}
                                                placeholder="+63 900 000 0000"
                                                className={fieldClass}
                                                autoComplete="tel"
                                            />
                                        </div>
                                    )}
                                    {mode === 'register' ? (
                                        <div className="sm:col-span-2">
                                            <label
                                                className={labelClass}
                                                htmlFor="client-phone-reg"
                                            >
                                                Phone
                                            </label>
                                            <Input
                                                id="client-phone-reg"
                                                type="tel"
                                                value={form.phone}
                                                onChange={update('phone')}
                                                placeholder="+63 900 000 0000"
                                                className={fieldClass}
                                                autoComplete="tel"
                                            />
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            <div>
                                <p className="mb-3 font-storefront-heading text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-gold">
                                    Delivery location
                                </p>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="sm:col-span-2">
                                        <label
                                            className={labelClass}
                                            htmlFor="client-address"
                                        >
                                            Street address
                                        </label>
                                        <Input
                                            id="client-address"
                                            value={form.addressLine1}
                                            onChange={update('addressLine1')}
                                            placeholder="123 Retail Avenue, Unit 4"
                                            className={fieldClass}
                                            autoComplete="street-address"
                                        />
                                    </div>
                                    <div>
                                        <label
                                            className={labelClass}
                                            htmlFor="client-city"
                                        >
                                            City
                                        </label>
                                        <Input
                                            id="client-city"
                                            value={form.city}
                                            onChange={update('city')}
                                            placeholder="Makati"
                                            className={fieldClass}
                                            autoComplete="address-level2"
                                        />
                                    </div>
                                    <div>
                                        <label
                                            className={labelClass}
                                            htmlFor="client-region"
                                        >
                                            Province / Region
                                        </label>
                                        <Input
                                            id="client-region"
                                            value={form.region}
                                            onChange={update('region')}
                                            placeholder="NCR"
                                            className={fieldClass}
                                            autoComplete="address-level1"
                                        />
                                    </div>
                                    <div>
                                        <label
                                            className={labelClass}
                                            htmlFor="client-postal"
                                        >
                                            Postal code
                                        </label>
                                        <Input
                                            id="client-postal"
                                            value={form.postalCode}
                                            onChange={update('postalCode')}
                                            placeholder="1200"
                                            className={fieldClass}
                                            autoComplete="postal-code"
                                        />
                                    </div>
                                    <div>
                                        <label
                                            className={labelClass}
                                            htmlFor="client-country"
                                        >
                                            Country
                                        </label>
                                        <Input
                                            id="client-country"
                                            value={form.country}
                                            onChange={update('country')}
                                            placeholder="PH"
                                            className={fieldClass}
                                            autoComplete="country-name"
                                        />
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {error ? (
                        <p className="font-storefront-body text-xs text-red-700">
                            {error}
                        </p>
                    ) : null}
                </div>

                <div className="flex flex-col gap-3 border-t border-brand-line px-7 py-5 sm:flex-row sm:items-center sm:justify-between">
                    {client ? (
                        <button
                            type="button"
                            onClick={() => setConfirmLogout(true)}
                            className="font-storefront-heading text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-ink/45 transition-colors hover:text-brand-ink"
                        >
                            Sign out
                        </button>
                    ) : (
                        <span className="font-storefront-body text-xs text-brand-ink/40">
                            Cart is saved to your account
                        </span>
                    )}
                    <Button
                        type="submit"
                        loading={isBusy}
                        variant="solid"
                        customColorClass={() =>
                            classNames(
                                'h-11 rounded-none border-0 bg-brand-ink px-8 font-storefront-heading text-xs font-bold uppercase tracking-[0.2em] text-brand-gold-soft hover:bg-brand-deep',
                            )
                        }
                    >
                        {mode === 'login'
                            ? 'Sign in'
                            : mode === 'register'
                              ? 'Create account'
                              : 'Save changes'}
                    </Button>
                </div>
            </form>
        </Dialog>

            <ConfirmDialog
                isOpen={confirmSubmit}
                tone={mode === 'login' ? 'default' : 'caution'}
                title={
                    mode === 'login'
                        ? 'Sign in?'
                        : mode === 'register'
                          ? 'Create account?'
                          : 'Save changes?'
                }
                confirmText={
                    mode === 'login'
                        ? 'Sign in'
                        : mode === 'register'
                          ? 'Create account'
                          : 'Save'
                }
                cancelText="Cancel"
                loading={isBusy}
                onCancel={() => setConfirmSubmit(false)}
                onConfirm={() => {
                    void runSubmitConfirmed()
                }}
            >
                <p>
                    {mode === 'login'
                        ? `Sign in as ${form.email.trim()} and restore your saved bag.`
                        : mode === 'register'
                          ? `Create an AWIC account for ${form.email.trim()} with this delivery location.`
                          : 'Update your saved delivery details on this account.'}
                </p>
            </ConfirmDialog>

            <ConfirmDialog
                isOpen={confirmLogout}
                tone="danger"
                title="Sign out?"
                confirmText="Sign out"
                cancelText="Stay signed in"
                onCancel={() => setConfirmLogout(false)}
                onConfirm={() => {
                    setConfirmLogout(false)
                    logout()
                    setForm(EMPTY_FORM)
                }}
            >
                <p>Sign out of your client account on this device?</p>
            </ConfirmDialog>
        </>
    )
}
