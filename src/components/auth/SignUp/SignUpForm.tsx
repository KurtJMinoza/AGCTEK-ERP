'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { FormItem, Form } from '@/components/ui/Form'
import PasswordInput from '@/components/shared/PasswordInput'
import AuthFormSection from '@/components/auth/AuthFormSection'
import { ROLE_OPTIONS, type RoleOption, type UserRole } from '@/constants/roles.constant'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { CommonProps } from '@/@types/common'

type SignUpFormSchema = {
    firstName: string
    lastName: string
    jobPosition: string
    userName: string
    email: string
    password: string
    confirmPassword: string
    role: UserRole
}

export type OnSignUpPayload = {
    values: SignUpFormSchema
    setSubmitting: (isSubmitting: boolean) => void
    setMessage: (message: string) => void
}

export type OnSignUp = (payload: OnSignUpPayload) => void

interface SignUpFormProps extends CommonProps {
    setMessage: (message: string) => void
    onSignUp?: OnSignUp
}

const validationSchema = z
    .object({
        firstName: z.string().min(1, { message: 'First name is required' }),
        lastName: z.string().min(1, { message: 'Last name is required' }),
        jobPosition: z.string().min(1, { message: 'Job position is required' }),
        userName: z.string().min(1, { message: 'Username is required' }),
        email: z
            .string()
            .min(1, { message: 'Please enter your email' })
            .email({ message: 'Please enter a valid email' }),
        password: z
            .string()
            .min(6, { message: 'Password must be at least 6 characters' }),
        confirmPassword: z
            .string()
            .min(1, { message: 'Please confirm your password' }),
        role: z.enum(['super_admin', 'admin'], {
            message: 'Please select a role',
        }),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
    })

const SignUpForm = (props: SignUpFormProps) => {
    const { onSignUp, className, setMessage } = props
    const [isSubmitting, setSubmitting] = useState(false)

    const {
        handleSubmit,
        formState: { errors },
        control,
    } = useForm<SignUpFormSchema>({
        defaultValues: {
            firstName: '',
            lastName: '',
            jobPosition: '',
            userName: '',
            email: '',
            password: '',
            confirmPassword: '',
            role: undefined,
        },
        resolver: zodResolver(validationSchema),
    })

    const handleSignUp = async (values: SignUpFormSchema) => {
        if (onSignUp) {
            onSignUp({ values, setSubmitting, setMessage })
        }
    }

    return (
        <div className={className}>
            <Form
                containerClassName="flex flex-col gap-8"
                onSubmit={handleSubmit(handleSignUp)}
            >
                <AuthFormSection
                    title="Personal information"
                    description="Your name and role within the organization."
                >
                    <div className="grid gap-x-4 sm:grid-cols-2">
                        <FormItem
                            label="First name"
                            asterisk
                            invalid={Boolean(errors.firstName)}
                            errorMessage={errors.firstName?.message}
                        >
                            <Controller
                                name="firstName"
                                control={control}
                                render={({ field }) => (
                                    <Input
                                        type="text"
                                        placeholder="First name"
                                        autoComplete="given-name"
                                        {...field}
                                    />
                                )}
                            />
                        </FormItem>

                        <FormItem
                            label="Last name"
                            asterisk
                            invalid={Boolean(errors.lastName)}
                            errorMessage={errors.lastName?.message}
                        >
                            <Controller
                                name="lastName"
                                control={control}
                                render={({ field }) => (
                                    <Input
                                        type="text"
                                        placeholder="Last name"
                                        autoComplete="family-name"
                                        {...field}
                                    />
                                )}
                            />
                        </FormItem>
                    </div>

                    <FormItem
                        label="Job position"
                        asterisk
                        invalid={Boolean(errors.jobPosition)}
                        errorMessage={errors.jobPosition?.message}
                    >
                        <Controller
                            name="jobPosition"
                            control={control}
                            render={({ field }) => (
                                <Input
                                    type="text"
                                    placeholder="e.g. Warehouse Manager, Procurement Lead"
                                    autoComplete="organization-title"
                                    {...field}
                                />
                            )}
                        />
                    </FormItem>
                </AuthFormSection>

                <AuthFormSection
                    title="Account details"
                    description="Credentials used to sign in to AGCTEK ERP."
                >
                    <div className="grid gap-x-4 sm:grid-cols-2">
                        <FormItem
                            label="Username"
                            asterisk
                            invalid={Boolean(errors.userName)}
                            errorMessage={errors.userName?.message}
                        >
                            <Controller
                                name="userName"
                                control={control}
                                render={({ field }) => (
                                    <Input
                                        type="text"
                                        placeholder="Unique login username"
                                        autoComplete="username"
                                        {...field}
                                    />
                                )}
                            />
                        </FormItem>

                        <FormItem
                            label="Email"
                            asterisk
                            invalid={Boolean(errors.email)}
                            errorMessage={errors.email?.message}
                        >
                            <Controller
                                name="email"
                                control={control}
                                render={({ field }) => (
                                    <Input
                                        type="email"
                                        placeholder="name@company.com"
                                        autoComplete="email"
                                        {...field}
                                    />
                                )}
                            />
                        </FormItem>
                    </div>

                    <FormItem
                        label="System role"
                        asterisk
                        invalid={Boolean(errors.role)}
                        errorMessage={errors.role?.message}
                    >
                        <Controller
                            name="role"
                            control={control}
                            render={({ field }) => (
                                <Select<RoleOption>
                                    placeholder="Select access level"
                                    options={ROLE_OPTIONS}
                                    value={ROLE_OPTIONS.find(
                                        (option) => option.value === field.value,
                                    )}
                                    onChange={(option) =>
                                        field.onChange(option?.value)
                                    }
                                />
                            )}
                        />
                    </FormItem>
                </AuthFormSection>

                <AuthFormSection
                    title="Security"
                    description="Choose a strong password for your account."
                >
                    <div className="grid gap-x-4 sm:grid-cols-2">
                        <FormItem
                            label="Password"
                            asterisk
                            invalid={Boolean(errors.password)}
                            errorMessage={errors.password?.message}
                        >
                            <Controller
                                name="password"
                                control={control}
                                render={({ field }) => (
                                    <PasswordInput
                                        placeholder="At least 6 characters"
                                        autoComplete="new-password"
                                        {...field}
                                    />
                                )}
                            />
                        </FormItem>

                        <FormItem
                            label="Confirm password"
                            asterisk
                            invalid={Boolean(errors.confirmPassword)}
                            errorMessage={errors.confirmPassword?.message}
                        >
                            <Controller
                                name="confirmPassword"
                                control={control}
                                render={({ field }) => (
                                    <PasswordInput
                                        placeholder="Re-enter password"
                                        autoComplete="new-password"
                                        {...field}
                                    />
                                )}
                            />
                        </FormItem>
                    </div>
                </AuthFormSection>

                <div className="border-t border-gray-200 pt-6 dark:border-gray-700">
                    <Button
                        block
                        loading={isSubmitting}
                        variant="solid"
                        type="submit"
                        size="lg"
                    >
                        {isSubmitting ? 'Creating account…' : 'Create account'}
                    </Button>
                    <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
                        By creating an account, you agree to use AGCTEK ERP for authorized business purposes only.
                    </p>
                </div>
            </Form>
        </div>
    )
}

export default SignUpForm
