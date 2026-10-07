import { SETTING_KEYS, SETTINGS_BY_KEY, type SettingValue } from './system-settings.catalog'
import type { SystemSettingsService } from './system-settings.service'

/** Test double returning catalog defaults, with per-key overrides. */
export function settingsStub(overrides: Record<string, SettingValue> = {}) {
    const value = (key: string) => (key in overrides ? overrides[key] : SETTINGS_BY_KEY.get(key)?.defaultValue)
    return {
        getValue: jest.fn(async (key: string) => value(key)),
        getBoolean: jest.fn(async (key: string) => value(key) === true),
        getString: jest.fn(async (key: string) => String(value(key))),
        isMaintenanceModeEnabled: jest.fn(async () => value(SETTING_KEYS.MAINTENANCE_MODE) === true),
    } as unknown as SystemSettingsService
}
