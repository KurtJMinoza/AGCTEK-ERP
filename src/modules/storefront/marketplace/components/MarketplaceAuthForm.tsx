'use client'

import { useMemo, useState } from 'react'
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FcGoogle } from 'react-icons/fc'
import {
    HiOutlineCheckCircle,
    HiOutlineDeviceMobile,
    HiOutlineInformationCircle,
    HiOutlineMail,
    HiOutlineUser,
    HiOutlineUserCircle,
} from 'react-icons/hi'
import PasswordInput from '@/components/shared/PasswordInput'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import { Form, FormItem } from '@/components/ui/Form'
import Input from '@/components/ui/Input'
import Notification from '@/components/ui/Notification'
import Tabs from '@/components/ui/Tabs'
import toast from '@/components/ui/toast'
import { toApiError } from '@/modules/sd/services/apiError'
import { normalizePhilippineMobile } from '@/modules/storefront/shared/components/storefrontAccountFields'
import { PRIMARY_BUTTON } from '../marketplaceUi'
import { useMarketplaceClientStore } from '../store/useMarketplaceClientStore'

const PASSWORD_MIN = 8

export type MarketplaceAuthMode = 'sign-in' | 'sign-up'

/** Mobile number is the default; email is the alternative (and the only channel the API supports today). */
type AuthChannel = 'mobile' | 'email'

/** Digits after +63, e.g. "0917 123 4567" or "+63 917…" → "9171234567". */
const localMobileDigits = (value: string) =>
    normalizePhilippineMobile(value).replace(/^(?:\+?63|0)/, '')

const optional = z.string()

const buildSchema = (mode: MarketplaceAuthMode, channel: AuthChannel) =>
    z.object({
        email:
            channel === 'email'
                ? z
                      .string()
                      .trim()
                      .min(1, 'Email is required')
                      .email('Enter a valid email address')
                : optional,
        mobile:
            channel === 'mobile'
                ? z
                      .string()
                      .trim()
                      .min(1, 'Mobile number is required')
                      .refine(
                          (value) => /^9\d{9}$/.test(localMobileDigits(value)),
                          'Enter a valid mobile number, e.g. 917 123 4567',
                      )
                : optional,
        firstName:
            mode === 'sign-up'
                ? z
                      .string()
                      .trim()
                      .min(1, 'First name is required')
                      .max(120, 'First name must be 120 characters or fewer')
                : optional,
        password:
            channel === 'mobile'
                ? optional
                : mode === 'sign-up'
                  ? z
                        .string()
                        .min(
                            PASSWORD_MIN,
                            `Use at least ${PASSWORD_MIN} characters`,
                        )
                        .regex(/[A-Za-z]/, 'Include at least one letter')
                        .regex(/\d/, 'Include at least one number')
                  : z.string().min(1, 'Password is required'),
    })

type AuthValues = {
    email: string
    mobile: string
    firstName: string
    password: string
}

const EMPTY_VALUES: AuthValues = {
    email: '',
    mobile: '',
    firstName: '',
    password: '',
}

const COPY: Record<
    MarketplaceAuthMode,
    { title: string; subtitle: string; action: string }
> = {
    'sign-in': {
        title: 'Welcome back',
        subtitle: 'Sign in to check out faster with saved delivery details.',
        action: 'Sign in',
    },
    'sign-up': {
        title: 'Create account',
        subtitle:
            'Create your Amalgated Shop account in a few seconds. Delivery details can be added later in My Account.',
        action: 'Create account',
    },
}

const TAB_CLASS =
    'hover:!text-shop-700 aria-selected:!border-shop-600 aria-selected:!text-shop-700'

const FieldState = ({ valid, label }: { valid: boolean; label: string }) =>
    valid ? (
        <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-shop-700">
            <HiOutlineCheckCircle className="text-sm" aria-hidden />
            {label}
        </span>
    ) : null

