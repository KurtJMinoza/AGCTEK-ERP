'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Button from '@/components/ui/Button'
import { Form, FormItem } from '@/components/ui/Form'
import PasswordInput from '@/components/shared/PasswordInput'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import AccountSection from '@/modules/account/components/AccountSection'
import useCurrentSession from '@/utils/hooks/useCurrentSession'
import { apiChangePassword } from '@/services/AuthService'
import axios from 'axios'

type PasswordFormSchema = {
    currentPassword: string
    newPassword: string
    confirmPassword: string
}

const validationSchema = z
    .object({
        currentPassword: z
            .string()
            .min(1, { message: 'Current password is required' }),
        newPassword: z
            .string()
            .min(6, { message: 'Password must be at least 6 characters' }),
        confirmPassword: z
            .string()
            .min(1, { message: 'Please confirm your password' }),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
    })

const AccountSettings = () => {
    const { session } = useCurrentSession()
    const [saving, setSaving] = useState(false)
    const currentUserName = session?.user?.name || ''

    const {
        handleSubmit,
        control,
        reset,
        formState: { errors },
    } = useForm<PasswordFormSchema>({
        defaultValues: {
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
        },
        resolver: zodResolver(validationSchema),
    })

    const onSubmit = async (values: PasswordFormSchema) => {
        if (!currentUserName) {
            return
        }

        setSaving(true)

        try {
            const result = await apiChangePassword({
                userName: currentUserName,
                currentPassword: values.currentPassword,
                newPassword: values.newPassword,
            })

            reset()

            toast.push(
                <Notification type="success" title="Password updated">
                    {result.message}
                </Notification>,
                { placement: 'top-center' },
            )
        } catch (error) {
            const message = axios.isAxiosError(error)
                ? (error.response?.data as { message?: string })?.message ||
                  'Unable to update password.'
                : 'Unable to update password.'

            toast.push(
                <Notification type="danger" title="Update failed">
                    {message}
                </Notification>,
                { placement: 'top-center' },
            )
        } finally {
            setSaving(false)
        }
    }

    return (
        <AccountSection
            title="Password"
            description="Remember, your password is your digital key to your account. Keep it safe, keep it secure!"
            footer={
                <Button
                    variant="solid"
                    type="submit"
                    form="account-password-form"
                    loading={saving}
                >
                    Update
                </Button>
            }
        >
            <Form id="account-password-form" onSubmit={handleSubmit(onSubmit)}>
                <FormItem
                    label="Current password"
                    invalid={Boolean(errors.currentPassword)}
                    errorMessage={errors.currentPassword?.message}
                >
                    <Controller
                        name="currentPassword"
                        control={control}
                        render={({ field }) => (
                            <PasswordInput
                                placeholder="Enter current password"
                                autoComplete="current-password"
                                {...field}
                            />
                        )}
                    />
                </FormItem>
                <FormItem
                    label="New password"
                    invalid={Boolean(errors.newPassword)}
                    errorMessage={errors.newPassword?.message}
                >
                    <Controller
                        name="newPassword"
                        control={control}
                        render={({ field }) => (
                            <PasswordInput
                                placeholder="Enter new password"
                                autoComplete="new-password"
                                {...field}
                            />
                        )}
                    />
                </FormItem>
                <FormItem
                    label="Confirm new password"
                    invalid={Boolean(errors.confirmPassword)}
                    errorMessage={errors.confirmPassword?.message}
                >
                    <Controller
                        name="confirmPassword"
                        control={control}
                        render={({ field }) => (
                            <PasswordInput
                                placeholder="Confirm new password"
                                autoComplete="new-password"
                                {...field}
                            />
                        )}
                    />
                </FormItem>
            </Form>
        </AccountSection>
    )
}

export default AccountSettings
