/** Icon key — resolved via erp-icon.config.tsx */
export type ErpIconName = string

export type ErpSubmodule = {
    /** Stable identifier, e.g. "customer-master" */
    code: string
    /** Customizable display title */
    title: string
    description: string
    /** App Router path, e.g. "/modules/sd/customer-master" */
    path: string
    icon?: ErpIconName
    /** Opens path in a new tab outside the ERP shell (e.g. the /shop marketplace) */
    isExternalLink?: boolean
    /** Hub-page section this feature belongs to (children only) */
    group?: string
    /** Section label when this submodule has nested features */
    childGroupTitle?: string
    /** Nested features shown on the submodule hub page */
    children?: ErpSubmodule[]
}

export type SubmodulePathMatch = {
    module: ErpModule
    category: ErpCategory
    submodule: ErpSubmodule
    child?: ErpSubmodule
}

export type ErpCategory = {
    code: string
    /** Customizable section header, e.g. "Master Data" */
    title: string
    submodules: ErpSubmodule[]
}

export type ErpModuleCode = 'sd' | 'mm' | 'fico' | 'crm' | 'scm' | 'hcm'

export type ErpModule = {
    code: ErpModuleCode
    /** Short label shown in sidebar, e.g. "SD" */
    shortTitle: string
    /** Customizable full name, e.g. "Sales & Distribution" */
    title: string
    description: string
    /** Landing page path, e.g. "/modules/sd" — or absolute URL when isExternalLink */
    path: string
    icon: ErpIconName
    categories: ErpCategory[]
    /** Opens path in a new tab outside the ERP shell (e.g. HRIS, the /shop marketplace) */
    isExternalLink?: boolean
    /** Submodule codes pinned under this module in the sidebar for one-click access */
    sidebarShortcuts?: string[]
}

/** Flattened search result for sidebar filtering */
export type ErpNavSearchResult =
    | {
          type: 'module'
          module: ErpModule
      }
    | {
          type: 'submodule'
          module: ErpModule
          category: ErpCategory
          submodule: ErpSubmodule
      }
