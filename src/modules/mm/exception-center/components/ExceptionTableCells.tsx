'use client'

import Link from 'next/link'
import StatusBadge from '@/components/shared/StatusBadge'
import {
    WmPartyCell,
    wmIconPopClass,
    wmTableRowEnterClass,
} from '@/modules/mm/warehouse/components/WarehouseTableCells'
import {
    HiOutlineBeaker,
    HiOutlineClipboardCheck,
    HiOutlineCube,
    HiOutlineExclamation,
    HiOutlineExternalLink,
    HiOutlineLink,
    HiOutlineOfficeBuilding,
    HiOutlineRefresh,
    HiOutlineSwitchHorizontal,
    HiOutlineTruck,
} from 'react-icons/hi'
import type { IconType } from 'react-icons'
import type { MmExceptionDomain, MmExceptionItem, MmExceptionSeverity } from '../types'

export const excTableRowEnterClass = wmTableRowEnterClass

export function excTableRowClass(item: MmExceptionItem, index: number): string {
    const base = wmTableRowEnterClass(index)
    const stale =
        item.stale
            ? 'bg-amber-50/40 dark:bg-amber-950/15 border-l-2 border-l-amber-400/70'
            : ''
    const critical =
        item.severity === 'CRITICAL'
            ? 'border-l-2 border-l-rose-500/80 dark:border-l-rose-400/70'
            : ''
    return [base, stale || critical].filter(Boolean).join(' ')
}

const SEVERITY_TONE: Record<
    MmExceptionSeverity,
    'danger' | 'warning' | 'info' | 'default'
> = {
    CRITICAL: 'danger',
    HIGH: 'warning',
    MEDIUM: 'info',
    LOW: 'default',
}

const PULSE_SEVERITIES = new Set<MmExceptionSeverity>(['CRITICAL', 'HIGH'])

const DOMAIN_META: Record<
    MmExceptionDomain,
    { label: string; Icon: IconType; tile: string; chip: string }
> = {
    procurement: {
        label: 'Procurement',
        Icon: HiOutlineTruck,
        tile: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
        chip: 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200',
    },
    receiving: {
        label: 'Receiving',
        Icon: HiOutlineClipboardCheck,
        tile: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
        chip: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200',
    },
    quality: {
        label: 'Quality',
        Icon: HiOutlineBeaker,
        tile: 'bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
        chip: 'bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-200',
    },
    inventory: {
        label: 'Inventory',
        Icon: HiOutlineCube,
        tile: 'bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light',
        chip: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    },
    warehouse: {
        label: 'Warehouse',
        Icon: HiOutlineOfficeBuilding,
        tile: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
        chip: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
    },
    inventory_control: {
        label: 'Inv. control',
        Icon: HiOutlineClipboardCheck,
        tile: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
        chip: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200',
    },
    transfers: {
        label: 'Transfers',
        Icon: HiOutlineSwitchHorizontal,
        tile: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300',
        chip: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/50 dark:text-fuchsia-200',
    },
    mrp: {
        label: 'MRP',
        Icon: HiOutlineRefresh,
        tile: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
        chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
    },
    integration: {
        label: 'Integration',
        Icon: HiOutlineLink,
        tile: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
        chip: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200',
    },
}

function domainMeta(domain: MmExceptionDomain) {
    return (
        DOMAIN_META[domain] ?? {
            label: domain.replaceAll('_', ' '),
            Icon: HiOutlineExclamation,
            tile: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
            chip: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
        }
    )
}

export function ExceptionIssueCell({ item }: { item: MmExceptionItem }) {
    const meta = domainMeta(item.domain)
    const Icon = meta.Icon
    return (
        <div className="flex min-w-0 items-start gap-2.5">
            <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.tile} ${wmIconPopClass(80)}`}
            >
                <Icon className="text-lg" />
            </span>
            <div className="min-w-0 flex-1">
                <p
                    className="truncate text-sm font-medium text-gray-900 dark:text-gray-100"
                    title={item.title}
                >
                    {item.title}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-mono text-[10px] uppercase tracking-wide text-gray-500">
                        {item.type.replaceAll('_', ' ')}
                    </span>
                    <span
                        className={`inline-flex shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide md:hidden ${meta.chip}`}
                    >
                        {meta.label}
                    </span>
                </div>
                {item.message ? (
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-500 lg:hidden">
                        {item.message}
                    </p>
                ) : null}
            </div>
        </div>
    )
}

export function ExceptionSeverityCell({ severity }: { severity: MmExceptionSeverity }) {
    const pulse = PULSE_SEVERITIES.has(severity)
    return (
        <span
            className={
                pulse
                    ? 'inline-flex animate-mm-status-pulse motion-reduce:animate-none'
                    : undefined
            }
        >
            <StatusBadge tone={SEVERITY_TONE[severity]}>{severity}</StatusBadge>
        </span>
    )
}

export function ExceptionDomainChip({ domain }: { domain: MmExceptionDomain }) {
    const meta = domainMeta(domain)
    return (
        <span
            className={`inline-flex max-w-full truncate rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.chip}`}
        >
            {meta.label}
        </span>
    )
}

export function ExceptionDocumentCell({
    document,
}: {
    document?: MmExceptionItem['document']
}) {
    const label = document?.number ?? document?.id
    if (!label) {
        return <span className="text-sm text-gray-400">—</span>
    }
    const typeHint = document?.type?.replaceAll('_', ' ')
    return (
        <div className="min-w-0">
            <span className="inline-block max-w-full truncate rounded-md bg-sky-50 px-2 py-1 font-mono text-[11px] font-semibold text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
                {label}
            </span>
            {typeHint ? (
                <p className="mt-0.5 truncate text-[10px] uppercase text-gray-400">
                    {typeHint}
                </p>
            ) : null}
        </div>
    )
}

export function fmtExceptionAge(hours: number) {
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
}

export function ExceptionAgeCell({
    ageHours,
    stale,
}: {
    ageHours: number
    stale: boolean
}) {
    return (
        <div className="min-w-[3.25rem]">
            <span
                className={`text-sm font-semibold tabular-nums ${
                    stale ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'
                }`}
            >
                {fmtExceptionAge(ageHours)}
            </span>
            {stale ? (
                <p className="text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                    Stale
                </p>
            ) : (
                <p className="text-[10px] text-gray-400">Open</p>
            )}
        </div>
    )
}

export function ExceptionOwnerCell({ owner }: { owner?: string | null }) {
    if (!owner?.trim()) {
        return <span className="text-sm text-gray-400">—</span>
    }
    return <WmPartyCell name={owner} subtitle="Owner" />
}

export function ExceptionActionCell({
    href,
    recommendedAction,
}: {
    href: string
    recommendedAction: string
}) {
    const short =
        recommendedAction.length > 36
            ? `${recommendedAction.slice(0, 36).trim()}…`
            : recommendedAction
    return (
        <Link
            href={href}
            title={recommendedAction}
            className="group/action inline-flex max-w-full items-center gap-1.5 rounded-lg border border-transparent px-2 py-1.5 text-left text-xs font-medium text-primary transition-colors hover:border-primary/20 hover:bg-primary-subtle/60 dark:hover:bg-primary/10"
        >
            <span className="truncate">{short}</span>
            <HiOutlineExternalLink className="shrink-0 text-sm opacity-70 transition-transform group-hover/action:translate-x-0.5 group-hover/action:-translate-y-0.5" />
        </Link>
    )
}
