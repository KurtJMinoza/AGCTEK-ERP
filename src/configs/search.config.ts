import { getResolvedErpModules } from '@/configs/erp-modules'

export type SearchItem = {
    key: string
    path: string
    title: string
    icon: string
    category: string
    categoryTitle: string
    /** Extra text included when matching search queries */
    searchText?: string
}

export type SearchResultGroup = {
    title: string
    data: SearchItem[]
}

export const searchablePages: SearchItem[] = [
    {
        key: 'home',
        path: '/home',
        title: 'Home',
        icon: 'home',
        category: 'pages',
        categoryTitle: 'Pages',
    },
    {
        key: 'activityLog',
        path: '/activity-log',
        title: 'Activity Log',
        icon: 'activityLog',
        category: 'pages',
        categoryTitle: 'Pages',
    },
    {
        key: 'profile',
        path: '/account/profile',
        title: 'Profile',
        icon: 'profile',
        category: 'account',
        categoryTitle: 'Account',
    },
    {
        key: 'settings',
        path: '/account/settings',
        title: 'Account Settings',
        icon: 'accountSettings',
        category: 'account',
        categoryTitle: 'Account',
    },
]

export function getErpSearchItems(): SearchItem[] {
    const items: SearchItem[] = []

    for (const module of getResolvedErpModules()) {
        items.push({
            key: `module-${module.code}`,
            path: module.path,
            title: module.title,
            icon: module.icon,
            category: 'erp-modules',
            categoryTitle: 'Modules',
            searchText: `${module.shortTitle} ${module.title} ${module.description}`,
        })

        for (const category of module.categories) {
            for (const submodule of category.submodules) {
                items.push({
                    key: `submodule-${module.code}-${submodule.code}`,
                    path: submodule.path,
                    title: submodule.title,
                    icon: submodule.icon || module.icon,
                    category: module.code,
                    categoryTitle: `${module.title} · ${category.title}`,
                    searchText: `${submodule.title} ${submodule.description} ${submodule.code} ${module.title} ${module.shortTitle} ${category.title}`,
                })

                for (const child of submodule.children ?? []) {
                    items.push({
                        key: `feature-${module.code}-${submodule.code}-${child.code}`,
                        path: child.path,
                        title: child.title,
                        icon: child.icon || submodule.icon || module.icon,
                        category: module.code,
                        categoryTitle: `${module.title} · ${submodule.title}`,
                        searchText: `${child.title} ${child.description} ${child.code} ${submodule.title} ${module.title} ${module.shortTitle}`,
                    })
                }
            }
        }
    }

    return items
}

const allSearchableItems: SearchItem[] = [
    ...searchablePages,
    ...getErpSearchItems(),
]

export const recommendedSearch: SearchResultGroup[] = [
    {
        title: 'Modules',
        data: getErpSearchItems().filter((item) => item.category === 'erp-modules'),
    },
    {
        title: 'Pages',
        data: searchablePages,
    },
]

function itemMatchesQuery(item: SearchItem, normalized: string): boolean {
    const haystack = [
        item.title,
        item.path,
        item.categoryTitle,
        item.searchText ?? '',
    ]
        .join(' ')
        .toLowerCase()

    return haystack.includes(normalized)
}

export function searchPages(query: string): SearchResultGroup[] {
    const normalized = query.trim().toLowerCase()

    if (!normalized) {
        return recommendedSearch
    }

    const matched = allSearchableItems.filter((item) =>
        itemMatchesQuery(item, normalized),
    )

    if (matched.length === 0) {
        return []
    }

    const grouped = new Map<string, SearchItem[]>()

    matched.forEach((item) => {
        const current = grouped.get(item.categoryTitle) || []
        current.push(item)
        grouped.set(item.categoryTitle, current)
    })

    return Array.from(grouped.entries()).map(([title, data]) => ({
        title,
        data,
    }))
}
