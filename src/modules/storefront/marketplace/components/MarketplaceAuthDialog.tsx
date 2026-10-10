'use client'

import { useEffect, useMemo, useState } from 'react'
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
import FormDialog from '@/components/shared/FormDialog'
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

const FieldState = ({ valid, label }: { valid: boolean; label: string }) =>
    valid ? (
        <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
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
                                ? 'inline-flex items-center gap-1 text-xs font-medium text-emerald-700'
                                : 'inline-flex items-center gap-1 text-xs text-gray-400'
                        }
                    >
                        <HiOutlineCheckCircle
                            className={
                                met ? 'text-emerald-600' : 'text-gray-300'
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

type MarketplaceAuthDialogProps = {
    isOpen: boolean
    initialMode: MarketplaceAuthMode
    onClose: () => void
    onAuthenticated: (mode: MarketplaceAuthMode) => void
}

/** The marketplace's only shopper sign-in and account-creation surface. */
const MarketplaceAuthDialog = ({
    isOpen,
    initialMode,
    onClose,
    onAuthenticated,
}: MarketplaceAuthDialogProps) => {
    const login = useMarketplaceClientStore((state) => state.login)
    const register = useMarketplaceClientStore((state) => state.register)
    const [mode, setMode] = useState<MarketplaceAuthMode>(initialMode)
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
        reset,
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

    useEffect(() => {
        if (!isOpen) return
        setMode(initialMode)
        setMessage(null)
        reset(EMPTY_VALUES)
    }, [initialMode, isOpen, reset])

    const selectMode = (nextMode: MarketplaceAuthMode) => {
        if (nextMode === mode) return
        setMode(nextMode)
        setMessage(null)
        reset(EMPTY_VALUES)
    }

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

    return (
        <FormDialog
            isOpen={isOpen}
            size="md"
            title={mode === 'sign-in' ? 'Welcome back' : 'Create account'}
            description={
                mode === 'sign-in'
                    ? 'Sign in to check out faster with saved delivery details.'
                    : 'Create your AGC Marketplace account in a few seconds. Delivery details can be added later in My Account.'
            }
            icon={<HiOutlineUserCircle />}
            iconClassName="bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-sm shadow-emerald-500/30"
            headerClassName="!border-emerald-100/70 bg-gradient-to-br from-emerald-50 via-white to-teal-50/60"
            onClose={onClose}
            headerExtra={
                <Tabs
                    value={mode}
                    onChange={(value) =>
                        selectMode(value as MarketplaceAuthMode)
                    }
                >
                    <Tabs.TabList>
                        <Tabs.TabNav
                            value="sign-in"
                            className="hover:!text-emerald-700 aria-selected:!border-emerald-600 aria-selected:!text-emerald-700"
                        >
                            Sign in
                        </Tabs.TabNav>
                        <Tabs.TabNav
                            value="sign-up"
                            className="hover:!text-emerald-700 aria-selected:!border-emerald-600 aria-selected:!text-emerald-700"
                        >
                            Create account
                        </Tabs.TabNav>
                    </Tabs.TabList>
                </Tabs>
            }
            footer={
                <Button
                    block
                    type="submit"
                    form="marketplace-auth-form"
                    loading={isSubmitting}
                    customColorClass={PRIMARY_BUTTON}
                >
                    {mode === 'sign-in' ? 'Sign in' : 'Create account'}
                </Button>
            }
        >
            <Form
                id="marketplace-auth-form"
                onSubmit={handleSubmit(onSubmit)}
                noValidate
            >
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
                                    clearErrors('email')
                                    if (message) setMessage(null)
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
                                        clearErrors('firstName')
                                        if (message) setMessage(null)
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
                                    clearErrors('password')
                                    if (message) setMessage(null)
                                }}
                            />
                        )}
                    />
                </FormItem>

                {mode === 'sign-up' ? (
                    <PasswordChecklist password={password} />
                ) : (
                    <p className="mt-2 text-center text-xs text-gray-400">
                        We validate your details as you type. Your sign-in is
                        protected with secure encryption.
                    </p>
                )}
            </Form>
        </FormDialog>
    )
}

export default MarketplaceAuthDialog