const PasswordChecklist = ({ password }: { password: string }) => {
    const requirements = [
        {
            label: `${PASSWORD_MIN}+ characters`,
            met: password.length >= PASSWORD_MIN,
        },
        { label: 'One letter', met: /[A-Za-z]/.test(password) },
        { label: 'One number', met: /\d/.test(password) },
    ]

    return (
        <div className="-mt-2 mb-2 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                <HiOutlineInformationCircle className="text-sm" aria-hidden />
                Choose a strong password
            </p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
                {requirements.map(({ label, met }) => (
                    <span
                        key={label}
                        className={
                            met
                                ? 'inline-flex items-center gap-1 text-xs font-medium text-shop-700'
                                : 'inline-flex items-center gap-1 text-xs text-gray-400'
                        }
                    >
                        <HiOutlineCheckCircle
                            className={met ? 'text-shop-600' : 'text-gray-300'}
                            aria-hidden
                        />
                        {label}
                    </span>
                ))}
            </div>
        </div>
    )
}

const OrDivider = () => (
    <div className="my-6 flex items-center gap-3" role="separator">
        <span className="h-px flex-1 bg-gray-200" />
        <span className="text-xs font-medium tracking-wider text-gray-400">
            OR
        </span>
        <span className="h-px flex-1 bg-gray-200" />
    </div>
)

const notifyGoogleUnavailable = () =>
    toast.push(
        <Notification type="info" title="Google sign-in" closable>
            Continue with Google is not available yet. Use your mobile number or
            email for now.
        </Notification>,
        { placement: 'top-end' },
    )

type AuthPanelProps = {
    mode: MarketplaceAuthMode
    channel: AuthChannel
    onChannelChange: (channel: AuthChannel) => void
    onAuthenticated: (mode: MarketplaceAuthMode) => void
    onMobileSubmit: () => void
}

