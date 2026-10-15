'use client'

import { useMemo, useState } from 'react'
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
    HiOutlineCheckCircle,
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
import Tabs from '@/components/ui/Tabs'
import { toApiError } from '@/modules/sd/services/apiError'
import { PRIMARY_BUTTON } from '../marketplaceUi'
import { useMarketplaceClientStore } from '../store/useMarketplaceClientStore'

const PASSWORD_MIN = 8

export type MarketplaceAuthMode = 'sign-in' | 'sign-up'

const signUpSchema = z.object({
    email: z
        .string()
        .trim()
        .min(1, 'Email is required')
        .email('Enter a valid email address'),
    firstName: z
        .string()
        .trim()
        .min(1, 'First name is required')
        .max(120, 'First name must be 120 characters or fewer'),
    password: z
        .string()
        .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
        .regex(/[A-Za-z]/, 'Include at least one letter')
        .regex(/\d/, 'Include at least one number'),
})

type AuthValues = z.infer<typeof signUpSchema>

const signInSchema = signUpSchema.extend({
    firstName: z.string(),
    password: z.string().min(1, 'Password is required'),
})

const EMPTY_VALUES: AuthValues = {
    email: '',
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
                            className={
                                met ? 'text-shop-600' : 'text-gray-300'
                            }
                            aria-hidden
                        />
                        {label}
                    </span>
                ))}
            </div>
        </div>
    )
}

type AuthPanelProps = {
    mode: MarketplaceAuthMode
    onAuthenticated: (mode: MarketplaceAuthMode) => void
}

const AuthPanel = ({ mode, onAuthenticated }: AuthPanelProps) => {
    const login = useMarketplaceClientStore((state) => state.login)
    const register = useMarketplaceClientStore((state) => state.register)
    const [message, setMessage] = useState<string | null>(null)
    const resolver = useMemo<Resolver<AuthValues>>(
        () =>
            zodResolver(
                mode === 'sign-in' ? signInSchema : signUpSchema,
            ) as Resolver<AuthValues>,
        [mode],
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

            <Button
                block
                type="submit"
                className="mt-2"
                loading={isSubmitting}
                customColorClass={PRIMARY_BUTTON}
            >
                {COPY[mode].action}
            </Button>

            {mode === 'sign-in' ? (
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
}

/** The marketplace's only shopper sign-in and account-creation form. */
const MarketplaceAuthForm = ({
    mode,
    onModeChange,
    onAuthenticated,
}: MarketplaceAuthFormProps) => {
    const copy = COPY[mode]

    const selectMode = (nextMode: MarketplaceAuthMode) => {
        if (nextMode !== mode) onModeChange(nextMode)
    }

    return (
        <div className="w-full">
            <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-shop-400 to-leaf-600 text-2xl text-white shadow-sm shadow-shop-500/30">
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
                key={mode}
                mode={mode}
                onAuthenticated={onAuthenticated}
            />
        </div>
    )
}

export default MarketplaceAuthForm
