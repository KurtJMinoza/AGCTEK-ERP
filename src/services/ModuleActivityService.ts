import ErpAxiosBase from './axios/ErpAxiosBase'

/** New records since the signed-in user last opened each module / page. */
export type ModuleActivitySummary = {
    modules: Record<string, number>
    pages: Record<string, number>
}

export const moduleSeenKey = (moduleCode: string) => `module:${moduleCode}`

export async function apiGetModuleActivity(): Promise<ModuleActivitySummary> {
    const { data } = await ErpAxiosBase.get<ModuleActivitySummary>(
        '/module-activity/summary',
    )
    return data
}

/** Keys are module keys (`moduleSeenKey`) and registry page paths. */
export async function apiMarkModuleSeen(keys: string[]): Promise<void> {
    await ErpAxiosBase.post('/module-activity/seen', { keys })
}
