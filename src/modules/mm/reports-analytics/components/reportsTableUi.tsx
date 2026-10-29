'use client'

export function raTableRowEnterClass(index: number): string {
    const delay = Math.min(index, 14) * 40
    return [
        'group/row',
        'animate-mm-row-in motion-reduce:animate-none opacity-0',
        `[animation-delay:${delay}ms]`,
        'transition-colors duration-200',
        'hover:bg-gray-50/90 dark:hover:bg-gray-800/45',
    ].join(' ')
}

export function turnoverBadgeTone(turnover: number): 'success' | 'info' | 'warning' | 'default' {
    if (turnover >= 4) return 'success'
    if (turnover >= 1) return 'info'
    if (turnover > 0) return 'warning'
    return 'default'
}
