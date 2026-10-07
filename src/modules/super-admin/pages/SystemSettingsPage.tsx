'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import dayjs from 'dayjs'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Notification from '@/components/ui/Notification'
import Select from '@/components/ui/Select'
import Spinner from '@/components/ui/Spinner'
import Switcher from '@/components/ui/Switcher'
import toast from '@/components/ui/toast'
import { getRoleLabel } from '@/constants/roles.constant'
import { SUPER_ADMIN_SETTINGS_PATH } from '@/constants/route.constant'
import { invalidatePermissions } from '@/utils/hooks/usePermissions'
import {
    systemSettingsService,
    type SettingGroup,
    type SettingValue,
    type SystemSetting,
} from '../services/systemSettingsService'

const GROUPS: { key: SettingGroup; title: string; description: string }[] = [
    { key: 'general', title: 'General', description: 'System-wide availability.' },
    {
        key: 'access',
        title: 'Access / Users',
        description: 'How accounts are created and what new users receive.',
    },
    {
        key: 'features',
        title: 'Feature Toggles',
        description:
            'Switch whole modules on or off for everyone, including Super Admins. Turning a module off hides its screens only; background integrations between modules keep running.',
    },
]

type Option = { value: string; label: string }

function errorMessage(error: unknown, fallback: string) {
    if (axios.isAxiosError(error)) {
        const message = (error.response?.data as { message?: string | string[] })
            ?.message
        if (Array.isArray(message)) return message.join(' ')
        if (message) return message
    }
    return fallback
}

function notify(type: 'success' | 'danger', title: string, message: string) {
    toast.push(
        <Notification type={type} title={title}>
            {message}
        </Notification>,
        { placement: 'top-center' },
    )
}

function optionLabel(key: string, value: string) {
    return key === 'default_user_role' ? getRoleLabel(value) || value : value
}

const SettingControl = ({
    setting,
    value,
    disabled,
    onChange,
}: {
    setting: SystemSetting
    value: SettingValue
    disabled: boolean
    onChange: (value: SettingValue) => void
}) => {
    if (setting.valueType === 'boolean') {
        return (
            <Switcher
                checked={value === true}
                disabled={disabled}
                onChange={(checked) => onChange(checked)}
            />
        )
    }

    if (setting.valueType === 'number') {
        return (
            <Input
                type="number"
                size="sm"
                className="w-40"
                value={String(value)}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
            />
        )
    }

    if (setting.options?.length) {
        const options: Option[] = setting.options.map((o) => ({
            value: o,
            label: optionLabel(setting.key, o),
        }))
        return (
            <div className="w-48">
                <Select<Option>
                    size="sm"
                    options={options}
                    value={options.find((o) => o.value === value)}
                    isDisabled={disabled}
                    onChange={(opt) => opt && onChange(opt.value)}
                />
            </div>
        )
    }

    return (
        <Input
            size="sm"
            className="w-64"
            value={String(value)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
        />
    )
}

const SystemSettingsPage = () => {
    const [settings, setSettings] = useState<SystemSetting[]>([])
    const [draft, setDraft] = useState<Record<string, SettingValue>>({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)

    const apply = (rows: SystemSetting[]) => {
        setSettings(rows)
        setDraft(Object.fromEntries(rows.map((s) => [s.key, s.value])))
    }

    const load = useCallback(async () => {
        setLoading(true)
        setLoadError(null)
        try {
            apply(await systemSettingsService.list())
        } catch (error) {
            setLoadError(errorMessage(error, 'Failed to load system settings.'))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    const changes = useMemo(
        () =>
            settings
                .filter((s) => draft[s.key] !== s.value)
                .map((s) => ({ key: s.key, value: draft[s.key] })),
        [settings, draft],
    )

    const handleSave = async () => {
        const invalid = changes.find(
            (c) => typeof c.value === 'number' && !Number.isFinite(c.value),
        )
        if (invalid) {
            notify('danger', 'Save failed', `"${invalid.key}" must be a number.`)
            return
        }
        setSaving(true)
        try {
            apply(await systemSettingsService.update(changes))
            invalidatePermissions()
            notify(
                'success',
                'Settings saved',
                `${changes.length} setting${changes.length === 1 ? '' : 's'} updated.`,
            )
        } catch (error) {
            notify('danger', 'Save failed', errorMessage(error, 'Failed to save settings.'))
        } finally {
            setSaving(false)
        }
    }

    const maintenanceOn = draft.maintenance_mode === true

    return (
        <PageContainer>
            <PageHeader
                title="System Settings"
                description="Global flags and configuration. Changes apply to every company and user."
                breadcrumbs={[
                    { label: 'Super Admin Settings', href: SUPER_ADMIN_SETTINGS_PATH },
                    { label: 'System Settings' },
                ]}
                actions={
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            disabled={!changes.length || saving}
                            onClick={() => apply(settings)}
                        >
                            Reset
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            loading={saving}
                            disabled={!changes.length}
                            onClick={handleSave}
                        >
                            Save{changes.length ? ` (${changes.length})` : ''}
                        </Button>
                    </div>
                }
            />

            {loading ? (
                <div className="flex justify-center py-10">
                    <Spinner size={32} />
                </div>
            ) : loadError ? (
                <Card bordered={false} className="shadow-sm">
                    <div className="flex flex-col items-start gap-3">
                        <p className="text-sm text-red-500">{loadError}</p>
                        <Button size="sm" onClick={load}>
                            Retry
                        </Button>
                    </div>
                </Card>
            ) : (
                <div className="flex flex-col gap-4">
                    {maintenanceOn && (
                        <Alert showIcon type="warning">
                            Maintenance mode is on. Only Super Admins can sign in or use the
                            system; everyone else is sent to the maintenance page.
                        </Alert>
                    )}
                    {GROUPS.map((group) => {
                        const rows = settings
                            .filter((s) => s.group === group.key)
                            .sort((a, b) => a.sortOrder - b.sortOrder)
                        if (!rows.length) return null
                        return (
                            <Card
                                key={group.key}
                                bordered={false}
                                className="shadow-sm dark:shadow-2xl"
                            >
                                <h3 className="text-lg font-bold heading-text">{group.title}</h3>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                    {group.description}
                                </p>
                                <ul className="mt-4 flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
                                    {rows.map((setting) => {
                                        const changed = draft[setting.key] !== setting.value
                                        return (
                                            <li
                                                key={setting.key}
                                                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="font-semibold heading-text">
                                                            {setting.label}
                                                        </span>
                                                        <code className="rounded bg-gray-100 px-1.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                                                            {setting.key}
                                                        </code>
                                                        {changed && (
                                                            <span className="text-xs font-semibold text-amber-600">
                                                                Unsaved
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                                                        {setting.description}
                                                    </p>
                                                    {setting.updatedBy && setting.updatedAt && (
                                                        <p className="mt-1 text-xs text-gray-400">
                                                            Last changed by {setting.updatedBy.userName}{' '}
                                                            on {dayjs(setting.updatedAt).format('MMM D, YYYY h:mm A')}
                                                        </p>
                                                    )}
                                                </div>
                                                <SettingControl
                                                    setting={setting}
                                                    value={draft[setting.key]}
                                                    disabled={saving}
                                                    onChange={(value) =>
                                                        setDraft((prev) => ({
                                                            ...prev,
                                                            [setting.key]: value,
                                                        }))
                                                    }
                                                />
                                            </li>
                                        )
                                    })}
                                </ul>
                            </Card>
                        )
                    })}
                </div>
            )}
        </PageContainer>
    )
}

export default SystemSettingsPage
