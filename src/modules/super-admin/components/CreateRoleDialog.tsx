'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import axios from 'axios'
import { HiOutlineDuplicate, HiOutlinePlus } from 'react-icons/hi'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Radio from '@/components/ui/Radio'
import Select from '@/components/ui/Select'
import { Form, FormItem } from '@/components/ui/Form'
import { USER_ROLES } from '@/constants/roles.constant'
import {
    apiCreateRole,
    apiCreateRoleTemplate,
    apiListRoles,
    apiListRoleTemplates,
    type RoleSummary,
    type RoleTemplateSummary,
} from '@/services/PermissionService'

const ROLE_CODE_PATTERN = /^[a-z][a-z0-9_]{1,49}$/

const schema = z
    .object({
        name: z.string().trim().min(1, 'Name is required').max(100),
        code: z
            .string()
            .trim()
            .regex(
                ROLE_CODE_PATTERN,
                '2-50 lowercase letters, digits or underscores, starting with a letter',
            ),
        description: z.string().trim().max(500),
        startFrom: z.enum(['blank', 'role', 'template']),
        sourceCode: z.string(),
    })
    .refine((d) => d.startFrom === 'blank' || Boolean(d.sourceCode), {
        path: ['sourceCode'],
        message: 'Select what to copy from',
    })

type FormValues = z.infer<typeof schema>
type SourceOption = { value: string; label: string }
type CopySource = { type: 'role' | 'template'; code: string; name: string }

function toCode(name: string) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^[^a-z]+/, '')
        .replace(/_+$/, '')
        .slice(0, 50)
}

function errorMessage(error: unknown, fallback: string) {
    if (axios.isAxiosError(error)) {
        const message = (
            error.response?.data as { message?: string | string[] }
        )?.message
        if (Array.isArray(message)) return message.join(', ')
        if (message) return message
    }
    return fallback
}

function dialogTitle(kind: 'role' | 'template', source?: CopySource | null) {
    if (kind === 'template') {
        if (source?.type === 'role') return `Save ${source.name} as template`
        if (source?.type === 'template') return `Duplicate ${source.name}`
        return 'Create template'
    }
    if (source?.type === 'role') return `Clone ${source.name}`
    if (source?.type === 'template') return `Create role from ${source.name}`
    return 'Create role'
}

type CreateRoleDialogProps = {
    isOpen: boolean
    /** Creates a role (default) or a role template. */
    kind?: 'role' | 'template'
    /** Preselects the role or template whose permissions are copied. */
    source?: CopySource | null
    onClose: () => void
    onCreated: (created: { code: string; name: string }) => void
}

