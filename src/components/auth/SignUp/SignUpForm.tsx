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
        userName: z.string().min(1, { message: 'Please enter your name' }),
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
            <Form onSubmit={handleSubmit(handleSignUp)}>
                <FormItem
                    label="User name"
                    invalid={Boolean(errors.userName)}
                    errorMessage={errors.userName?.message}
                >
                    <Controller
                        name="userName"
                        control={control}
                        render={({ field }) => (
                            <Input
                                type="text"
                                placeholder="Enter your name"
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
                >
                    <Controller
                        name="email"
                        control={control}
                        render={({ field }) => (
                            <Input
                                type="email"
                                placeholder="Enter your email"
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
                >
                    <Controller
                        name="role"
                        control={control}
                        render={({ field }) => (
                            <Select<RoleOption>
                                placeholder="Select role"
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
                >
                    <Controller
                        name="password"
                        control={control}
                        render={({ field }) => (
                            <PasswordInput
                                placeholder="Enter your password"
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
                    className="mb-6"
                >
                    <Controller
                        name="confirmPassword"
                        control={control}
                        render={({ field }) => (
                            <PasswordInput
                                placeholder="Confirm your password"
                                autoComplete="new-password"
                                {...field}
                            />
                        )}
                    />
                </FormItem>

                <Button
                    block
                    loading={isSubmitting}
                    variant="solid"
                    type="submit"
                >
                    {isSubmitting ? 'Creating account...' : 'Sign up'}
                </Button>
            </Form>
        </div>
    )
}

export default SignUpForm
