'use client'

import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { Form, FormItem } from '@/components/ui/Form'
import PasswordInput from '@/components/shared/PasswordInput'
import { USER_ROLES } from '@/constants/roles.constant'
import { apiListRoles } from '@/services/PermissionService'
import { HiOutlineUserAdd, HiOutlinePencil } from 'react-icons/hi'
import CompanyMembershipPanel from './CompanyMembershipPanel'
import { userManagementService } from '../services/userManagementService'
import { systemSettingsService } from '../services/systemSettingsService'
import type { CompanyOption, CreateUserPayload, ManagedUser } from '../types'

type FormValues = {
    email: string
    userName: string
    firstName: string
    lastName: string
    jobPosition: string
    password: string
    role: string
    companyId: string
}

type CompanySelectOption = { value: string; label: string }
type RoleOption = { value: string; label: string }

type UserFormDialogProps = {
    isOpen: boolean
    mode: 'create' | 'edit'
    user?: ManagedUser | null
    saving?: boolean
    /** Disables the role selector, e.g. when editing your own account. */
    lockRole?: boolean
    onClose: () => void
    onSubmit: (values: CreateUserPayload) => void
    /** Called after company membership changes in edit mode. */
    onMembershipChange?: () => void
}

const baseSchema = {
    email: z
        .string()
        .min(1, 'Email is required')
        .email('Enter a valid email'),
    userName: z.string().trim().min(1, 'Username is required').max(64),
    firstName: z.string().trim().min(1, 'First name is required').max(100),
    lastName: z.string().trim().min(1, 'Last name is required').max(100),
    jobPosition: z.string().trim().max(100),
    role: z.string().min(1, 'Select a role'),
}

/** `companyRequired` mirrors the `require_default_company_on_user` system setting. */
const makeCreateSchema = (companyRequired: boolean) =>
    z
        .object({
            ...baseSchema,
            password: z.string().min(6, 'At least 6 characters'),
            companyId: z.string(),
        })
        .refine(
            (d) =>
                !companyRequired || d.role === USER_ROLES.SUPER_ADMIN || Boolean(d.companyId),
            {
                path: ['companyId'],
                message: 'Company is required for roles other than Super Admin',
            },
        )

const editSchema = z.object({
    ...baseSchema,
    password: z.string(),
    companyId: z.string(),
})

const toFormValues = (user?: ManagedUser | null): FormValues => ({
    email: user?.email ?? '',
    userName: user?.userName ?? '',
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    jobPosition: user?.jobPosition ?? '',
    password: '',
    role: user?.role ?? '',
    companyId: '',
})

