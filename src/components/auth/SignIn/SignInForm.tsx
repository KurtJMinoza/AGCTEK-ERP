'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import { FormItem, Form } from '@/components/ui/Form'
import PasswordInput from '@/components/shared/PasswordInput'
import classNames from '@/utils/classNames'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { CommonProps } from '@/@types/common'
import type { ReactNode } from 'react'

export type OnSignInPayload = {
    values: SignInFormSchema
    setSubmitting: (isSubmitting: boolean) => void
    setMessage: (message: string) => void
}

export type OnSignIn = (payload: OnSignInPayload) => void

interface SignInFormProps extends CommonProps {
    passwordHint?: string | ReactNode
    setMessage: (message: string) => void
    onSignIn?: OnSignIn
}

type SignInFormSchema = {
    email: string
    password: string
    rememberMe: boolean
}

const validationSchema = z.object({
    email: z
        .string()
        .min(1, { message: 'Please enter your email' })
        .email({ message: 'Please enter a valid email address' }),
    password: z
        .string()
        .min(1, { message: 'Please enter your password' }),
    rememberMe: z.boolean(),
})

const SignInForm = (props: SignInFormProps) => {
    const [isSubmitting, setSubmitting] = useState<boolean>(false)

    const { className, setMessage, onSignIn, passwordHint } = props

    const {
        handleSubmit,
        formState: { errors },
        control,
    } = useForm<SignInFormSchema>({
        defaultValues: {
            email: '',
            password: '',
            rememberMe: false,
        },
        resolver: zodResolver(validationSchema),
    })

    const handleSignIn = async (values: SignInFormSchema) => {
        if (onSignIn) {
            onSignIn({ values, setSubmitting, setMessage })
        }
    }

    return (
        <div className={className}>
            <Form onSubmit={handleSubmit(handleSignIn)}>
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
                                placeholder="Enter username"
                                autoComplete="email"
                                {...field}
                            />
                        )}
                    />
                </FormItem>

                <FormItem
                    label="Password"
                    invalid={Boolean(errors.password)}
                    errorMessage={errors.password?.message}
                    className={classNames(
                        passwordHint ? 'mb-0' : '',
                        errors.password?.message ? 'mb-6' : 'mb-4',
                    )}
                >
                    <Controller
                        name="password"
                        control={control}
                        render={({ field }) => (
                            <PasswordInput
                                placeholder="Enter your password"
                                autoComplete="current-password"
                                {...field}
                            />
                        )}
                    />
                </FormItem>

                {passwordHint}

                <div className="mb-6 flex w-full items-center justify-between">
                    <Controller
                        name="rememberMe"
                        control={control}
                        render={({ field }) => (
                            <Checkbox
                                checked={field.value}
                                onChange={(checked) =>
                                    field.onChange(checked)
                                }
                            >
                                Remember me
                            </Checkbox>
                        )}
                    />
                </div>

                <Button
                    block
                    loading={isSubmitting}
                    variant="solid"
                    type="submit"
                >
                    {isSubmitting ? 'Signing in...' : 'Sign in'}
                </Button>
            </Form>
        </div>
    )
}

export default SignInForm