const CreateRoleDialog = ({
    isOpen,
    kind = 'role',
    source,
    onClose,
    onCreated,
}: CreateRoleDialogProps) => {
    const [roles, setRoles] = useState<RoleSummary[]>([])
    const [templates, setTemplates] = useState<RoleTemplateSummary[]>([])
    const [saving, setSaving] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const codeEdited = useRef(false)
    const noun = kind === 'template' ? 'Template' : 'Role'

    const {
        control,
        handleSubmit,
        reset,
        setValue,
        formState: { errors },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            name: '',
            code: '',
            description: '',
            startFrom: 'blank',
            sourceCode: '',
        },
    })

    useEffect(() => {
        if (!isOpen) return
        codeEdited.current = false
        setSubmitError(null)
        const suffix =
            kind === 'template' && source?.type === 'role' ? 'template' : 'copy'
        reset({
            name: source ? `${source.name} (${suffix})` : '',
            code: source ? toCode(`${source.code}_${suffix}`) : '',
            description: '',
            startFrom: source?.type ?? 'blank',
            sourceCode: source?.code ?? '',
        })
        apiListRoles()
            .then(setRoles)
            .catch(() => setRoles([]))
        apiListRoleTemplates()
            .then(setTemplates)
            .catch(() => setTemplates([]))
    }, [isOpen, kind, source, reset])

    const startFrom = useWatch({ control, name: 'startFrom' })
    const sourceOptions = useMemo<SourceOption[]>(() => {
        const list =
            startFrom === 'template'
                ? templates
                : roles.filter((r) => r.code !== USER_ROLES.SUPER_ADMIN)
        return list.map((s) => ({
            value: s.code,
            label: `${s.name} (${s.code})`,
        }))
    }, [startFrom, roles, templates])

    const submit = async (values: FormValues) => {
        setSaving(true)
        setSubmitError(null)
        const fromRole =
            values.startFrom === 'role' ? values.sourceCode : undefined
        const fromTemplate =
            values.startFrom === 'template' ? values.sourceCode : undefined
        const base = {
            code: values.code,
            name: values.name,
            description: values.description || undefined,
        }
        try {
            const created =
                kind === 'template'
                    ? await apiCreateRoleTemplate({
                          ...base,
                          fromRole,
                          fromTemplate,
                      })
                    : await apiCreateRole({
                          ...base,
                          copyFrom: fromRole,
                          copyFromTemplate: fromTemplate,
                      })
            onCreated(created)
        } catch (error) {
            setSubmitError(
                errorMessage(error, `Unable to create the ${noun.toLowerCase()}.`),
            )
        } finally {
            setSaving(false)
        }
    }

    return (
        <FormDialog
            isOpen={isOpen}
            onClose={onClose}
            title={dialogTitle(kind, source)}
            description={
                kind === 'template'
                    ? 'Templates are only used to create or configure roles and never grant access. Permissions are copied once, with no link back to the source.'
                    : 'Permissions are copied once. The new role is independent of the role or template it was copied from.'
            }
            icon={source ? <HiOutlineDuplicate /> : <HiOutlinePlus />}
            footer={
                <>
                    <Button type="button" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form="create-role-form"
                        variant="solid"
                        loading={saving}
                    >
                        Create {noun.toLowerCase()}
                    </Button>
                </>
            }
        >
            <Form id="create-role-form" onSubmit={handleSubmit(submit)}>
                <FormItem
                    label={`${noun} name`}
                    invalid={Boolean(errors.name)}
                    errorMessage={errors.name?.message}
                >
                    <Controller
                        name="name"
                        control={control}
                        render={({ field }) => (
                            <Input
                                placeholder={
                                    kind === 'template'
                                        ? 'e.g. Warehouse Staff'
                                        : 'e.g. Warehouse Supervisor'
                                }
                                autoComplete="off"
                                {...field}
                                onChange={(e) => {
                                    field.onChange(e)
                                    if (!codeEdited.current) {
                                        setValue(
                                            'code',
                                            toCode(e.target.value),
                                            { shouldValidate: false },
                                        )
                                    }
                                }}
                            />
                        )}
                    />
                </FormItem>
                <FormItem
                    label={`${noun} code`}
                    invalid={Boolean(errors.code)}
                    errorMessage={errors.code?.message}
                    extra={
                        <span className="text-xs text-gray-400">
                            Cannot be changed later.
                        </span>
                    }
                >
                    <Controller
                        name="code"
                        control={control}
                        render={({ field }) => (
                            <Input
                                placeholder={
                                    kind === 'template'
                                        ? 'e.g. warehouse_staff'
                                        : 'e.g. warehouse_supervisor'
                                }
                                autoComplete="off"
                                {...field}
                                onChange={(e) => {
                                    codeEdited.current = true
                                    field.onChange(e.target.value.toLowerCase())
                                }}
                            />
                        )}
                    />
                </FormItem>
                <FormItem
                    label="Description"
                    invalid={Boolean(errors.description)}
                    errorMessage={errors.description?.message}
                >
                    <Controller
                        name="description"
                        control={control}
                        render={({ field }) => (
                            <Input
                                textArea
                                rows={2}
                                placeholder={`What this ${noun.toLowerCase()} is for`}
                                {...field}
                            />
                        )}
                    />
                </FormItem>
                <FormItem label="Start from">
                    <Controller
                        name="startFrom"
                        control={control}
                        render={({ field }) => (
                            <Radio.Group
                                vertical
                                value={field.value}
                                onChange={(value) => {
                                    field.onChange(value)
                                    setValue('sourceCode', '')
                                }}
                            >
                                <Radio value="blank">
                                    Blank (no permissions)
                                </Radio>
                                <Radio value="role">Existing role</Radio>
                                <Radio value="template">Role template</Radio>
                            </Radio.Group>
                        )}
                    />
                </FormItem>
                {startFrom !== 'blank' && (
                    <FormItem
                        label="Copy permissions from"
                        invalid={Boolean(errors.sourceCode)}
                        errorMessage={errors.sourceCode?.message}
                    >
                        <Controller
                            name="sourceCode"
                            control={control}
                            render={({ field }) => (
                                <Select<SourceOption>
                                    placeholder={
                                        startFrom === 'template'
                                            ? 'Select a template'
                                            : 'Select a role'
                                    }
                                    options={sourceOptions}
                                    value={
                                        sourceOptions.find(
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
                )}
                {submitError && (
                    <p className="text-sm text-red-500">{submitError}</p>
                )}
            </Form>
        </FormDialog>
    )
}

export default CreateRoleDialog
