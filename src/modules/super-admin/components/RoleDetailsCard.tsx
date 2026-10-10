'use client'

import { useEffect, useState } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import { FormItem } from '@/components/ui/Form'

type RoleDetailsCardProps = {
    /** A role or a role template. */
    role: { code: string; name: string; description: string; isSystem?: boolean }
    editable: boolean
    saving: boolean
    onSave: (values: { name: string; description: string }) => void
}

const RoleDetailsCard = ({
    role,
    editable,
    saving,
    onSave,
}: RoleDetailsCardProps) => {
    const [name, setName] = useState(role.name)
    const [description, setDescription] = useState(role.description)

    useEffect(() => {
        setName(role.name)
        setDescription(role.description)
    }, [role.name, role.description])

    const trimmedName = name.trim()
    const dirty =
        trimmedName !== role.name || description.trim() !== role.description

    return (
        <AdaptiveCard>
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <h4 className="heading-text">General</h4>
                <Tag className="border-0 bg-gray-100 text-xs dark:bg-gray-700">
                    {role.code}
                </Tag>
                {role.isSystem && (
                    <Tag className="border-0 bg-primary-subtle text-xs text-primary">
                        SYSTEM
                    </Tag>
                )}
            </div>
            <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                <FormItem
                    label="Name"
                    invalid={editable && !trimmedName}
                    errorMessage="Name is required"
                >
                    <Input
                        value={name}
                        maxLength={100}
                        disabled={!editable || saving}
                        onChange={(e) => setName(e.target.value)}
                    />
                </FormItem>
                <FormItem label="Description">
                    <Input
                        value={description}
                        maxLength={500}
                        disabled={!editable || saving}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </FormItem>
            </div>
            {editable && (
                <div className="flex justify-end gap-2">
                    <Button
                        size="sm"
                        disabled={!dirty || saving}
                        onClick={() => {
                            setName(role.name)
                            setDescription(role.description)
                        }}
                    >
                        Reset
                    </Button>
                    <Button
                        size="sm"
                        variant="solid"
                        loading={saving}
                        disabled={!dirty || !trimmedName}
                        onClick={() =>
                            onSave({
                                name: trimmedName,
                                description: description.trim(),
                            })
                        }
                    >
                        Save details
                    </Button>
                </div>
            )}
        </AdaptiveCard>
    )
}

export default RoleDetailsCard
