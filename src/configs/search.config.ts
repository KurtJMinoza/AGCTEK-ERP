export type SearchItem = {
    key: string
    path: string
    title: string
    icon: string
    category: string
    categoryTitle: string
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

export const recommendedSearch: SearchResultGroup[] = [
    {
        title: 'Recommended',
        data: searchablePages.slice(0, 3),
    },
]

export function searchPages(query: string): SearchResultGroup[] {
    const normalized = query.trim().toLowerCase()

    if (!normalized) {
        return recommendedSearch
    }

    const matched = searchablePages.filter((item) => {
        return (
            item.title.toLowerCase().includes(normalized) ||
            item.path.toLowerCase().includes(normalized) ||
            item.categoryTitle.toLowerCase().includes(normalized)
        )
    })

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