const UserFormDialog = ({
    isOpen,
    mode,
    user,
    saving,
    lockRole,
    onClose,
    onSubmit,
    onMembershipChange,
}: UserFormDialogProps) => {
    const [companies, setCompanies] = useState<CompanyOption[]>([])
    const [roleOptions, setRoleOptions] = useState<RoleOption[]>([])
    const [companyRequired, setCompanyRequired] = useState(true)
    const schema = useMemo(
        () => (mode === 'create' ? makeCreateSchema(companyRequired) : editSchema),
        [mode, companyRequired],
    )

    const {
        control,
        handleSubmit,
        reset,
        getValues,
        setValue,
        formState: { errors },
    } = useForm<FormValues>({
        defaultValues: toFormValues(user),
        resolver: zodResolver(schema),
    })

    useEffect(() => {
        if (isOpen) {
            reset(toFormValues(mode === 'edit' ? user : null))
        }
    }, [isOpen, mode, user, reset])

    useEffect(() => {
        if (!isOpen) return
        apiListRoles()
            .then((roles) =>
                setRoleOptions(
                    roles
                        .filter((r) => r.isActive)
                        .map((r) => ({ value: r.code, label: r.name })),
                ),
            )
            .catch(() => setRoleOptions([]))
    }, [isOpen])

    useEffect(() => {
        if (!isOpen || mode !== 'create') return
        userManagementService
            .listCompanyOptions()
            .then(setCompanies)
            .catch(() => setCompanies([]))
        systemSettingsService
            .list()
            .then((settings) => {
                const byKey = new Map(settings.map((s) => [s.key, s.value]))
                setCompanyRequired(byKey.get('require_default_company_on_user') !== false)
                const defaultRole = byKey.get('default_user_role')
                if (!getValues('role') && typeof defaultRole === 'string') {
                    setValue('role', defaultRole)
                }
            })
            .catch(() => setCompanyRequired(true))
    }, [isOpen, mode, getValues, setValue])

    const selectedRole = useWatch({ control, name: 'role' })
    const companyOptions = useMemo<CompanySelectOption[]>(
        () => companies.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
        [companies],
    )

    const submit = (values: FormValues) => {
        onSubmit({
            email: values.email.trim().toLowerCase(),
            userName: values.userName.trim(),
            firstName: values.firstName.trim(),
            lastName: values.lastName.trim(),
            jobPosition: values.jobPosition.trim(),
            password: values.password,
            role: values.role,
            ...(mode === 'create' && values.companyId
                ? { companyId: values.companyId }
                : {}),
        })
    }

    const textField = (
        name: Exclude<keyof FormValues, 'role' | 'password' | 'companyId'>,
        label: string,
        placeholder: string,
        className?: string,
    ) => (
        <FormItem
            label={label}
            invalid={Boolean(errors[name])}
            errorMessage={errors[name]?.message}
            className={className}
        >
            <Controller
                name={name}
                control={control}
                render={({ field }) => (
                    <Input placeholder={placeholder} autoComplete="off" {...field} />
                )}
            />
        </FormItem>
    )

    return (
        <FormDialog
            isOpen={isOpen}
            onClose={onClose}
            size="lg"
            title={mode === 'create' ? 'Create user' : 'Edit user'}
            description={
                mode === 'create'
                    ? 'Add a new user and assign a role.'
                    : user
                      ? `${user.userName} · ${user.email}`
                      : ''
            }
            icon={mode === 'create' ? <HiOutlineUserAdd /> : <HiOutlinePencil />}
            footer={
                <>
                    <Button type="button" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form="user-form"
                        variant="solid"
                        loading={saving}
                    >
                        {mode === 'create' ? 'Create user' : 'Save changes'}
                    </Button>
                </>
            }
        >
            <Form id="user-form" onSubmit={handleSubmit(submit)}>
                <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                    {textField('firstName', 'First name', 'First name')}
                    {textField('lastName', 'Last name', 'Last name')}
                    {textField('userName', 'Username', 'Login username')}
                    {textField('email', 'Email', 'name@company.com')}
                    {textField(
                        'jobPosition',
                        'Job position',
                        'e.g. Operations Manager',
                        'sm:col-span-2',
                    )}

                    <FormItem
                        label="Role"
                        invalid={Boolean(errors.role)}
                        errorMessage={errors.role?.message}
                        extra={
                            lockRole ? (
                                <span className="text-xs text-gray-400">
                                    You cannot change your own role.
                                </span>
                            ) : undefined
                        }
                        className={mode === 'create' ? '' : 'sm:col-span-2'}
                    >
                        <Controller
                            name="role"
                            control={control}
                            render={({ field }) => (
                                <Select<RoleOption>
                                    placeholder="Select a role"
                                    options={roleOptions}
                                    isDisabled={lockRole}
                                    value={
                                        roleOptions.find(
                                            (option) => option.value === field.value,
                                        ) ?? null
                                    }
                                    onChange={(option) =>
                                        field.onChange(option?.value)
                                    }
                                />
                            )}
                        />
                    </FormItem>

                    {mode === 'create' ? (
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
                                        placeholder="Min. 6 characters"
                                        autoComplete="new-password"
                                        {...field}
                                    />
                                )}
                            />
                        </FormItem>
                    ) : null}

                    {mode === 'create' ? (
                        <FormItem
                            label={
                                selectedRole === USER_ROLES.SUPER_ADMIN || !companyRequired
                                    ? 'Default company (optional)'
                                    : 'Default company'
                            }
                            invalid={Boolean(errors.companyId)}
                            errorMessage={errors.companyId?.message}
                            className="sm:col-span-2"
                            extra={
                                <span className="text-xs text-gray-400">
                                    More companies can be added after the user is created.
                                </span>
                            }
                        >
                            <Controller
                                name="companyId"
                                control={control}
                                render={({ field }) => (
                                    <Select<CompanySelectOption>
                                        placeholder="Select a company"
                                        isClearable
                                        options={companyOptions}
                                        value={
                                            companyOptions.find(
                                                (o) => o.value === field.value,
                                            ) ?? null
                                        }
                                        onChange={(opt) =>
                                            field.onChange(opt?.value ?? '')
                                        }
                                    />
                                )}
                            />
                        </FormItem>
                    ) : null}
                </div>
            </Form>

            {mode === 'edit' && user ? (
                <div className="mt-6 border-t border-gray-200 pt-5 dark:border-gray-700">
                    <CompanyMembershipPanel
                        userId={user.id}
                        role={user.role}
                        onChange={onMembershipChange}
                    />
                </div>
            ) : null}
        </FormDialog>
    )
}

export default UserFormDialog