const AuthPanel = ({
    mode,
    channel,
    onChannelChange,
    onAuthenticated,
    onMobileSubmit,
}: AuthPanelProps) => {
    const login = useMarketplaceClientStore((state) => state.login)
    const register = useMarketplaceClientStore((state) => state.register)
    const [message, setMessage] = useState<string | null>(null)
    const resolver = useMemo<Resolver<AuthValues>>(
        () => zodResolver(buildSchema(mode, channel)) as Resolver<AuthValues>,
        [mode, channel],
    )
    const {
        control,
        handleSubmit,
        clearErrors,
        formState: { dirtyFields, errors, isSubmitting, isSubmitted },
    } = useForm<AuthValues>({
        defaultValues: EMPTY_VALUES,
        resolver,
        mode: 'onChange',
        reValidateMode: 'onChange',
    })
    const values = useWatch({ control })
    const email = values.email ?? ''
    const mobile = values.mobile ?? ''
    const password = values.password ?? ''
    const shouldShow = (field: keyof AuthValues) =>
        Boolean(dirtyFields[field] || isSubmitted)
    const fieldInvalid = (field: keyof AuthValues) =>
        shouldShow(field) && Boolean(errors[field])
    const fieldValid = (field: keyof AuthValues, value: string) =>
        shouldShow(field) && !errors[field] && Boolean(value.trim())
    const passwordIsStrong =
        password.length >= PASSWORD_MIN &&
        /[A-Za-z]/.test(password) &&
        /\d/.test(password)

    const onSubmit = async (form: AuthValues) => {
        setMessage(null)
        if (channel === 'mobile') {
            onMobileSubmit()
            return
        }
        try {
            if (mode === 'sign-in') {
                await login({
                    email: form.email.trim().toLowerCase(),
                    password: form.password,
                })
            } else {
                await register({
                    email: form.email.trim().toLowerCase(),
                    firstName: form.firstName.trim(),
                    password: form.password,
                })
            }
            onAuthenticated(mode)
        } catch (error) {
            setMessage(
                toApiError(
                    error,
                    mode === 'sign-in'
                        ? 'Unable to sign in'
                        : 'Unable to create account',
                ).message,
            )
        }
    }

    const clearOnChange = (field: keyof AuthValues) => {
        clearErrors(field)
        if (message) setMessage(null)
    }

    return (
        <Form className="mt-6" onSubmit={handleSubmit(onSubmit)} noValidate>
            {message ? (
                <Alert showIcon type="danger" className="mb-5">
                    {message}
                </Alert>
            ) : null}

            {channel === 'mobile' ? (
                <FormItem
                    asterisk
                    label="Mobile number"
                    extra={
                        <FieldState
                            valid={fieldValid('mobile', mobile)}
                            label="Number looks good"
                        />
                    }
                    invalid={fieldInvalid('mobile')}
                    errorMessage={errors.mobile?.message}
                >
                    <Controller
                        name="mobile"
                        control={control}
                        render={({ field }) => (
                            <Input
                                type="tel"
                                inputMode="tel"
                                placeholder="917 123 4567"
                                autoComplete="tel-national"
                                aria-invalid={fieldInvalid('mobile')}
                                prefix={
                                    <span className="text-sm font-medium text-gray-400">
                                        +63
                                    </span>
                                }
                                {...field}
                                onChange={(event) => {
                                    field.onChange(event)
                                    clearOnChange('mobile')
                                }}
                            />
                        )}
                    />
                </FormItem>
            ) : (
                <FormItem
                    asterisk
                    label={mode === 'sign-in' ? 'Email' : 'Email address'}
                    extra={
                        <FieldState
                            valid={fieldValid('email', email)}
                            label="Email looks good"
                        />
                    }
                    invalid={fieldInvalid('email')}
                    errorMessage={errors.email?.message}
                >
                    <Controller
                        name="email"
                        control={control}
                        render={({ field }) => (
                            <Input
                                type="email"
                                placeholder="you@example.com"
                                autoComplete="email"
                                aria-invalid={fieldInvalid('email')}
                                prefix={
                                    <HiOutlineMail className="text-lg text-gray-400" />
                                }
                                {...field}
                                onChange={(event) => {
                                    field.onChange(event)
                                    clearOnChange('email')
                                }}
                            />
                        )}
                    />
                </FormItem>
            )}

            {mode === 'sign-up' ? (
                <FormItem
                    asterisk
                    label="First name"
                    extra={
                        <FieldState
                            valid={fieldValid(
                                'firstName',
                                values.firstName ?? '',
                            )}
                            label="Looks good"
                        />
                    }
                    invalid={fieldInvalid('firstName')}
                    errorMessage={errors.firstName?.message}
                >
                    <Controller
                        name="firstName"
                        control={control}
                        render={({ field }) => (
                            <Input
                                placeholder="Juan"
                                autoComplete="given-name"
                                aria-invalid={fieldInvalid('firstName')}
                                prefix={
                                    <HiOutlineUser className="text-lg text-gray-400" />
                                }
                                {...field}
                                onChange={(event) => {
                                    field.onChange(event)
                                    clearOnChange('firstName')
                                }}
                            />
                        )}
                    />
                </FormItem>
            ) : null}

            {channel === 'mobile' ? (
                <p className="-mt-2 mb-5 text-xs text-gray-500">
                    We will send you a one-time password (OTP) via SMS to verify
                    your number.
                </p>
            ) : (
                <>
                    <FormItem
                        asterisk
                        label="Password"
                        extra={
                            <FieldState
                                valid={
                                    mode === 'sign-in'
                                        ? fieldValid('password', password)
                                        : passwordIsStrong
                                }
                                label={
                                    mode === 'sign-in'
                                        ? 'Ready to sign in'
                                        : 'Strong password'
                                }
                            />
                        }
                        invalid={fieldInvalid('password')}
                        errorMessage={errors.password?.message}
                    >
                        <Controller
                            name="password"
                            control={control}
                            render={({ field }) => (
                                <PasswordInput
                                    placeholder={
                                        mode === 'sign-in'
                                            ? 'Enter your password'
                                            : `At least ${PASSWORD_MIN} characters`
                                    }
                                    autoComplete={
                                        mode === 'sign-in'
                                            ? 'current-password'
                                            : 'new-password'
                                    }
                                    aria-invalid={fieldInvalid('password')}
                                    {...field}
                                    onChange={(event) => {
                                        field.onChange(event)
                                        clearOnChange('password')
                                    }}
                                />
                            )}
                        />
                    </FormItem>

                    {mode === 'sign-up' ? (
                        <PasswordChecklist password={password} />
                    ) : null}
                </>
            )}

            <Button
                block
                type="submit"
                className="mt-2"
                loading={isSubmitting}
                customColorClass={PRIMARY_BUTTON}
            >
                {channel === 'mobile' ? 'Send Code' : COPY[mode].action}
            </Button>

            <OrDivider />

            <div className="flex flex-col gap-3">
                {channel === 'mobile' ? (
                    <Button
                        block
                        type="button"
                        variant="default"
                        icon={<HiOutlineMail />}
                        onClick={() => onChannelChange('email')}
                    >
                        Continue with Email
                    </Button>
                ) : (
                    <Button
                        block
                        type="button"
                        variant="default"
                        icon={<HiOutlineDeviceMobile />}
                        onClick={() => onChannelChange('mobile')}
                    >
                        Continue with Mobile Number
                    </Button>
                )}
                <Button
                    block
                    type="button"
                    variant="default"
                    icon={<FcGoogle />}
                    onClick={notifyGoogleUnavailable}
                >
                    Continue with Google
                </Button>
            </div>

            {channel === 'email' && mode === 'sign-in' ? (
                <p className="mt-4 text-center text-xs text-gray-400">
                    We validate your details as you type. Your sign-in is
                    protected with secure encryption.
                </p>
            ) : null}
        </Form>
    )
}

