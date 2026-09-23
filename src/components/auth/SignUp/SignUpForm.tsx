'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { FormItem, Form } from '@/components/ui/Form'
import PasswordInput from '@/components/shared/PasswordInput'
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
            .min(1, { message: 'Email is required' })
            .email({ message: 'Enter a valid email' }),
        password: z
            .string()
            .min(6, { message: 'At least 6 characters' }),
        confirmPassword: z.string().min(1, { message: 'Confirm your password' }),
        role: z.enum(['super_admin', 'admin'], {
            message: 'Select a role',
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
        setMessage('')
        if (onSignUp) {
            onSignUp({ values, setSubmitting, setMessage })
        }
    }

    return (
        <div className={className}>
            <Form size="sm" onSubmit={handleSubmit(handleSignUp)}>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0">
                    <FormItem
                        label="First name"
                        invalid={Boolean(errors.firstName)}
                        errorMessage={errors.firstName?.message}
                        className="mb-2.5"
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
                        invalid={Boolean(errors.lastName)}
                        errorMessage={errors.lastName?.message}
                        className="mb-2.5"
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

                    <FormItem
                        label="Job position"
                        invalid={Boolean(errors.jobPosition)}
                        errorMessage={errors.jobPosition?.message}
                        className="col-span-2 mb-2.5"
                    >
                        <Controller
                            name="jobPosition"
                            control={control}
                            render={({ field }) => (
                                <Input
                                    type="text"
                                    placeholder="e.g. Operations Manager"
                                    autoComplete="organization-title"
                                    {...field}
                                />
                            )}
                        />
                    </FormItem>

                    <FormItem
                        label="Username"
                        invalid={Boolean(errors.userName)}
                        errorMessage={errors.userName?.message}
                        className="mb-2.5"
                    >
                        <Controller
                            name="userName"
                            control={control}
                            render={({ field }) => (
                                <Input
                                    type="text"
                                    placeholder="Login username"
                                    autoComplete="username"
                                    {...field}
                                />
                            )}
                        />
                    </FormItem>

                    <FormItem
                        label="Email"
                        invalid={Boolean(errors.email)}
                        errorMessage={errors.email?.message}
                        className="mb-2.5"
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

                    <FormItem
                        label="Role"
                        invalid={Boolean(errors.role)}
                        errorMessage={errors.role?.message}
                        className="col-span-2 mb-2.5"
                    >
                        <Controller
                            name="role"
                            control={control}
                            render={({ field }) => (
                                <Select<RoleOption>
                                    placeholder="Super Admin or Admin"
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

                    <FormItem
                        label="Password"
                        invalid={Boolean(errors.password)}
                        errorMessage={errors.password?.message}
                        className="mb-2.5"
                    >
                        <Controller
                            name="password"
                            control={control}
                            render={({ field }) => (
                                <PasswordInput
                                    placeholder="Min. 6 characters"
                                    autoComplete="new-password"
                                    {...field}
                                />
                            )}
                        />
                    </FormItem>

                    <FormItem
                        label="Confirm password"
                        invalid={Boolean(errors.confirmPassword)}
                        errorMessage={errors.confirmPassword?.message}
                        className="mb-2.5"
                    >
                        <Controller
                            name="confirmPassword"
                            control={control}
                            render={({ field }) => (
                                <PasswordInput
                                    placeholder="Repeat password"
                                    autoComplete="new-password"
                                    {...field}
                                />
                            )}
                        />
                    </FormItem>
                </div>

                <Button
                    block
                    size="sm"
                    loading={isSubmitting}
                    variant="solid"
                    type="submit"
                    className="mt-1"
                >
                    {isSubmitting ? 'Creating account…' : 'Create account'}
                </Button>
            </Form>
        </div>
    )
}

export default SignUpForm
