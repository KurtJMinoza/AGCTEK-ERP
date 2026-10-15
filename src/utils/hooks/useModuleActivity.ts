import { create } from 'zustand'
import type { ModuleActivitySummary } from '@/services/ModuleActivityService'

type ModuleActivityState = ModuleActivitySummary & {
    setSummary: (summary: ModuleActivitySummary) => void
    /** Optimistically hides badges the user just opened, before the server confirms. */
    clearSeen: (moduleCode: string | undefined, pagePath: string | undefined) => void
}

export const useModuleActivityStore = create<ModuleActivityState>((set) => ({
    modules: {},
    pages: {},
    setSummary: (summary) => set(summary),
    clearSeen: (moduleCode, pagePath) =>
        set((state) => ({
            modules: moduleCode
                ? { ...state.modules, [moduleCode]: 0 }
                : state.modules,
            pages: pagePath ? { ...state.pages, [pagePath]: 0 } : state.pages,
        })),
}))

/** New records in a module since the user last opened it (sidebar badge). */
export const useModuleBadgeCount = (moduleCode: string) =>
    useModuleActivityStore((state) => state.modules[moduleCode] ?? 0)

/** New records on a submodule / hub / feature page since the user last opened it. */
export const usePageBadgeCount = (path: string) =>
    useModuleActivityStore((state) => state.pages[path] ?? 0)