type MarketplaceAuthFormProps = {
    mode: MarketplaceAuthMode
    onModeChange: (mode: MarketplaceAuthMode) => void
    onAuthenticated: (mode: MarketplaceAuthMode) => void
    /** Mobile-number sign-in / sign-up continues to OTP verification. */
    onMobileSubmit: () => void
}

/** The marketplace's only shopper sign-in and account-creation form. */
const MarketplaceAuthForm = ({
    mode,
    onModeChange,
    onAuthenticated,
    onMobileSubmit,
}: MarketplaceAuthFormProps) => {
    const [channel, setChannel] = useState<AuthChannel>('mobile')
    const copy = COPY[mode]

    const selectMode = (nextMode: MarketplaceAuthMode) => {
        if (nextMode !== mode) onModeChange(nextMode)
    }

    return (
        <div className="w-full">
            <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-shop-600 text-2xl text-white shadow-sm shadow-shop-500/30">
                    <HiOutlineUserCircle aria-hidden />
                </span>
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                        {copy.title}
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        {copy.subtitle}
                    </p>
                </div>
            </div>

            <Tabs
                className="mt-6"
                value={mode}
                onChange={(value) => selectMode(value as MarketplaceAuthMode)}
            >
                <Tabs.TabList>
                    <Tabs.TabNav value="sign-in" className={TAB_CLASS}>
                        Sign in
                    </Tabs.TabNav>
                    <Tabs.TabNav value="sign-up" className={TAB_CLASS}>
                        Create account
                    </Tabs.TabNav>
                </Tabs.TabList>
            </Tabs>

            <AuthPanel
                key={`${mode}-${channel}`}
                mode={mode}
                channel={channel}
                onChannelChange={setChannel}
                onAuthenticated={onAuthenticated}
                onMobileSubmit={onMobileSubmit}
            />
        </div>
    )
}

export default MarketplaceAuthForm
