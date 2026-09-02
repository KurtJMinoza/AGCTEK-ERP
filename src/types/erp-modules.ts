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
}

export type ErpCategory = {
    code: string
    /** Customizable section header, e.g. "Master Data" */
    title: string
    submodules: ErpSubmodule[]
}

export type ErpModuleCode =
    | 'sd'
    | 'mm'
    | 'fico'
    | 'crm'
    | 'scm'

export type ErpModule = {
    code: ErpModuleCode
    /** Short label shown in sidebar, e.g. "SD" */
    shortTitle: string
    /** Customizable full name, e.g. "Sales & Distribution" */
    title: string
    description: string
    /** Landing page path, e.g. "/modules/sd" */
    path: string
    icon: ErpIconName
    categories: ErpCategory[]
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