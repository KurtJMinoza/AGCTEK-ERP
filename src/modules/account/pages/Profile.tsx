'use client'

import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useSession } from 'next-auth/react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import { Form, FormItem } from '@/components/ui/Form'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import Spinner from '@/components/ui/Spinner'
import AccountSection from '@/modules/account/components/AccountSection'
import ProfilePictureField from '@/modules/account/components/ProfilePictureField'
import useCurrentSession from '@/utils/hooks/useCurrentSession'
import useUserAvatar from '@/modules/account/hooks/useUserAvatar'
import { apiGetProfile, apiUpdateProfile } from '@/services/AuthService'
import axios from 'axios'

type ProfileFormSchema = {
    userName: string
    email: string
}

const validationSchema = z.object({
    userName: z.string().min(1, { message: 'Username is required' }),
    email: z.string().email({ message: 'Please enter a valid email' }),
})

const Profile = () => {
    const { session } = useCurrentSession()
    const { update: updateSession } = useSession()
    const { avatar, setAvatar } = useUserAvatar()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [avatarSaving, setAvatarSaving] = useState(false)
    const [role, setRole] = useState('')
    const [currentUserName, setCurrentUserName] = useState(
        session?.user?.name || '',
    )

    const {
        handleSubmit,
        control,
        reset,
        formState: { errors },
    } = useForm<ProfileFormSchema>({
        defaultValues: {
            userName: '',
            email: '',
        },
        resolver: zodResolver(validationSchema),
    })

    useEffect(() => {
        const loadProfile = async () => {
            const initialUserName = session?.user?.name || ''

            if (!initialUserName) {
                setLoading(false)
                return
            }

            try {
                const profile = await apiGetProfile(initialUserName)
                setRole(profile.role)
                setAvatar(profile.avatar)
                setCurrentUserName(profile.userName)
                reset({
                    userName: profile.userName,
                    email: profile.email,
                })
            } catch {
                setCurrentUserName(initialUserName)
                reset({
                    userName: initialUserName,
                    email: session?.user?.email || '',
                })
            } finally {
                setLoading(false)
            }
        }

        loadProfile()
    }, [reset, session?.user?.email, session?.user?.name, setAvatar])

    const syncSessionProfile = async (data: {
        name?: string
        email?: string
    }) => {
        await updateSession(data)
    }

    const handleAvatarUpdate = async (nextAvatar: string) => {
        if (!currentUserName) {
            return
        }

        setAvatarSaving(true)

        try {
            const result = await apiUpdateProfile({
                userName: currentUserName,
                avatar: nextAvatar,
            })

            setAvatar(result.user.avatar)
            setCurrentUserName(result.user.userName)

            toast.push(
                <Notification type="success" title="Profile picture updated">
                    {result.message}
                </Notification>,
                { placement: 'top-center' },
            )
        } catch (error) {
            const message = axios.isAxiosError(error)
                ? (error.response?.data as { message?: string | string[] })
                      ?.message
                : undefined
            const resolvedMessage = Array.isArray(message)
                ? message.join(', ')
                : message

            toast.push(
                <Notification type="danger" title="Update failed">
                    {resolvedMessage ||
                        (error instanceof Error
                            ? error.message
                            : 'Unable to update profile picture.')}
                </Notification>,
                { placement: 'top-center' },
            )
        } finally {
            setAvatarSaving(false)
        }
    }

    const handleAvatarRemove = async () => {
        await handleAvatarUpdate('')
    }

    const onSubmit = async (values: ProfileFormSchema) => {
        if (!currentUserName) {
            return
        }

        setSaving(true)

        try {
            const result = await apiUpdateProfile({
                userName: currentUserName,
                email: values.email,
                newUserName: values.userName,
            })

            reset({
                userName: result.user.userName,
                email: result.user.email,
            })
            setRole(result.user.role)
            setCurrentUserName(result.user.userName)
            await syncSessionProfile({
                name: result.user.userName,
                email: result.user.email,
            })

            toast.push(
                <Notification type="success" title="Profile updated">
                    {result.message}
                </Notification>,
                { placement: 'top-center' },
            )
        } catch (error) {
            const message = axios.isAxiosError(error)
                ? (error.response?.data as { message?: string })?.message ||
                  'Unable to update profile.'
                : 'Unable to update profile.'

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

    if (loading) {
        return (
            <div className="flex min-h-[320px] items-center justify-center">
                <Spinner size={40} />
            </div>
        )
    }

    return (
        <AccountSection
            title="Profile"
            description="Manage your profile picture and personal account details."
            footer={
                <Button
                    variant="solid"
                    loading={saving}
                    onClick={handleSubmit(onSubmit)}
                >
                    Update
                </Button>
            }
        >
            <div className="flex flex-col gap-8">
                <ProfilePictureField
                    value={avatar}
                    userName={currentUserName}
                    saving={avatarSaving}
                    onUpload={handleAvatarUpdate}
                    onRemove={handleAvatarRemove}
                />

                {role ? (
                    <div>
                        <Tag className="border-0 bg-primary-subtle text-primary">
                            {role === 'super_admin' ? 'Super Admin' : 'Admin'}
                        </Tag>
                    </div>
                ) : null}

                <Form onSubmit={handleSubmit(onSubmit)}>
                    <FormItem
                        label="Username"
                        invalid={Boolean(errors.userName)}
                        errorMessage={errors.userName?.message}
                    >
                        <Controller
                            name="userName"
                            control={control}
                            render={({ field }) => (
                                <Input
                                    placeholder="Enter username"
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
                                    placeholder="Enter email"
                                    autoComplete="email"
                                    {...field}
                                />
                            )}
                        />
                    </FormItem>
                </Form>
            </div>
        </AccountSection>
    )
}

export default Profile
